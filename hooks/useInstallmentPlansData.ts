import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  getAccounts,
  getCategories,
  getCurrencies,
  getInstallmentPayments,
  getInstallmentPlans,
} from '../db/queries';
import { useKeyedFetch } from './useKeyedFetch';

export type InstallmentPlanRow = Awaited<
  ReturnType<typeof getInstallmentPlans>
>[number];
export type InstallmentPaymentRow = Awaited<
  ReturnType<typeof getInstallmentPayments>
>[number];
export type InstallmentCategoryRow = Awaited<
  ReturnType<typeof getCategories>
>[number];
export type InstallmentCurrencyRow = Awaited<
  ReturnType<typeof getCurrencies>
>[number];
export type InstallmentAccountRow = Awaited<
  ReturnType<typeof getAccounts>
>[number];

export interface UseInstallmentPlansDataResult {
  plans: InstallmentPlanRow[];
  categories: InstallmentCategoryRow[];
  currencies: InstallmentCurrencyRow[];
  accounts: InstallmentAccountRow[];
  activeAccounts: InstallmentAccountRow[];
  paymentsByPlan: Record<string | number, InstallmentPaymentRow[]>;
  load: () => Promise<void>;
  paidCountFor: (planId: number) => number;
  paidAmountFor: (planId: number) => number;
  remainingFor: (plan: InstallmentPlanRow) => number;
  nextAmountDueFor: (plan: InstallmentPlanRow) => number | null;
  expandedPlanId: number | null;
  toggleExpanded: (planId: number) => void;
}

export function useInstallmentPlansData(): UseInstallmentPlansDataResult {
  const [plans, setPlans] = useState<InstallmentPlanRow[]>([]);
  const [categories, setCategories] = useState<InstallmentCategoryRow[]>([]);
  const [currencies, setCurrencies] = useState<InstallmentCurrencyRow[]>([]);
  const [accounts, setAccounts] = useState<InstallmentAccountRow[]>([]);
  const [expandedPlanId, setExpandedPlanId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [planRows, categoryRows, currencyRows, accountRows] =
      await Promise.all([
        getInstallmentPlans(),
        getCategories(),
        getCurrencies(),
        getAccounts(),
      ]);
    setPlans(planRows);
    setCategories(categoryRows);
    setCurrencies(currencyRows);
    setAccounts(accountRows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Keyed by plan id — fetched for every plan up front (plan counts are
  // small in a personal tracker), refetching whenever `plans` itself
  // changes (i.e. every load()). This deliberately stays an eager
  // useKeyedFetch rather than the lazier fetch-once-and-cache
  // useLazyExpandableDetail (Step 9) offers for a similar "tap a row to
  // see its history" shape: that hook's per-id cache is never invalidated
  // after its first fetch, so reusing it here would leave an
  // already-expanded plan's history showing stale payments until manually
  // collapsed and reopened — e.g. right after paying that same plan's
  // next installment. Every other figure below (paid count, remaining,
  // next amount due) is also read straight from this same eager map, so
  // they're always correct without needing that plan's history to have
  // ever been expanded.
  const paymentsByPlan = useKeyedFetch(
    plans,
    p => p.id,
    p => getInstallmentPayments(p.id),
  );

  const activeAccounts = accounts.filter(a => a.active);

  // paidCount + 1 is always the next unpaid installment number:
  // payInstallment only ever pays getNextUnpaidInstallmentNumber's
  // answer, and unpayInstallment only ever removes the highest-numbered
  // payment, so the paid set is always exactly {1..paidCount} — a
  // contiguous prefix, never a gap. That invariant is what makes this
  // safe to compute from the payments array's length alone, without a
  // second round trip to the query layer just to display it.
  const paidCountFor = useCallback(
    (planId: number) => (paymentsByPlan[planId] ?? []).length,
    [paymentsByPlan],
  );

  const paidAmountFor = useCallback(
    (planId: number) =>
      (paymentsByPlan[planId] ?? []).reduce(
        (sum, payment) => sum + payment.amount,
        0,
      ),
    [paymentsByPlan],
  );

  const remainingFor = useCallback(
    (plan: InstallmentPlanRow) => plan.totalRepayable - paidAmountFor(plan.id),
    [paidAmountFor],
  );

  const nextAmountDueFor = useCallback(
    (plan: InstallmentPlanRow): number | null => {
      const paidCount = paidCountFor(plan.id);
      if (paidCount >= plan.numberOfMonths) {
        return null;
      }
      const nextNumber = paidCount + 1;
      return nextNumber === plan.numberOfMonths
        ? plan.finalInstallmentAmount
        : plan.monthlyAmount;
    },
    [paidCountFor],
  );

  const toggleExpanded = useCallback((planId: number) => {
    setExpandedPlanId(current => (current === planId ? null : planId));
  }, []);

  return {
    plans,
    categories,
    currencies,
    accounts,
    activeAccounts,
    paymentsByPlan,
    load,
    paidCountFor,
    paidAmountFor,
    remainingFor,
    nextAmountDueFor,
    expandedPlanId,
    toggleExpanded,
  };
}
