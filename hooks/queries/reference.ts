import { useQuery } from '@tanstack/react-query';
import {
  getAccounts,
  getActiveAccountCountByType,
  getActiveCurrencies,
  getAppMeta,
  getBudgetCurrencyOptions,
  getCategories,
  getCurrencies,
  getDefaultCurrency,
  getTags,
  getUserCategoryCount,
} from '../../db/queries';
import { queryKeys } from '../../db/queryKeys';

// Reference reads: the rosters the app picks FROM, as opposed to the
// money figures it computes. All of these sit under the `reference` key
// prefix, which db/queryClient.ts gives the longer REFERENCE_STALE_TIME
// — see db/queryConfig.ts for why that number is what it is.

export type AccountRow = Awaited<ReturnType<typeof getAccounts>>[number];
export type CategoryRow = Awaited<ReturnType<typeof getCategories>>[number];
export type TagRow = Awaited<ReturnType<typeof getTags>>[number];
export type CurrencyRow = Awaited<ReturnType<typeof getCurrencies>>[number];
export type ActiveCurrencyRow = Awaited<
  ReturnType<typeof getActiveCurrencies>
>[number];

// Reference stale time: an account's name, type and active flag only
// change when the user edits one on the Accounts screen — and that edit
// invalidates this key directly — so nothing on a clock can make this
// list wrong. (Its BALANCES are a different query entirely, and
// transactional: see hooks/queries/balances.ts.)
export function useAccountList() {
  return useQuery({
    queryKey: queryKeys.reference.accounts.list,
    queryFn: getAccounts,
  });
}

// Reference stale time: this count only moves when an account is
// created, closed or reactivated, each of which invalidates it — it
// gates a paywall check, so it must be right after a write, not merely
// recent.
export function useActiveAccountCountByType(type: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reference.accounts.activeCountByType(type),
    queryFn: () => getActiveAccountCountByType(type),
    enabled,
  });
}

// Reference stale time: the category roster changes only via the
// Categories screen, whose add/rename/delete all invalidate this key;
// between those edits it is immutable, so a short window would only buy
// redundant reads.
export function useCategories() {
  return useQuery({
    queryKey: queryKeys.reference.categories.list,
    queryFn: getCategories,
  });
}

// Reference stale time: same lifecycle as the category list it counts —
// it changes only on a category write, and every category write
// invalidates the whole categories prefix, this key included.
export function useUserCategoryCount(enabled = true) {
  return useQuery({
    queryKey: queryKeys.reference.categories.userCount,
    queryFn: getUserCategoryCount,
    enabled,
  });
}

// Reference stale time: tags are a user-managed roster with no
// time-driven component at all — a tag's name is as true in ten minutes
// as it is now, and any rename invalidates this key immediately.
export function useTags() {
  return useQuery({
    queryKey: queryKeys.reference.tags.list,
    queryFn: getTags,
  });
}

// Reference stale time: the full currency roster (enabled and disabled)
// only changes on the Currencies screen, which invalidates the whole
// currencies prefix on every add/enable/disable/delete.
export function useAllCurrencies() {
  return useQuery({
    queryKey: queryKeys.reference.currencies.list,
    queryFn: getCurrencies,
  });
}

// Reference stale time: the enabled subset of the same immutable-
// between-edits roster above; enabling or disabling a currency is a
// write, and writes invalidate rather than wait for expiry.
export function useActiveCurrencies() {
  return useQuery({
    queryKey: queryKeys.reference.currencies.active,
    queryFn: getActiveCurrencies,
  });
}

// Reference stale time: which currency is flagged default changes only
// when the user sets a new one, and that write invalidates this key —
// but note it is read on screens showing money, so it is deliberately
// invalidated by currency writes rather than left to expire.
export function useDefaultCurrency() {
  return useQuery({
    queryKey: queryKeys.reference.currencies.default,
    queryFn: getDefaultCurrency,
  });
}

// Reference stale time: derived purely from the currencies table
// (default currency first), so it tracks currency edits, never budget
// edits — a budget being saved cannot change which currencies exist.
export function useBudgetCurrencyOptions() {
  return useQuery({
    queryKey: queryKeys.reference.currencies.budgetOptions,
    queryFn: getBudgetCurrencyOptions,
  });
}

// Reference stale time: onboarding/default-currency-confirmed flags are
// written once each in the app's lifetime and invalidated when they are
// — there is nothing here for a shorter window to catch.
export function useAppMeta() {
  return useQuery({
    queryKey: queryKeys.reference.settings.appMeta,
    queryFn: getAppMeta,
  });
}
