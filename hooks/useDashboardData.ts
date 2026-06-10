import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  generatePendingOccurrences,
  getBudgetForMonth,
  getMonthlyIncome,
  getMonthlyTotal,
  getPendingOccurrences,
  getTotalCashInHandByCurrency,
  getTotalCreditCardDebt,
} from '../db/queries';
import { getAmountLeft, getAverageLeftPerDay } from '../utils/budgetCalculations';
import { getCurrentDateString, getCurrentMonthString } from '../utils/date';
import { useCategoryBreakdown } from './useCategoryBreakdown';
import type { CategoryBreakdownRow } from './useCategoryBreakdown';
import { useUpcomingReminders } from './useUpcomingReminders';
import type {
  UpcomingInstallmentRow,
  UpcomingLoanRow,
} from './useUpcomingReminders';
import { useAccountShortcuts } from './useAccountShortcuts';
import type { ShortcutAccountRow } from './useAccountShortcuts';

type CoreDashboardFields = {
  loading: boolean;
  pendingOccurrenceCount: number;
  total: number;
  totalIncome: number;
  budget: Awaited<ReturnType<typeof getBudgetForMonth>>;
  amountLeft: number | null;
  averageLeftPerDay: number | null;
  cashInHandByCurrency: Record<string, number>;
  creditCardDebt: number;
};

export interface DashboardData extends CoreDashboardFields {
  categoryBreakdown: CategoryBreakdownRow[];
  shortcutAccounts: ShortcutAccountRow[];
  liabilityTotals: Record<string, number>;
  receivableTotals: Record<string, number>;
  upcomingLoans: UpcomingLoanRow[];
  upcomingInstallments: UpcomingInstallmentRow[];
}

const INITIAL_CORE: CoreDashboardFields = {
  loading: true,
  pendingOccurrenceCount: 0,
  total: 0,
  totalIncome: 0,
  budget: null,
  amountLeft: null,
  averageLeftPerDay: null,
  cashInHandByCurrency: {},
  creditCardDebt: 0,
};

// Replaces the old ~225-line focus-effect callback and its 13 individual
// setters with one struct. categoryBreakdown/shortcutAccounts/
// upcomingLoans+upcomingInstallments+liability+receivableTotals are
// computed by three sub-hooks (Step 16b-d) via their own pure
// compute-on-demand functions rather than each owning its own
// useFocusEffect — that's what lets this hook keep exactly one
// generatePendingOccurrences() call, one `cancelled` guard, and one
// `loading` flag for the whole screen, matching the original's own
// atomic all-or-nothing commit instead of four independently-flickering
// sections.
export function useDashboardData(): DashboardData {
  const [core, setCore] = useState<CoreDashboardFields>(INITIAL_CORE);

  const {
    categoryBreakdown,
    setCategoryBreakdown,
    computeCategoryBreakdown,
  } = useCategoryBreakdown();
  const {
    upcomingLoans,
    upcomingInstallments,
    liabilityTotals,
    receivableTotals,
    setUpcomingReminders,
    computeUpcomingReminders,
  } = useUpcomingReminders();
  const { shortcutAccounts, setShortcutAccounts, computeShortcutAccounts } =
    useAccountShortcuts();

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setCore(current => ({ ...current, loading: true }));
      const month = getCurrentMonthString();
      const today = getCurrentDateString();

      // Regenerated on every focus, not just app startup — idempotent by
      // design (see its own doc comment), so re-running it here whenever
      // the user comes back to this tab is safe and simpler than trying
      // to track whether "today's" generation already happened.
      generatePendingOccurrences()
        .then(() =>
          Promise.all([
            getMonthlyTotal(month),
            getMonthlyIncome(month),
            getBudgetForMonth(month),
            getAmountLeft(month),
            getAverageLeftPerDay(month),
            getTotalCashInHandByCurrency(),
            getTotalCreditCardDebt(),
            getPendingOccurrences(),
            computeCategoryBreakdown(month),
            computeUpcomingReminders(today),
            computeShortcutAccounts(),
          ] as const),
        )
        .then(
          ([
            monthlyTotal,
            monthlyIncome,
            monthlyBudget,
            left,
            avgLeftPerDay,
            cashByCurrency,
            cardDebt,
            pendingOccurrences,
            breakdown,
            reminders,
            shortcuts,
          ]) => {
            if (cancelled) {
              return;
            }
            setCore({
              loading: false,
              pendingOccurrenceCount: pendingOccurrences.length,
              total: monthlyTotal,
              totalIncome: monthlyIncome,
              budget: monthlyBudget,
              amountLeft: left,
              averageLeftPerDay: avgLeftPerDay,
              cashInHandByCurrency: cashByCurrency,
              creditCardDebt: cardDebt,
            });
            setCategoryBreakdown(breakdown);
            setUpcomingReminders(reminders);
            setShortcutAccounts(shortcuts);
          },
        );

      return () => {
        cancelled = true;
      };
    }, [
      computeCategoryBreakdown,
      computeUpcomingReminders,
      computeShortcutAccounts,
      setCategoryBreakdown,
      setUpcomingReminders,
      setShortcutAccounts,
    ]),
  );

  return {
    ...core,
    categoryBreakdown,
    shortcutAccounts,
    liabilityTotals,
    receivableTotals,
    upcomingLoans,
    upcomingInstallments,
  };
}
