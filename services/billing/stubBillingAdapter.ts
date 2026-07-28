// STUB — there is no in-app purchase library in this app yet.
//
// This adapter exists so the entire purchase pipeline above it is real
// code running on real state: the paywall renders plan cards, the sign-in
// gate works, errors surface where they will surface for real, and the
// verify -> refresh-claims -> unlock path is exercised. The only thing
// that is not real is the payment itself.
//
// To make purchases real:
//   1. npm install react-native-iap (or another billing library) and
//      rebuild the Android app — it is a native module.
//   2. Add services/billing/playBillingAdapter.ts implementing
//      BillingAdapter against it.
//   3. Change the one line in services/billing/index.ts.
// Nothing else in the app should need to change. If it does, something
// has reached through this seam and that is the bug.

import type { PlanId } from '../../config/entitlements';
import {
  BillingUnavailableError,
  type BillingAdapter,
  type BillingProduct,
  type BillingPurchase,
} from './types';

const UNAVAILABLE_MESSAGE =
  'Purchases are not available in this build yet. The subscription backend is ready — the in-app purchase library still needs to be added and the app rebuilt.';

export function createStubBillingAdapter(): BillingAdapter {
  return {
    name: 'stub',
    isAvailable: false,

    async initialize(): Promise<void> {
      console.log(
        '[billing] Using the stub adapter — no store connection, no purchases possible.',
      );
    },

    async getProducts(): Promise<BillingProduct[]> {
      // Deliberately empty rather than fabricated prices. A made-up price
      // in a paywall is the one placeholder that can genuinely mislead
      // someone about what they are being asked to pay, so the UI shows
      // "Price unavailable" instead (see PLANS.fallbackPriceText).
      return [];
    },

    async purchase(_planId: PlanId): Promise<BillingPurchase> {
      throw new BillingUnavailableError(UNAVAILABLE_MESSAGE);
    },

    async getAvailablePurchases(): Promise<BillingPurchase[]> {
      return [];
    },

    async finishPurchase(_purchase: BillingPurchase): Promise<void> {
      // Nothing to acknowledge — nothing was ever bought.
    },

    async dispose(): Promise<void> {},
  };
}
