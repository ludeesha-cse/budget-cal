// Pure functions only — no DB access, no React, no NETWORK-READY comment
// needed. Callers (AccountsScreen, CategoriesScreen,
// LiabilitiesReceivablesScreen) fetch the counts themselves via
// db/queries.ts and pass them in, which is what keeps these trivially
// unit-testable without a database.
import {
  FREE_ACCOUNT_TYPES,
  FREE_TIER_LIMITS,
} from '../config/entitlements';
import type { EntitlementTier } from '../hooks/useEntitlement';

export type EntitlementCheckResult = {
  allowed: boolean;
  // Only set when allowed is false — human-readable enough to hand
  // straight to the paywall as its "reason" without the caller having to
  // re-derive why the check failed.
  reason?: string;
};

// Free tier gets exactly one active account per allowed type, and only
// for the types in FREE_ACCOUNT_TYPES at all. `activeAccountsOfType`
// must be a count of ACTIVE accounts only — a closed account was
// deliberately shut down and must not still occupy the user's one slot.
export function canAddAccount(
  type: string,
  activeAccountsOfType: number,
  tier: EntitlementTier,
): EntitlementCheckResult {
  if (tier === 'premium') {
    return { allowed: true };
  }
  if (!FREE_ACCOUNT_TYPES.includes(type)) {
    return {
      allowed: false,
      reason: `${type} accounts are a premium feature.`,
    };
  }
  if (activeAccountsOfType >= FREE_TIER_LIMITS.accountsPerType) {
    return {
      allowed: false,
      reason: `The free tier allows only ${FREE_TIER_LIMITS.accountsPerType} active ${type} account${
        FREE_TIER_LIMITS.accountsPerType === 1 ? '' : 's'
      }. Upgrade to add more.`,
    };
  }
  return { allowed: true };
}

// `userCategoryCount` must already exclude system-reserved categories
// (isSystemReserved = true, currently just "Bank") — this function has
// no way to tell a user category from a reserved one itself, since it
// only ever sees a number.
export function canAddCategory(
  userCategoryCount: number,
  tier: EntitlementTier,
): EntitlementCheckResult {
  if (tier === 'premium') {
    return { allowed: true };
  }
  if (userCategoryCount >= FREE_TIER_LIMITS.userCategories) {
    return {
      allowed: false,
      reason: `The free tier allows up to ${FREE_TIER_LIMITS.userCategories} categories. Upgrade to add more.`,
    };
  }
  return { allowed: true };
}

export function canAddCurrency(
  activeCurrencyCount: number,
  tier: EntitlementTier,
): EntitlementCheckResult {
  if (tier === 'premium') {
    return { allowed: true };
  }
  if (activeCurrencyCount >= FREE_TIER_LIMITS.activeCurrencies) {
    return {
      allowed: false,
      reason: `The free tier allows only ${FREE_TIER_LIMITS.activeCurrencies} active currency. Upgrade to use multiple currencies.`,
    };
  }
  return { allowed: true };
}
