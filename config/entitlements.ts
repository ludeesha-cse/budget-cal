// Entitlement configuration: the free-tier limits the app enforces
// locally, and the product/plan catalog it asks the store about.
//
// The tier itself is no longer configured here. It now comes from the
// signed-in user's Firebase entitlement — custom claims on the cached ID
// token (offline-capable) reconciled against the users/{uid} Firestore
// document when online. See contexts/SubscriptionContext.tsx for the
// state, services/subscriptionClient.ts for the Firebase calls, and
// utils/subscription.ts for what each tier means.
//
// hooks/useEntitlement.ts still exposes a __DEV__-only override (see
// SettingsHomeScreen) for exercising both tiers without a real purchase.

import type { BackendTier } from '../utils/subscription';

export const FREE_TIER_LIMITS = {
  accountsPerType: 1,
  userCategories: 5,
  activeCurrencies: 1,
} as const;

// Account types a free user may create at all. Anything absent from this
// list (CreditCard, Receivable, Liability) is premium-only regardless of
// how many the user already has — canAddAccount() checks this before it
// ever looks at a count.
export const FREE_ACCOUNT_TYPES = ['Bank', 'Cash', 'CryptoWallet'];

// How long past a subscription's stored expiry the app keeps honouring
// it. This is not generosity — it is the window in which "expired" and
// "renewed, but this device hasn't been told yet" are indistinguishable
// from the client's point of view: a renewal Google has already charged
// for takes time to reach a refreshed ID token, and an offline device may
// be holding a token minted before the renewal happened at all. Cutting a
// paying subscriber off at the exact expiry millisecond would be a bug
// they experience as theft. A genuine lapse is pushed through by the
// backend's daily reconciliation writing tier -> 'free', which this
// window has no effect on. See utils/subscription.ts isEntitled().
export const ENTITLEMENT_GRACE_DAYS = 3;

// ---------------------------------------------------------------------
// Store product catalog
// ---------------------------------------------------------------------

export type PlanId = 'monthly' | 'yearly' | 'lifetime';

// TODO(store): these must match the product IDs actually created in the
// Google Play Console for this app. They are also what the backend's
// verifyGooglePurchase reads to decide which tier to grant, so a mismatch
// here silently downgrades a real purchase to 'free' — check both sides
// together, never one alone.
export const PRODUCT_IDS: Record<PlanId, string> = {
  monthly: 'premium_monthly',
  yearly: 'premium_yearly',
  lifetime: 'premium_lifetime',
};

export type PlanDefinition = {
  id: PlanId;
  productId: string;
  label: string;
  // Subscriptions go through purchases.subscriptionsv2 on the backend;
  // lifetime is a one-time product and goes through purchases.products.
  // The client has to say which, because the callable takes it as input.
  isSubscription: boolean;
  // Which backend tier a successful purchase of this plan should produce.
  // Used only to sanity-check what the callable returns — the backend
  // remains the authority, this just catches a catalog mismatch loudly
  // instead of leaving the user on 'free' with no explanation.
  expectedTier: BackendTier;
  // Shown when the store hasn't returned a localized price yet. Never a
  // realistic-looking number on purpose, so a placeholder can't be
  // mistaken for a real price in a screenshot or a bug report.
  fallbackPriceText: string;
};

export const PLANS: PlanDefinition[] = [
  {
    id: 'monthly',
    productId: PRODUCT_IDS.monthly,
    label: 'Monthly',
    isSubscription: true,
    expectedTier: 'premium_monthly',
    fallbackPriceText: 'Price unavailable',
  },
  {
    id: 'yearly',
    productId: PRODUCT_IDS.yearly,
    label: 'Yearly',
    isSubscription: true,
    expectedTier: 'premium_yearly',
    fallbackPriceText: 'Price unavailable',
  },
  {
    id: 'lifetime',
    productId: PRODUCT_IDS.lifetime,
    label: 'Lifetime',
    isSubscription: false,
    expectedTier: 'premium_lifetime',
    fallbackPriceText: 'Price unavailable',
  },
];

export function planById(id: PlanId): PlanDefinition {
  const found = PLANS.find(plan => plan.id === id);
  if (!found) {
    throw new Error(`Unknown plan id: ${id}`);
  }
  return found;
}

// Region the callable Cloud Functions are deployed to.
//
// TODO(backend): currently us-central1, which is the Firebase default and
// what verifyGooglePurchase actually deploys to today. There is an open
// item to pin every function (and Firestore, in asia-south1) to one
// region — when that happens, this constant is the only thing the client
// needs to change, and it MUST change in the same release or every
// purchase verification starts failing with "not-found".
export const FUNCTIONS_REGION = 'us-central1';

// This app's own Android applicationId, from android/app/build.gradle.
// Duplicated here because there is no native constant to read it from
// without adding a module, and the Play deep link below needs it.

export const APP_PACKAGE_NAME = 'com.penny_worth.app';

// Deep link to the Play Store's subscription management screen. Without
// the package/sku parameters Play opens the generic subscription list;
// with them it opens this app's subscription directly.
export const PLAY_SUBSCRIPTIONS_URL =
  'https://play.google.com/store/account/subscriptions';

export function playSubscriptionUrl(productId?: string | null): string {
  return productId
    ? `${PLAY_SUBSCRIPTIONS_URL}?sku=${encodeURIComponent(
        productId,
      )}&package=${encodeURIComponent(APP_PACKAGE_NAME)}`
    : PLAY_SUBSCRIPTIONS_URL;
}
