import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Linking, Platform } from 'react-native';
import { useAuth } from './AuthContext';
import {
  PLANS,
  planById,
  playSubscriptionUrl,
  type PlanId,
} from '../config/entitlements';
import {
  describeVerificationError,
  readClaimsSnapshot,
  refreshClaimsUntilTier,
  readUserDocumentOnce,
  subscribeToUserDocument,
  verifyGooglePurchase,
} from '../services/subscriptionClient';
import {
  getBillingAdapter,
  BillingCancelledError,
  type BillingProduct,
  type BillingPurchase,
} from '../services/billing';
import {
  isEntitled as computeIsEntitled,
  SIGNED_OUT_SNAPSHOT,
  statusKind,
  type SubscriptionSnapshot,
  type SubscriptionStatusKind,
} from '../utils/subscription';

// Owns the app's answer to "what has this person paid for", and the flow
// that changes that answer.
//
// Two sources feed one snapshot, on purpose:
//   • custom claims on the cached Firebase ID token — works fully
//     offline, which is the whole reason the backend mirrors tier into
//     claims at all. This is what a launch with no network reads.
//   • the users/{uid} Firestore document — authoritative and live, but
//     only when online. It arrives after claims and overwrites them.
// A Firestore answer always wins over a claims answer, because a
// Firestore write is what produces the claims in the first place (via
// syncTierToClaims) and is therefore never behind them.
//
// This provider must sit INSIDE AuthProvider (it reads the session) and
// OUTSIDE EntitlementProvider (which derives free/premium from it).

export type PurchasePhase = 'idle' | 'purchasing' | 'verifying';

export type PurchaseActivity = {
  planId: PlanId;
  phase: PurchasePhase;
};

type SubscriptionContextValue = {
  snapshot: SubscriptionSnapshot;
  // The single gate every premium feature ultimately hangs off.
  isEntitled: boolean;
  status: SubscriptionStatusKind;
  // True until the first entitlement answer of any kind exists. Screens
  // should show a spinner rather than "Free" during this — flashing the
  // free plan at a paying subscriber on every cold start is the kind of
  // detail that generates support mail.
  isResolving: boolean;

  products: BillingProduct[];
  productForPlan: (planId: PlanId) => BillingProduct | null;
  isLoadingProducts: boolean;
  // False for the stub adapter (no IAP library in the build yet).
  canPurchase: boolean;

  purchaseActivity: PurchaseActivity | null;
  isRestoring: boolean;
  isRefreshing: boolean;
  lastError: string | null;
  clearError: () => void;

  // Resolves true when the purchase completed AND the backend confirmed
  // it. A user cancel resolves false without setting an error — backing
  // out of a payment sheet is a decision, not a failure.
  purchase: (planId: PlanId) => Promise<boolean>;
  // Re-verifies every purchase the store says this account owns. Also
  // the recovery path for a purchase whose verification never finished.
  restorePurchases: () => Promise<boolean>;
  refresh: () => Promise<void>;
  openManageSubscription: () => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(
  null,
);

export function SubscriptionProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const { session, isSignedIn, isInitializing: isAuthInitializing } = useAuth();
  const uid = session?.uid ?? null;

  const [snapshot, setSnapshot] =
    useState<SubscriptionSnapshot>(SIGNED_OUT_SNAPSHOT);
  const [isResolving, setIsResolving] = useState(true);
  const [products, setProducts] = useState<BillingProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [purchaseActivity, setPurchaseActivity] =
    useState<PurchaseActivity | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const billing = getBillingAdapter();
  // Guards against a late async result from a previous session landing on
  // top of the current one — sign out and back in as a different account
  // and the first account's claims read could otherwise still resolve.
  const activeUidRef = useRef<string | null>(null);
  activeUidRef.current = uid;

  const applyIfCurrent = useCallback(
    (forUid: string | null, next: SubscriptionSnapshot) => {
      if (activeUidRef.current !== forUid) {
        return;
      }
      setSnapshot(previous => {
        // Never let a claims read overwrite a Firestore answer: claims
        // are derived from the document and can only ever be equal to or
        // staler than it.
        if (previous.source === 'firestore' && next.source === 'claims') {
          return previous;
        }
        return next;
      });
      setIsResolving(false);
    },
    [],
  );

  // ------------------------------------------------------------------
  // Source 1: cached ID token claims (offline-capable, runs first)
  // ------------------------------------------------------------------
  useEffect(() => {
    if (isAuthInitializing) {
      return;
    }
    if (!uid) {
      setSnapshot(SIGNED_OUT_SNAPSHOT);
      setIsResolving(false);
      return;
    }
    let cancelled = false;
    setIsResolving(true);
    (async () => {
      try {
        const claims = await readClaimsSnapshot(false);
        if (!cancelled && claims) {
          applyIfCurrent(uid, claims);
        }
      } catch (error) {
        // Not fatal and not worth surfacing: the Firestore listener below
        // is still coming, and a signed-in user with an unreadable token
        // is about to be signed out by Firebase anyway.
        console.error('[SubscriptionContext] claims read failed:', error);
        if (!cancelled) {
          setIsResolving(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, isAuthInitializing, applyIfCurrent]);

  // ------------------------------------------------------------------
  // Source 2: live users/{uid} document (authoritative when online)
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!uid) {
      return;
    }
    const unsubscribe = subscribeToUserDocument(
      uid,
      next => applyIfCurrent(uid, next),
      () => {
        // Losing the listener is survivable — whatever the claims read
        // produced stays on screen. Deliberately not written to
        // lastError: that field drives user-facing purchase messaging,
        // and "your entitlement listener dropped" is not something a user
        // can act on or should see.
        setIsResolving(false);
      },
    );
    return unsubscribe;
  }, [uid, applyIfCurrent]);

  // ------------------------------------------------------------------
  // Store products
  // ------------------------------------------------------------------
  const loadProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    try {
      await billing.initialize();
      const fetched = await billing.getProducts();
      setProducts(fetched);
    } catch (error) {
      console.error('[SubscriptionContext] getProducts failed:', error);
      setProducts([]);
    } finally {
      setIsLoadingProducts(false);
    }
  }, [billing]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const productForPlan = useCallback(
    (planId: PlanId): BillingProduct | null =>
      products.find(product => product.planId === planId) ?? null,
    [products],
  );

  // ------------------------------------------------------------------
  // Verification — shared by purchase() and restorePurchases()
  // ------------------------------------------------------------------
  const verifyAndFinish = useCallback(
    async (purchase: BillingPurchase, expectPlanId?: PlanId) => {
      const result = await verifyGooglePurchase({
        purchaseToken: purchase.purchaseToken,
        productId: purchase.productId,
        isSubscription: purchase.isSubscription,
      });

      // Acknowledge only after the backend has recorded the entitlement.
      // Google Play auto-refunds an unacknowledged subscription after
      // three days, so the ordering here is the difference between a
      // subscriber who keeps their subscription and one who silently
      // loses it — do not move this above the verify call.
      await billing.finishPurchase(purchase);

      if (expectPlanId) {
        const expected = planById(expectPlanId).expectedTier;
        if (result.tier !== expected) {
          // Not thrown: the backend is the authority and it has already
          // written whatever it wrote. This is a loud signal that the
          // product IDs in config/entitlements.ts and the ones the Cloud
          // Function maps to tiers have drifted apart.
          console.warn(
            `[SubscriptionContext] Verified purchase of ${purchase.productId} returned tier "${result.tier}", expected "${expected}" — check PRODUCT_IDS against the Cloud Function's tier mapping.`,
          );
        }
      }

      // The Firestore listener will deliver the authoritative snapshot on
      // its own. Refreshing claims as well matters because the ID token
      // is what keeps the entitlement working offline — without this, a
      // user who buys premium and immediately goes offline would be back
      // to free until the next token refresh, up to an hour later.
      const claims = await refreshClaimsUntilTier(result.tier);
      if (claims) {
        applyIfCurrent(activeUidRef.current, {
          ...claims,
          // Keep the just-verified values rather than whatever the token
          // happened to carry, so the UI is correct even if the claims
          // mirror is still catching up.
          tier: result.tier,
          expiryDate: result.expiryDate,
        });
      }
      return result;
    },
    [billing, applyIfCurrent],
  );

  const purchase = useCallback(
    async (planId: PlanId): Promise<boolean> => {
      setLastError(null);

      if (!isSignedIn) {
        // verifyGooglePurchase throws unauthenticated without a uid, and
        // a purchase made while signed out has nowhere to be recorded —
        // so this is blocked before any money moves, not after.
        setLastError(
          'Sign in first so your subscription is tied to your account and follows you to a new device.',
        );
        return false;
      }

      setPurchaseActivity({ planId, phase: 'purchasing' });
      try {
        const storePurchase = await billing.purchase(planId);
        setPurchaseActivity({ planId, phase: 'verifying' });
        await verifyAndFinish(storePurchase, planId);
        return true;
      } catch (error) {
        if (error instanceof BillingCancelledError) {
          // Backing out of the payment sheet is a normal choice. No
          // error message, no red text — nothing happened.
          return false;
        }
        console.error('[SubscriptionContext] purchase failed:', error);
        setLastError(describeVerificationError(error));
        return false;
      } finally {
        setPurchaseActivity(null);
      }
    },
    [billing, isSignedIn, verifyAndFinish],
  );

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    setLastError(null);
    if (!isSignedIn) {
      setLastError('Sign in to restore a purchase made on this account.');
      return false;
    }
    setIsRestoring(true);
    try {
      const owned = await billing.getAvailablePurchases();
      if (owned.length === 0) {
        // Also re-read the backend before concluding nothing is owned:
        // an entitlement can exist server-side (bought on another device,
        // or a verification that completed after the store forgot about
        // the pending purchase) with nothing left in the local store
        // queue to restore.
        const current = activeUidRef.current;
        if (current) {
          const fromServer = await readUserDocumentOnce(current);
          applyIfCurrent(current, fromServer);
          return fromServer.tier !== 'free';
        }
        return false;
      }
      for (const owned_ of owned) {
        await verifyAndFinish(owned_);
      }
      return true;
    } catch (error) {
      console.error('[SubscriptionContext] restore failed:', error);
      setLastError(describeVerificationError(error));
      return false;
    } finally {
      setIsRestoring(false);
    }
  }, [billing, isSignedIn, verifyAndFinish, applyIfCurrent]);

  const refresh = useCallback(async (): Promise<void> => {
    const current = activeUidRef.current;
    if (!current) {
      return;
    }
    setIsRefreshing(true);
    try {
      // Document first (authoritative), then a forced token refresh so
      // the offline copy matches what we just read.
      const fromServer = await readUserDocumentOnce(current);
      applyIfCurrent(current, fromServer);
      await readClaimsSnapshot(true);
    } catch (error) {
      console.error('[SubscriptionContext] refresh failed:', error);
      setLastError(
        'Could not check your subscription. Check your connection and try again.',
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [applyIfCurrent]);

  const openManageSubscription = useCallback(async (): Promise<void> => {
    if (Platform.OS !== 'android') {
      return;
    }
    const productId =
      PLANS.find(plan => plan.expectedTier === snapshot.tier)?.productId ??
      null;
    const url = playSubscriptionUrl(productId);
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.error('[SubscriptionContext] openManageSubscription failed:', error);
      setLastError('Could not open Google Play.');
    }
  }, [snapshot.tier]);

  const clearError = useCallback(() => setLastError(null), []);

  const value = useMemo<SubscriptionContextValue>(() => {
    const now = Date.now();
    return {
      snapshot,
      isEntitled: computeIsEntitled(snapshot, now),
      status: statusKind(snapshot, now),
      isResolving: isResolving || isAuthInitializing,
      products,
      productForPlan,
      isLoadingProducts,
      canPurchase: billing.isAvailable,
      purchaseActivity,
      isRestoring,
      isRefreshing,
      lastError,
      clearError,
      purchase,
      restorePurchases,
      refresh,
      openManageSubscription,
    };
  }, [
    snapshot,
    isResolving,
    isAuthInitializing,
    products,
    productForPlan,
    isLoadingProducts,
    billing.isAvailable,
    purchaseActivity,
    isRestoring,
    isRefreshing,
    lastError,
    clearError,
    purchase,
    restorePurchases,
    refresh,
    openManageSubscription,
  ]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error(
      'useSubscription must be used within a SubscriptionProvider',
    );
  }
  return context;
}
