// Everything this app does with the Firebase side of the subscription
// backend, in one file: reading the entitlement out of the cached ID
// token, watching the users/{uid} document, and calling the
// verifyGooglePurchase callable.
//
// Kept separate from contexts/SubscriptionContext.tsx so the React state
// machine has no Firebase imports of its own, and from
// utils/subscription.ts so the tier rules stay testable without a device.

import {
  getAuth,
  getIdTokenResult,
  type User as FirebaseUser,
} from '@react-native-firebase/auth';
import {
  getFirestore,
  doc,
  onSnapshot,
  getDoc,
} from '@react-native-firebase/firestore';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import { FUNCTIONS_REGION } from '../config/entitlements';
import {
  normalizeBackendTier,
  toEpochMs,
  type BackendTier,
  type PurchaseStore,
  type SubscriptionSnapshot,
} from '../utils/subscription';

// ---------------------------------------------------------------------
// Custom claims — the offline path
// ---------------------------------------------------------------------

// This is the read that makes the app work on a plane. syncTierToClaims
// mirrors users/{uid}.tier into the Auth custom claims, and the Firebase
// SDK persists the last ID token on-device, so decoding the cached token
// gives a real entitlement answer with no network at all. Pass
// forceRefresh only when the answer is expected to have just changed
// (right after a verified purchase, or when the user taps Refresh) —
// a forced refresh is a network call and fails offline, which is exactly
// what we are trying to avoid on a normal launch.
export async function readClaimsSnapshot(
  forceRefresh = false,
): Promise<SubscriptionSnapshot | null> {
  const user: FirebaseUser | null = getAuth().currentUser;
  if (!user) {
    return null;
  }
  const result = await getIdTokenResult(user, forceRefresh);
  const claims = result.claims as Record<string, unknown>;
  const tier: BackendTier = normalizeBackendTier(claims.tier);
  return {
    tier,
    // Claims carry only tier and expiryDate (see syncTierToClaims) — the
    // store and lastVerifiedAt live in Firestore. Reporting them as null
    // rather than guessing keeps the Account screen honest about what it
    // actually knows while offline.
    store: null,
    expiryDate: toEpochMs(claims.expiryDate),
    lastVerifiedAt: null,
    source: 'claims',
  };
}

// A claims refresh only tells the truth once the Firestore write has
// propagated through syncTierToClaims (a Firestore trigger, so it is
// eventually consistent by design, typically a second or two). Rather
// than refreshing once and hoping, poll a few times for the tier we
// expect. Resolves with whatever the last read said even if the expected
// tier never appeared — the caller decides what to do about that, and
// the Firestore listener will correct it shortly afterwards regardless.
export async function refreshClaimsUntilTier(
  expected: BackendTier,
  attempts = 5,
  delayMs = 1200,
): Promise<SubscriptionSnapshot | null> {
  let latest: SubscriptionSnapshot | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    latest = await readClaimsSnapshot(true);
    if (latest?.tier === expected) {
      return latest;
    }
    if (attempt < attempts - 1) {
      await new Promise<void>(resolve => setTimeout(resolve, delayMs));
    }
  }
  console.warn(
    `[subscriptionClient] Claims never reported the expected tier "${expected}" after ${attempts} refreshes — the Firestore document is the authority and the listener will correct this.`,
  );
  return latest;
}

// ---------------------------------------------------------------------
// Firestore users/{uid} — the live path
// ---------------------------------------------------------------------

function snapshotFromDocumentData(
  data: Record<string, unknown> | undefined,
): SubscriptionSnapshot {
  if (!data) {
    // No document yet is a real, normal state: the backend only creates
    // users/{uid} on the first verification, so a signed-in user who has
    // never purchased has nothing here. That is 'free', not an error.
    return {
      tier: 'free',
      store: null,
      expiryDate: null,
      lastVerifiedAt: null,
      source: 'firestore',
    };
  }
  const store = data.store;
  return {
    tier: normalizeBackendTier(data.tier),
    store:
      store === 'google_play' || store === 'app_store'
        ? (store as PurchaseStore)
        : null,
    expiryDate: toEpochMs(data.expiryDate),
    lastVerifiedAt: toEpochMs(data.lastVerifiedAt),
    source: 'firestore',
  };
}

// Live subscription to the user's own entitlement document. Security
// rules allow a client to read only its own users/{uid} doc and to write
// nothing at all, so this listener is read-only by construction.
//
// Returns the unsubscribe function. onError is called rather than thrown:
// losing this listener (offline, permission error) must never take the
// app down, because the claims snapshot is still a valid answer.
export function subscribeToUserDocument(
  uid: string,
  onNext: (snapshot: SubscriptionSnapshot) => void,
  onError: (error: Error) => void,
): () => void {
  const reference = doc(getFirestore(), 'users', uid);
  return onSnapshot(
    reference,
    documentSnapshot => {
      onNext(
        snapshotFromDocumentData(
          documentSnapshot.data() as Record<string, unknown> | undefined,
        ),
      );
    },
    error => {
      console.error('[subscriptionClient] users/{uid} listener failed:', error);
      onError(error as Error);
    },
  );
}

export async function readUserDocumentOnce(
  uid: string,
): Promise<SubscriptionSnapshot> {
  const documentSnapshot = await getDoc(doc(getFirestore(), 'users', uid));
  return snapshotFromDocumentData(
    documentSnapshot.data() as Record<string, unknown> | undefined,
  );
}

// ---------------------------------------------------------------------
// verifyGooglePurchase callable
// ---------------------------------------------------------------------

export type VerifyPurchaseRequest = {
  purchaseToken: string;
  productId: string;
  isSubscription: boolean;
};

export type VerifyPurchaseResponse = {
  tier: BackendTier;
  // The callable returns whatever it wrote to Firestore; expiryDate is
  // serialized over the wire, so it arrives as a string/number rather
  // than a Firestore timestamp. toEpochMs handles every shape.
  expiryDate: unknown;
};

export async function verifyGooglePurchase(
  request: VerifyPurchaseRequest,
): Promise<{ tier: BackendTier; expiryDate: number | null }> {
  const functions = getFunctions(undefined, FUNCTIONS_REGION);
  const callable = httpsCallable<VerifyPurchaseRequest, VerifyPurchaseResponse>(
    functions,
    'verifyGooglePurchase',
  );
  const result = await callable(request);
  const data = result.data;
  return {
    tier: normalizeBackendTier(data?.tier),
    expiryDate: toEpochMs(data?.expiryDate),
  };
}

// The callable throws HttpsError with codes the backend chose
// deliberately (unauthenticated / failed-precondition / internal).
// Translating them here — once — keeps every call site from inventing its
// own wording for the same three situations, and keeps raw Firebase error
// strings out of the UI.
export function describeVerificationError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? '';
  if (code.includes('unauthenticated')) {
    return 'You need to be signed in to finish this purchase. Sign in and tap Restore purchases — you will not be charged again.';
  }
  if (code.includes('failed-precondition')) {
    return 'Google Play did not confirm this purchase as active. If you were charged, tap Restore purchases in a few minutes.';
  }
  if (code.includes('not-found')) {
    return 'The purchase service is unavailable right now. Your purchase is safe with Google Play — tap Restore purchases later to finish activating it.';
  }
  if (code.includes('unavailable') || code.includes('deadline-exceeded')) {
    return 'Could not reach the purchase service. Check your connection and tap Restore purchases — you will not be charged again.';
  }
  return error instanceof Error
    ? error.message
    : 'Could not verify the purchase.';
}
