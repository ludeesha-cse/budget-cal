// The seam between this app and a real in-app-purchase library.
//
// Nothing above this interface knows that Google Play Billing exists, and
// nothing below it knows that Firebase exists. That split is the whole
// point: the purchase flow (paywall UI -> adapter -> verifyGooglePurchase
// -> claims refresh) is built, wired and testable now, and switching from
// the stub to a real library later is one new file plus one line in
// services/billing/index.ts — no screen changes, no context changes.

import type { PlanId } from '../../config/entitlements';

export type BillingProduct = {
  planId: PlanId;
  productId: string;
  // Already localized and currency-formatted BY THE STORE — display it
  // verbatim, never reformat it. The store knows the user's country,
  // their currency, and any regional pricing; anything this app computed
  // itself would be a guess that is wrong somewhere.
  priceText: string;
  // Micro-units of the price in `currencyCode`, as the store reports it.
  // Only for comparing plans against each other (the yearly saving
  // badge) — never for display.
  priceAmountMicros: number | null;
  currencyCode: string | null;
  title: string | null;
  description: string | null;
};

// What a completed store purchase gives us. These two fields are exactly
// what verifyGooglePurchase needs; anything else the library returns
// stays below this seam.
export type BillingPurchase = {
  purchaseToken: string;
  productId: string;
  isSubscription: boolean;
};

export class BillingUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingUnavailableError';
  }
}

export class BillingCancelledError extends Error {
  constructor(message = 'Purchase cancelled.') {
    super(message);
    this.name = 'BillingCancelledError';
  }
}

export type BillingAdapter = {
  // Human-readable name for logs and the dev-only status line.
  readonly name: string;
  // False for the stub. The UI uses this to say "purchases aren't
  // available in this build yet" instead of showing a Buy button that
  // cannot work — an honest disabled state beats a button that fails.
  readonly isAvailable: boolean;

  // Connect to the store. Safe to call more than once.
  initialize(): Promise<void>;

  // Localized prices for the plans in config/entitlements.ts PLANS.
  // May return fewer than requested if a product isn't set up in the
  // store console yet — callers must handle a missing plan rather than
  // assuming all three come back.
  getProducts(): Promise<BillingProduct[]>;

  // Launch the store's purchase sheet and resolve once the user has
  // completed it. Rejects with BillingCancelledError if they back out —
  // that is a normal outcome, not a failure to report as an error.
  purchase(planId: PlanId): Promise<BillingPurchase>;

  // Every purchase this account already owns, for "Restore purchases"
  // and for finishing a purchase whose verification did not complete
  // (app killed mid-flow, network dropped after payment).
  getAvailablePurchases(): Promise<BillingPurchase[]>;

  // Tell the store the purchase has been granted. MUST be called only
  // after the backend has verified and recorded it: Google Play
  // automatically refunds a subscription that is never acknowledged
  // within three days, so acknowledging before verification risks
  // keeping money for an entitlement we never granted, and never
  // acknowledging risks refunding a subscriber who is using the app.
  finishPurchase(purchase: BillingPurchase): Promise<void>;

  dispose(): Promise<void>;
};
