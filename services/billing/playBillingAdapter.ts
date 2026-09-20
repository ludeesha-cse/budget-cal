// Real Google Play Billing adapter — the one file in this app that
// imports react-native-iap. Everything above the BillingAdapter seam
// (paywall, SubscriptionContext, purchase ordering) was already built
// and exercised against stubBillingAdapter.ts; this file only has to
// honor that same interface, never anything screens call directly.
//
// react-native-iap's requestPurchase() is event-based — the purchase
// result arrives through purchaseUpdatedListener/purchaseErrorListener,
// not the Promise requestPurchase() itself returns (see its own JSDoc:
// "Do not rely on it for the actual outcome"). BillingAdapter.purchase()
// promises a single result, so this file's whole job is bridging that
// event stream back into one Promise per call.

import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  getAvailablePurchases as fetchStorePurchases,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
  isUserCancelledError,
  type Product,
  type ProductSubscription,
  type Purchase,
  type PurchaseError,
  type EventSubscription,
} from 'react-native-iap';

import { PRODUCT_IDS, type PlanId } from '../../config/entitlements';
import {
  BillingCancelledError,
  BillingUnavailableError,
  type BillingAdapter,
  type BillingProduct,
  type BillingPurchase,
} from './types';

const SUBSCRIPTION_PLAN_IDS: PlanId[] = ['monthly', 'yearly'];

function planIdForProductId(productId: string): PlanId | null {
  const match = (Object.entries(PRODUCT_IDS) as [PlanId, string][]).find(
    ([, id]) => id === productId,
  );
  return match ? match[0] : null;
}

function toBillingPurchase(purchase: Purchase): BillingPurchase | null {
  const productId = purchase.productId;
  const purchaseToken = purchase.purchaseToken;
  if (!productId || !purchaseToken) return null;
  const planId = planIdForProductId(productId);
  return {
    purchaseToken,
    productId,
    isSubscription: planId ? SUBSCRIPTION_PLAN_IDS.includes(planId) : false,
  };
}

export function createPlayBillingAdapter(): BillingAdapter {
  let connected = false;

  // Google requires an offer token alongside a subscription SKU to
  // launch its purchase sheet. Populated by fetchCatalog(); purchase()
  // refuses to guess one, so a plan with no active base plan in Play
  // Console fails loudly here instead of bouncing off Google with a
  // cryptic error.
  const offerTokenByPlan = new Map<PlanId, string>();

  // Exactly one purchase() is ever in flight — the paywall disables its
  // buttons while a purchase is pending. That single-slot assumption is
  // what lets a global listener resolve a specific call's Promise.
  let pending: {
    productId: string;
    resolve: (purchase: BillingPurchase) => void;
    reject: (error: unknown) => void;
  } | null = null;

  let updatedSub: EventSubscription | null = null;
  let errorSub: EventSubscription | null = null;

  function attachListeners(): void {
    if (updatedSub) return;
    updatedSub = purchaseUpdatedListener((purchase) => {
      if (!pending || purchase.productId !== pending.productId) return;
      const billingPurchase = toBillingPurchase(purchase);
      const { resolve, reject } = pending;
      pending = null;
      if (billingPurchase) {
        resolve(billingPurchase);
      } else {
        reject(new Error('Store returned a purchase with no purchase token.'));
      }
    });
    errorSub = purchaseErrorListener((error: PurchaseError) => {
      if (!pending) return;
      const { reject } = pending;
      pending = null;
      reject(
        isUserCancelledError(error)
          ? new BillingCancelledError()
          : new Error(error.message || 'Purchase failed.'),
      );
    });
  }

  async function fetchCatalog(): Promise<BillingProduct[]> {
    const subs = (await fetchProducts({
      skus: [PRODUCT_IDS.monthly, PRODUCT_IDS.yearly],
      type: 'subs',
    })) as ProductSubscription[] | null;

    const oneTime = (await fetchProducts({
      skus: [PRODUCT_IDS.lifetime],
      type: 'in-app',
    })) as Product[] | null;

    const results: BillingProduct[] = [];

    for (const product of subs ?? []) {
      const planId = planIdForProductId(product.id);
      if (!planId) continue;
      // First offer is the product's base plan — this app doesn't sell
      // promotional/introductory offers, so there is only ever one.
      const offer = product.subscriptionOffers?.[0];
      if (offer?.offerTokenAndroid) {
        offerTokenByPlan.set(planId, offer.offerTokenAndroid);
      }
      results.push({
        planId,
        productId: product.id,
        priceText: offer?.displayPrice ?? product.displayPrice,
        priceAmountMicros:
          typeof offer?.price === 'number'
            ? Math.round(offer.price * 1_000_000)
            : null,
        currencyCode: product.currency ?? null,
        title: product.title ?? null,
        description: product.description ?? null,
      });
    }

    for (const product of oneTime ?? []) {
      const planId = planIdForProductId(product.id);
      if (!planId) continue;
      results.push({
        planId,
        productId: product.id,
        priceText: product.displayPrice,
        priceAmountMicros:
          typeof product.price === 'number'
            ? Math.round(product.price * 1_000_000)
            : null,
        currencyCode: product.currency ?? null,
        title: product.title ?? null,
        description: product.description ?? null,
      });
    }

    return results;
  }

  return {
    name: 'google_play',
    isAvailable: true,

    async initialize(): Promise<void> {
      if (connected) return;
      const ok = await initConnection();
      if (!ok) {
        throw new BillingUnavailableError(
          'Could not connect to Google Play Billing.',
        );
      }
      connected = true;
      attachListeners();
    },

    async getProducts(): Promise<BillingProduct[]> {
      return fetchCatalog();
    },

    async purchase(planId: PlanId): Promise<BillingPurchase> {
      if (!connected) {
        throw new BillingUnavailableError('Billing is not connected yet.');
      }

      const productId = PRODUCT_IDS[planId];
      const isSubscription = SUBSCRIPTION_PLAN_IDS.includes(planId);

      if (isSubscription && !offerTokenByPlan.has(planId)) {
        // purchase() can be called before getProducts() populated the
        // offer cache (e.g. a stale paywall render) — refresh once
        // rather than sending a request Google will reject outright.
        await fetchCatalog();
      }
      if (isSubscription && !offerTokenByPlan.has(planId)) {
        throw new BillingUnavailableError(
          `No purchasable offer for ${productId}. Check that its base plan is active in Play Console.`,
        );
      }

      return new Promise<BillingPurchase>((resolve, reject) => {
        pending = { productId, resolve, reject };

        const dispatch = isSubscription
          ? requestPurchase({
              request: {
                google: {
                  skus: [productId],
                  subscriptionOffers: [
                    {
                      sku: productId,
                      offerToken: offerTokenByPlan.get(planId)!,
                    },
                  ],
                },
              },
              type: 'subs' as const,
            })
          : requestPurchase({
              request: { google: { skus: [productId] } },
              type: 'in-app' as const,
            });

        // This only catches a failed *dispatch* (bad args, not
        // connected) — a purchase Google actually attempted and then
        // failed or was cancelled arrives through purchaseErrorListener
        // above, not here.
        dispatch.catch((error: unknown) => {
          if (pending?.productId !== productId) return;
          pending = null;
          reject(
            isUserCancelledError(error)
              ? new BillingCancelledError()
              : error instanceof Error
                ? error
                : new Error(String(error)),
          );
        });
      });
    },

    async getAvailablePurchases(): Promise<BillingPurchase[]> {
      const purchases = await fetchStorePurchases();
      return purchases
        .map(toBillingPurchase)
        .filter((purchase): purchase is BillingPurchase => purchase !== null);
    },

    async finishPurchase(purchase: BillingPurchase): Promise<void> {
      // finishTransaction wants the full Purchase object the store
      // handed back, not just the token — re-read it from the store's
      // own queue rather than reconstructing one by hand.
      const owned = await fetchStorePurchases();
      const match = owned.find(
        (candidate) => candidate.purchaseToken === purchase.purchaseToken,
      );
      if (!match) return; // already finished, or the store no longer lists it
      await finishTransaction({ purchase: match, isConsumable: false });
    },

    async dispose(): Promise<void> {
      updatedSub?.remove();
      errorSub?.remove();
      updatedSub = null;
      errorSub = null;
      if (connected) {
        await endConnection();
        connected = false;
      }
    },
  };
}
