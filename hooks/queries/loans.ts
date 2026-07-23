import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  getActiveLoanAccounts,
  getInactiveLoanAccounts,
  getLoanOriginationsByMonth,
  getLoanOriginationsByYear,
  getLoanPaymentsByMonth,
  getLoanPaymentsByYear,
  getLoanTotalOwed,
  type LoanAccountType,
} from '../../db/queries';
import { queryKeys } from '../../db/queryKeys';
import { useStableList } from '../useStableList';
import { TRANSACTIONAL_STALE_TIME } from '../../db/queryConfig';

export type ActiveLoanRow = Awaited<
  ReturnType<typeof getActiveLoanAccounts>
>[number];
export type InactiveLoanRow = Awaited<
  ReturnType<typeof getInactiveLoanAccounts>
>[number];
export type LoanPaymentRow = Awaited<
  ReturnType<typeof getLoanPaymentsByMonth>
>[number];
export type LoanOriginationRow = Awaited<
  ReturnType<typeof getLoanOriginationsByMonth>
>[number];

// Transactional stale time: an open loan's terms rarely change, but its
// list is always rendered with the live totals below and its rows appear
// or vanish on settlement — so it shares the money-figure window rather
// than being treated as a roster.
export function useActiveLoanAccounts(type: LoanAccountType, enabled = true) {
  return useQuery({
    queryKey: queryKeys.transactional.loans.active(type),
    queryFn: () => getActiveLoanAccounts(type),
    enabled,
  });
}

// Transactional stale time: settled loans move into this list the moment
// a settlement completes, so it is invalidated by that write and bounded
// by the same window as the active list it mirrors.
export function useInactiveLoanAccounts(type: LoanAccountType, enabled = true) {
  return useQuery({
    queryKey: queryKeys.transactional.loans.inactive(type),
    queryFn: () => getInactiveLoanAccounts(type),
    enabled,
  });
}

// Transactional stale time: this is the clearest case for the 10-minute
// window in the whole app — total owed is principal plus interest
// ACCRUED AS OF a date, so it drifts with the clock alone, with no write
// involved. (The `asOf` day is part of the key, so a date rollover is a
// different entry rather than a stale one.)
export function useLoanTotalOwed(
  accountId: number | null,
  asOf: string,
) {
  return useQuery({
    queryKey: queryKeys.transactional.loans.totalOwed(accountId ?? -1, asOf),
    queryFn: () => getLoanTotalOwed(accountId as number, asOf),
    enabled: accountId != null,
  });
}

// Transactional stale time: the same accruing figure as useLoanTotalOwed
// above, fetched for a whole list at once. Replaces the per-row
// useKeyedFetch batch — each loan now gets its own cache entry, so the
// entries survive a screen leaving and coming back, and a settlement
// invalidates them by prefix rather than the list refetching wholesale.
export function useLoanTotalOwedByAccountId(
  accountIds: number[],
  asOf: string,
): Record<number, number> {
  const results = useQueries({
    queries: accountIds.map(accountId => ({
      queryKey: queryKeys.transactional.loans.totalOwed(accountId, asOf),
      queryFn: () => getLoanTotalOwed(accountId, asOf),
      staleTime: TRANSACTIONAL_STALE_TIME,
    })),
  });
  // useQueries returns a new array identity every render; the map below
  // is memoized on the resolved values so consumers passing it into
  // their own effects/memos do not see a "changed" object each render.
  // One fixed-size dependency instead of spreading a list whose length
  // tracks the user's data — see hooks/useStableList.ts.
  const values = useStableList(results.map(result => result.data));
  return useMemo(() => {
    const byId: Record<number, number> = {};
    accountIds.forEach((accountId, index) => {
      const value = values[index];
      if (value != null) {
        byId[accountId] = value;
      }
    });
    return byId;
  }, [accountIds, values]);
}

// Transactional stale time: loan repayments are money-movement rows
// merged into History beside transactions and transfers, so they carry
// the identical staleness tolerance as those.
export function useLoanPaymentsByMonth(month: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.transactional.loans.paymentsByMonth(month),
    queryFn: () => getLoanPaymentsByMonth(month),
    enabled,
  });
}

// Transactional stale time: the yearly slice of the same repayment
// ledger, stale for the same reasons on the same clock.
export function useLoanPaymentsByYear(year: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.transactional.loans.paymentsByYear(year),
    queryFn: () => getLoanPaymentsByYear(year),
    enabled,
  });
}

// Transactional stale time: loan originations are money-movement rows
// merged into History beside payments, transactions and transfers, so
// they carry the identical staleness tolerance as those. They also move
// on a plain loan EDIT (updateLoanAccount rewrites the latest row), not
// only on a new loan — which is why the loan-account write invalidation
// covers this prefix too.
export function useLoanOriginationsByMonth(month: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.transactional.loans.originationsByMonth(month),
    queryFn: () => getLoanOriginationsByMonth(month),
    enabled,
  });
}

// Transactional stale time: the yearly slice of the same origination
// ledger, stale for the same reasons on the same clock.
export function useLoanOriginationsByYear(year: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.transactional.loans.originationsByYear(year),
    queryFn: () => getLoanOriginationsByYear(year),
    enabled,
  });
}
