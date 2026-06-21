import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  generatePendingOccurrences,
  getBudgetsForMonth,
  getDefaultCurrency,
  getMonthlyIncome,
  getMonthlyTotal,
  getPendingOccurrences,
  getTotalCashInHandByCurrency,
  getTotalCreditCardDebt,
  type BudgetWithCurrency,
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

// One of these per currency that has an overall budget set for the
// current month — Dashboard shows up to the first 2 (see DashboardScreen),
// with a "more" link to BudgetSettingsScreen for the rest, rather than
// assuming (as this hook used to) that there's ever only one budget at
// all.
export type DashboardBudgetCard = {
  currencyId: number;
  currencyCode: string;
  budget: BudgetWithCurrency;
  total: number;
  amountLeft: number | null;
  averageLeftPerDay: number | null;
};

type CoreDashboardFields = {
  loading: boolean;
  pendingOccurrenceCount: number;
  totalIncome: number;
  budgetCards: DashboardBudgetCard[];
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
  totalIncome: 0,
  budgetCards: [],
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
            getDefaultCurrency(),
            getBudgetsForMonth(month),
            getTotalCashInHandByCurrency(),
            getTotalCreditCardDebt(),
            getPendingOccurrences(),
            computeUpcomingReminders(today),
            computeShortcutAccounts(),
          ] as const),
        )
        .then(
          async ([
            defaultCurrency,
            budgetsThisMonth,
            cashByCurrency,
            cardDebt,
            pendingOccurrences,
            reminders,
            shortcuts,
          ]) => {
            if (cancelled) {
              return;
            }

            // Every budgeted currency gets its own spent/left/per-day
            // figures — see DashboardBudgetCard. Small list at this app's
            // scale (a personal tracker rarely budgets more than a
            // handful of currencies), so N sequential small queries here
            // is simpler than a single mega-query and not worth
            // optimizing away.
            const budgetCards = await Promise.all(
              budgetsThisMonth.map(async budget => {
                const [total, amountLeft, averageLeftPerDay] = await Promise.all([
                  getMonthlyTotal(month, budget.currencyId),
                  getAmountLeft(month, budget.currencyId),
                  getAverageLeftPerDay(month, budget.currencyId),
                ]);
                return {
                  currencyId: budget.currencyId,
                  currencyCode: budget.currencyCode,
                  budget,
                  total,
                  amountLeft,
                  averageLeftPerDay,
                };
              }),
            );

            // Income + the "By Category" preview are both scoped to the
            // app's default currency — see useCategoryBreakdown's own
            // comment for why that list in particular doesn't get a
            // per-currency tab set the way CategoryBudgetsScreen does.
            // Falls back to the first budgeted currency, then to 0/empty,
            // if no default currency exists at all (shouldn't happen in
            // practice — seedDefaultCategories-style setup always leaves
            // exactly one currency flagged default — but this avoids a
            // crash rather than assuming it can't).
            const incomeCurrencyId =
              defaultCurrency?.id ?? budgetsThisMonth[0]?.currencyId ?? null;
            const [totalIncome, breakdown] = await Promise.all([
              incomeCurrencyId != null
                ? getMonthlyIncome(month, incomeCurrencyId)
                : Promise.resolve(0),
              incomeCurrencyId != null
                ? computeCategoryBreakdown(month, incomeCurrencyId)
                : Promise.resolve([]),
            ]);

            if (cancelled) {
              return;
            }
            setCore({
              loading: false,
              pendingOccurrenceCount: pendingOccurrences.length,
              totalIncome,
              budgetCards,
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
