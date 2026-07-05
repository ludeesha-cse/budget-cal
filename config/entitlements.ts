// Placeholder entitlement state for this stage. There is no real token
// check, purchase, or network call anywhere in this file — Stage 19
// replaces HARDCODED_ENTITLEMENT with a stored, store-verified token,
// but everything that reads useEntitlement() won't need to change when
// that happens.
//
// This constant is the single switch for exercising both tiers during
// development: flip it and reload. hooks/useEntitlement.ts also exposes
// a __DEV__-only in-app toggle (see SettingsHomeScreen) for flipping it
// live without editing this file or rebuilding.
export const HARDCODED_ENTITLEMENT: 'free' | 'premium' = 'free';

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

// Display placeholders only. Real prices come from the App Store /
// Google Play product catalog in Stage 19 and will replace these —
// monthlyAmount is deliberately 0 for now rather than a realistic-looking
// number, so it's never mistaken for a real price anywhere it's shown.
export const PLACEHOLDER_PRICING = {
  monthlyAmount: 0,
  currencyCode: 'LKR',
};

// 15% off monthly×12 for the yearly plan. Named (not a bare 0.85 inline
// in PaywallModal) so the discount rate is a single, greppable source of
// truth if it ever needs to change.
export const YEARLY_DISCOUNT_MULTIPLIER = 0.85;
