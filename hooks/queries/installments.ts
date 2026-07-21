import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  getInstallmentOccurrenceHistory,
  getInstallmentPayments,
  getInstallmentPlans,
  getInstallmentReminders,
  getNextUnpaidInstallmentNumber,
  getRemainingInstallmentBalance,
} from '../../db/queries';
import { queryKeys } from '../../db/queryKeys';
import { useStableList } from '../useStableList';
import { TRANSACTIONAL_STALE_TIME } from '../../db/queryConfig';

export type InstallmentPlanRow = Awaited<
  ReturnType<typeof getInstallmentPlans>
>[number];
export type InstallmentPaymentRow = Awaited<
  ReturnType<typeof getInstallmentPayments>
>[number];
export type InstallmentOccurrenceRow = Awaited<
  ReturnType<typeof getInstallmentOccurrenceHistory>
>[number];

// Transactional stale time: a plan's terms are fixed at creation, but
// the list is the anchor for every paid/remaining figure below it and
// gains or loses rows on create/delete — so it moves with the money, not
// with the reference rosters.
export function useInstallmentPlans(enabled = true) {
  return useQuery({
    queryKey: queryKeys.transactional.installments.plans,
    queryFn: getInstallmentPlans,
    enabled,
  });
}

// Transactional stale time: one plan's payment history is what "3 of 12
// paid" and "remaining" are computed from, so it must not outlive the
// balances those same payments moved.
export function useInstallmentPayments(planId: number | null) {
  return useQuery({
    queryKey: queryKeys.transactional.installments.payments(planId ?? -1),
    queryFn: () => getInstallmentPayments(planId as number),
    enabled: planId != null,
  });
}

// Transactional stale time: the same per-plan payment history as above,
// batched for a whole list. Each plan keeps its own cache entry (the old
// useKeyedFetch refetched the entire batch whenever the plans array got
// a new identity), and paying an installment invalidates the
// installments prefix rather than forcing a wholesale reload.
export function useInstallmentPaymentsByPlan(
  planIds: number[],
): Record<number, InstallmentPaymentRow[]> {
  const results = useQueries({
    queries: planIds.map(planId => ({
      queryKey: queryKeys.transactional.installments.payments(planId),
      queryFn: () => getInstallmentPayments(planId),
      staleTime: TRANSACTIONAL_STALE_TIME,
    })),
  });
  // One fixed-size dependency instead of spreading a list whose length
  // tracks the user's data — see hooks/useStableList.ts.
  const values = useStableList(results.map(result => result.data));
  return useMemo(() => {
    const byPlan: Record<number, InstallmentPaymentRow[]> = {};
    planIds.forEach((planId, index) => {
      byPlan[planId] = values[index] ?? [];
    });
    return byPlan;
  }, [planIds, values]);
}

// Transactional stale time: "due within 4 days" is a window measured
// from today, so this list changes as the date moves even with no write
// at all — the same clock-drift argument as accrued loan interest.
export function useInstallmentReminders(enabled = true) {
  return useQuery({
    queryKey: queryKeys.transactional.installments.reminders,
    queryFn: getInstallmentReminders,
    enabled,
  });
}

// Transactional stale time: which installment is next unpaid advances on
// every payment, and it decides what a Pay action will actually charge —
// it has to be invalidated on write, not merely recent.
export function useNextUnpaidInstallmentNumber(planId: number | null) {
  return useQuery({
    queryKey: queryKeys.transactional.installments.nextUnpaidNumber(planId ?? -1),
    queryFn: () => getNextUnpaidInstallmentNumber(planId as number),
    enabled: planId != null,
  });
}

// Transactional stale time: unpaid future installments counted as debt
// on the net worth screen — a money figure that shrinks with every
// payment, so it sits on the money clock.
export function useRemainingInstallmentBalance(currencyId: number | null) {
  return useQuery({
    queryKey: queryKeys.transactional.installments.remainingBalance(
      currencyId ?? -1,
    ),
    queryFn: () => getRemainingInstallmentBalance(currencyId as number),
    enabled: currencyId != null,
  });
}

// Transactional stale time: per-currency remaining installment debt for
// a whole currency list, batched — same figure and same reasoning as the
// single-currency hook above.
export function useRemainingInstallmentBalanceByCurrency(
  currencyIds: number[],
): Record<number, number> {
  const results = useQueries({
    queries: currencyIds.map(currencyId => ({
      queryKey:
        queryKeys.transactional.installments.remainingBalance(currencyId),
      queryFn: () => getRemainingInstallmentBalance(currencyId),
      staleTime: TRANSACTIONAL_STALE_TIME,
    })),
  });
  // One fixed-size dependency instead of spreading a list whose length
  // tracks the user's data — see hooks/useStableList.ts.
  const values = useStableList(results.map(result => result.data));
  return useMemo(() => {
    const byCurrency: Record<number, number> = {};
    currencyIds.forEach((currencyId, index) => {
      const value = values[index];
      if (value != null) {
        byCurrency[currencyId] = value;
      }
    });
    return byCurrency;
  }, [currencyIds, values]);
}

// Transactional stale time: one plan's occurrence schedule, which gains
// a row on every payment or skip and is read right after those actions —
// the same reasoning as useOccurrenceHistory for recurring rules.
//
// Fetched per plan and only when a plan's history is actually expanded
// (planId is null otherwise), unlike useInstallmentPaymentsByPlan above,
// which has to be eager because the "paid N of M" figures on every
// collapsed card are computed from it. Nothing on a collapsed card reads
// the occurrence schedule.
export function useInstallmentOccurrenceHistory(planId: number | null) {
  return useQuery({
    queryKey: queryKeys.transactional.installments.occurrenceHistory(
      planId ?? -1,
    ),
    queryFn: () => getInstallmentOccurrenceHistory(planId as number),
    enabled: planId != null,
  });
}
