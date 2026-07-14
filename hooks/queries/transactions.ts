import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  getExpenseCurrenciesForMonth,
  getExpensesByType,
  getMonthlyIncome,
  getMonthlyTotal,
  getTagsForTransaction,
  getTransactionById,
  getTransactions,
  getTransactionsByMonth,
  getTransactionsByYear,
  searchTransactions,
} from '../../db/queries';
import { queryKeys } from '../../db/queryKeys';
import { useStableList } from '../useStableList';
import { TRANSACTIONAL_STALE_TIME } from '../../db/queryConfig';

// Transaction reads. All sit under the `transactional` key prefix and
// therefore get TRANSACTIONAL_STALE_TIME (10 minutes) from
// db/queryClient.ts — no hook below restates it.

// Named for the assignment, not the roster — ./reference.ts exports
// TagRow for the roster query, and they are the same row shape.
export type TransactionTagRow = Awaited<
  ReturnType<typeof getTagsForTransaction>
>[number];
export type TransactionRow = Awaited<
  ReturnType<typeof getTransactionsByMonth>
>[number];

// Transactional stale time: this is the raw ledger every money figure on
// screen is derived from, so 10 minutes is the outer bound on how wrong
// a number may look if something wrote to the database outside the app's
// own mutation hooks — inside the app, every transaction write
// invalidates this key the moment it lands.
export function useTransactionsByMonth(month: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.transactional.transactions.byMonth(month),
    queryFn: () => getTransactionsByMonth(month),
    enabled,
  });
}

// Transactional stale time: same ledger as the monthly view, just a
// wider slice — a year's rows go stale for exactly the same reason and
// on the same 10-minute clock.
export function useTransactionsByYear(year: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.transactional.transactions.byYear(year),
    queryFn: () => getTransactionsByYear(year),
    enabled,
  });
}

// Transactional stale time: the unfiltered ledger; carries the same
// staleness tolerance as every other slice of it.
export function useAllTransactions(enabled = true) {
  return useQuery({
    queryKey: queryKeys.transactional.transactions.list,
    queryFn: getTransactions,
    enabled,
  });
}

// Transactional stale time: a single transaction's own row, read to
// populate the edit form — it must reflect an edit made seconds ago, so
// it rides the transactional window and is invalidated by every
// transaction write.
export function useTransactionById(id: number | null) {
  return useQuery({
    queryKey: queryKeys.transactional.transactions.byId(id ?? -1),
    queryFn: () => getTransactionById(id as number),
    enabled: id != null,
  });
}

// Transactional stale time: search results are a filtered view of the
// same ledger, so anything that makes the ledger stale makes these
// stale, on the same clock.
export function useTransactionSearch(
  params: { query?: string; tagIds?: number[] },
  enabled = true,
) {
  const { query, tagIds } = params;
  return useQuery({
    queryKey: queryKeys.transactional.transactions.search(query, tagIds),
    queryFn: () => searchTransactions({ query, tagIds }),
    enabled,
  });
}

// Transactional stale time: a per-month expense aggregate — it changes
// with the transactions it sums, never independently of them.
export function useExpensesByType(
  month: string,
  currencyId: number | null,
) {
  return useQuery({
    queryKey: queryKeys.transactional.transactions.expensesByType(
      month,
      currencyId ?? -1,
    ),
    queryFn: () => getExpensesByType(month, currencyId as number),
    enabled: currencyId != null,
  });
}

// Transactional stale time: which currencies have expense activity this
// month is derived from the month's transactions, so it moves whenever
// they do — this is a transaction-shaped read despite returning
// currencies, which is why it is not filed with the reference currency
// rosters.
export function useExpenseCurrenciesForMonth(month: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.transactional.transactions.expenseCurrencies(month),
    queryFn: () => getExpenseCurrenciesForMonth(month),
    enabled,
  });
}

// Transactional stale time: "spent this month", the number every budget
// card is measured against — the single figure most visibly wrong if it
// lags, hence the tighter of the two windows plus invalidation on every
// transaction write.
export function useMonthlyTotal(month: string, currencyId: number | null) {
  return useQuery({
    queryKey: queryKeys.transactional.transactions.monthlyTotal(
      month,
      currencyId ?? -1,
    ),
    queryFn: () => getMonthlyTotal(month, currencyId as number),
    enabled: currencyId != null,
  });
}

// Transactional stale time: the income half of the same monthly picture,
// summed from the same rows and stale under exactly the same conditions.
export function useMonthlyIncome(month: string, currencyId: number | null) {
  return useQuery({
    queryKey: queryKeys.transactional.transactions.monthlyIncome(
      month,
      currencyId ?? -1,
    ),
    queryFn: () => getMonthlyIncome(month, currencyId as number),
    enabled: currencyId != null,
  });
}

// Transactional stale time: which tags are attached to one transaction
// is an attribute of that transaction (it changes when the transaction
// is edited), not of the tag roster — so it follows the transactional
// window, unlike the reference-cached tag list itself.
export function useTagsForTransaction(transactionId: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.transactional.transactions.tagsFor(transactionId),
    queryFn: () => getTagsForTransaction(transactionId),
    enabled,
  });
}

// Transactional stale time: the same per-transaction tag assignments as
// above, batched for a whole list — one cache entry per transaction, so
// scrolling back to a month already seen costs nothing.
export function useTagsForTransactions(
  transactionIds: number[],
): Record<number, TransactionTagRow[]> {
  const results = useQueries({
    queries: transactionIds.map(transactionId => ({
      queryKey: queryKeys.transactional.transactions.tagsFor(transactionId),
      queryFn: () => getTagsForTransaction(transactionId),
      staleTime: TRANSACTIONAL_STALE_TIME,
    })),
  });
  // One fixed-size dependency instead of spreading a list whose length
  // tracks the user's data — see hooks/useStableList.ts.
  const values = useStableList(results.map(result => result.data));
  return useMemo(() => {
    const byId: Record<number, TransactionTagRow[]> = {};
    transactionIds.forEach((transactionId, index) => {
      byId[transactionId] = values[index] ?? [];
    });
    return byId;
  }, [transactionIds, values]);
}
