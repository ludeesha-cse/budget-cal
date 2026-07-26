import { useCallback, useMemo, useState } from 'react';
import {
  useAccountList,
  useActiveCurrencies,
  useCategories,
  useInstallmentOccurrenceHistory,
  useInstallmentPaymentsByPlan,
  useInstallmentPlans,
  type InstallmentOccurrenceRow,
  type InstallmentPaymentRow,
  type InstallmentPlanRow,
} from './queries';
import {
  getAccounts,
  getActiveCurrencies,
  getCategories,
} from '../db/queries';
import { isPayableAccount } from '../utils/accountTypes';

export type { InstallmentPlanRow, InstallmentPaymentRow, InstallmentOccurrenceRow };
export type InstallmentCategoryRow = Awaited<
  ReturnType<typeof getCategories>
>[number];
export type InstallmentCurrencyRow = Awaited<
  ReturnType<typeof getActiveCurrencies>
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
  // Only ever the EXPANDED plan's occurrence schedule, and undefined
  // while that one query is in flight — see where it is fetched below.
  expandedOccurrences: InstallmentOccurrenceRow[] | undefined;
  paidCountFor: (planId: number) => number;
  paidAmountFor: (planId: number) => number;
  remainingFor: (plan: InstallmentPlanRow) => number;
  nextAmountDueFor: (plan: InstallmentPlanRow) => number | null;
  expandedPlanId: number | null;
  toggleExpanded: (planId: number) => void;
  loading: boolean;
}

// Plans from the transactional cache; categories, currencies and the
// account roster from the reference cache. Everything below the fetches
// — paid count, paid amount, remaining, next amount due — is arithmetic
// over rows already in hand and stays that way: an installment schedule
// preview is a calculation, not a read worth caching.
// `forcedPlanId` is for InstallmentPlanDetailsScreen, which is about
// exactly one plan and has no expand/collapse of its own: passing the
// plan's id here makes its schedule the one this hook fetches, reusing
// the same cached query the list screen was already filling rather than
// adding a second per-plan hook that would have to be kept in step with
// this one.
export function useInstallmentPlansData(
  forcedPlanId?: number | null,
): UseInstallmentPlansDataResult {
  const [expandedPlanId, setExpandedPlanId] = useState<number | null>(null);

  const { data: plans, isPending: plansPending } = useInstallmentPlans();
  const { data: categories } = useCategories();
  const { data: currencies } = useActiveCurrencies();
  const { data: accounts } = useAccountList();

  const planIds = useMemo(() => (plans ?? []).map(p => p.id), [plans]);

  // Keyed by plan id, one cached entry per plan — fetched for every plan
  // up front (plan counts are small in a personal tracker). This
  // deliberately stays eager rather than using the lazier
  // fetch-once-and-cache useLazyExpandableDetail: that hook's per-id
  // cache is never invalidated after its first fetch, so reusing it here
  // would leave an already-expanded plan's history showing stale
  // payments until manually collapsed and reopened — e.g. right after
  // paying that same plan's next installment. Every figure below (paid
  // count, remaining, next amount due) reads from this same map, so they
  // are always correct without needing a plan's history to have ever
  // been expanded. Unlike the old useKeyedFetch version, paying an
  // installment now invalidates these by prefix instead of the whole
  // batch being refetched whenever the plans array changed identity.
  const paymentsByPlan = useInstallmentPaymentsByPlan(planIds);

  // The occurrence schedule, unlike the payments above, is fetched for
  // ONE plan and only while its history is open: nothing on a collapsed
  // card is derived from it (paid count, remaining and next amount due
  // all come from the payments), so fetching every plan's schedule up
  // front would be work for a list nobody is looking at. Passing
  // expandedPlanId straight in means collapsing simply disables the
  // query rather than needing a separate teardown.
  const detailPlanId = forcedPlanId ?? expandedPlanId;
  const { data: expandedOccurrences } =
    useInstallmentOccurrenceHistory(detailPlanId);

  // Loan-tracking accounts are filtered out here as well as everywhere
  // else money is paid from (see utils/accountTypes.ts). This picker was
  // the one that still offered them: an installment could be paid "from"
  // Borrowed_from_Asith, which posted a real expense against a balance
  // that only the loan flows are supposed to move.
  const activeAccounts = useMemo(
    () => (accounts ?? []).filter(isPayableAccount),
    [accounts],
  );

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
    plans: plans ?? [],
    categories: categories ?? [],
    currencies: currencies ?? [],
    accounts: accounts ?? [],
    activeAccounts,
    paymentsByPlan,
    expandedOccurrences,
    paidCountFor,
    paidAmountFor,
    remainingFor,
    nextAmountDueFor,
    expandedPlanId,
    toggleExpanded,
    loading: plansPending,
  };
}
