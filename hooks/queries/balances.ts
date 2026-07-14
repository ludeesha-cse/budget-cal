import { useQuery } from '@tanstack/react-query';
import {
  getAccountBalance,
  getAccountBalances,
  getAccountTotalBalance,
  getAllAccountBalances,
  getNetSpentForAccount,
  getTotalCashInHandByCurrency,
} from '../../db/queries';
import { queryKeys } from '../../db/queryKeys';

// Account BALANCE reads — transactional, deliberately separate from the
// reference-cached account roster in ./reference.ts. An account's name
// and type are stable for months; what is in it changes with every
// transaction, transfer, payoff and loan settlement.

export type AccountBalanceRow = Awaited<
  ReturnType<typeof getAllAccountBalances>
>[number];

// Transactional stale time: every account's every currency balance in
// one batched read — the single query behind the Accounts screen and
// net worth, and wrong the instant any money moves, so it takes the
// tighter window and is invalidated by every write that touches money.
export function useAllAccountBalances(enabled = true) {
  return useQuery({
    queryKey: queryKeys.transactional.balances.allAccounts,
    queryFn: getAllAccountBalances,
    enabled,
  });
}

// Transactional stale time: which currencies one account holds, plus
// their stored opening balances — the currency set changes rarely, but
// the balance column is moved by balance corrections and loan
// bookkeeping, so the row as a whole is transactional.
export function useAccountBalanceRows(accountId: number | null) {
  return useQuery({
    queryKey: queryKeys.transactional.balances.forAccount(accountId ?? -1),
    queryFn: () => getAccountBalances(accountId as number),
    enabled: accountId != null,
  });
}

// Transactional stale time: one account's live balance in one currency,
// computed by netting its whole transaction history — the most
// write-sensitive figure in the app, so it takes the 10-minute bound and
// is invalidated by every money-moving mutation.
export function useAccountBalance(
  accountId: number | null,
  currencyId: number | null,
) {
  return useQuery({
    queryKey: queryKeys.transactional.balances.accountBalance(
      accountId ?? -1,
      currencyId ?? -1,
    ),
    queryFn: () => getAccountBalance(accountId as number, currencyId as number),
    enabled: accountId != null && currencyId != null,
  });
}

// Transactional stale time: a sum over one account's transactions, so it
// is stale under exactly the conditions the transaction list is.
export function useNetSpentForAccount(
  accountId: number | null,
  currencyId: number | null,
) {
  return useQuery({
    queryKey: queryKeys.transactional.balances.netSpent(
      accountId ?? -1,
      currencyId ?? -1,
    ),
    queryFn: () =>
      getNetSpentForAccount(accountId as number, currencyId as number),
    enabled: accountId != null && currencyId != null,
  });
}

// Transactional stale time: the dashboard's cash-in-hand card, summed
// from stored balances — a headline money figure, so it gets the shorter
// window rather than being treated as account metadata.
export function useTotalCashInHandByCurrency(enabled = true) {
  return useQuery({
    queryKey: queryKeys.transactional.balances.totalCashInHand,
    queryFn: getTotalCashInHandByCurrency,
    enabled,
  });
}

// Transactional stale time: the "is every currency balance exactly zero"
// gate on closing an account — a decision made from live balances, so
// caching it any longer than the balances themselves would let a closure
// be allowed or refused on an out-of-date reading.
export function useAccountIsZeroEverywhere(accountId: number | null) {
  return useQuery({
    queryKey: queryKeys.transactional.balances.isZeroEverywhere(accountId ?? -1),
    queryFn: () => getAccountTotalBalance(accountId as number),
    enabled: accountId != null,
  });
}
