import { useEffect, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
  getMonthlyTotal,
  type BudgetWithCurrency,
} from '../db/queries';
import { queryKeys } from '../db/queryKeys';
import { TRANSACTIONAL_STALE_TIME } from '../db/queryConfig';
import {
  amountLeftFrom,
  averageLeftPerDayFrom,
} from '../utils/budgetCalculations';
import { getCurrentDateString, getCurrentMonthString } from '../utils/date';
import {
  useAccountList,
  useActiveLoanAccounts,
  useAllAccountBalances,
  useBudgetsForMonth,
  useCategories,
  useCategoryBudgetsForMonth,
  useDefaultCurrency,
  useGeneratePendingOccurrences,
  useUpcomingInstallmentOccurrences,
  useLoanTotalOwedByAccountId,
  useMonthlyIncome,
  usePendingScheduledPayments,
  useTotalCreditCardDebt,
  useTransactionsByMonth,
} from './queries';
import { useStableList } from './useStableList';
import { buildCategoryBreakdown } from './useCategoryBreakdown';
import type { CategoryBreakdownRow } from './useCategoryBreakdown';
import { buildUpcomingReminders } from './useUpcomingReminders';
import type {
  UpcomingInstallmentRow,
  UpcomingLoanRow,
} from './useUpcomingReminders';
import { buildAccountShortcuts } from './useAccountShortcuts';
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

export interface DashboardData {
  loading: boolean;
  // ONE number across both kinds of scheduled item — recurring-rule
  // occurrences and installment occurrences — because the banner is one
  // banner. See getPendingScheduledPayments for where the two are
  // merged.
  pendingScheduledCount: number;
  totalIncome: number;
  budgetCards: DashboardBudgetCard[];
  creditCardDebt: number;
  categoryBreakdown: CategoryBreakdownRow[];
  shortcutAccounts: ShortcutAccountRow[];
  liabilityTotals: Record<string, number>;
  receivableTotals: Record<string, number>;
  upcomingLoans: UpcomingLoanRow[];
  upcomingInstallments: UpcomingInstallmentRow[];
}

const EMPTY_NUMBERS: number[] = [];

// Regenerating pending occurrences used to run on EVERY dashboard focus.
// It is a write, and idempotent, so that was safe — but it is also a
// database round trip on every single visit, which is exactly the cost
// this refactor exists to remove, and it would keep the instrumentation
// counter climbing while navigating with nothing changed. It now runs at
// most once per calendar day per app process: the module-level marker
// below is what makes "have we already generated for today?" answerable
// without a query. App.tsx still runs it once at startup, so in practice
// this fires only when the app is left open across midnight.
let occurrencesGeneratedForDate: string | null = null;

function useEnsureOccurrencesGenerated(today: string): void {
  const generatePendingOccurrences = useGeneratePendingOccurrences();
  useEffect(() => {
    if (occurrencesGeneratedForDate === today) {
      return;
    }
    occurrencesGeneratedForDate = today;
    // Its mutation invalidates the recurring prefix AND the merged
    // scheduled prefix, so the pending list below picks up anything
    // newly generated. Note this generation step is for RECURRING rules
    // only — installment occurrences are never generated in bulk from
    // the calendar; each one is created by resolving the previous one
    // (see advanceInstallmentSchedule).
    generatePendingOccurrences().catch(error => {
      // Let the next mount retry rather than leaving the day marked done
      // after a failure.
      occurrencesGeneratedForDate = null;
      console.error(
        'useDashboardData: failed to generate pending occurrences',
        error,
      );
    });
  }, [today, generatePendingOccurrences]);
}

// Dashboard's data, assembled from cached queries.
//
// The shape this returns is unchanged — DashboardScreen renders exactly
// the same fields it always did. What changed underneath is that the one
// big focus effect (fetch ~7 things, then N budget queries, then a
// category breakdown that re-read the month's transactions once per
// category, then per-account balance lookups) is gone. Everything is now
// either a cached query or plain arithmetic over one:
//
//   * budget cards      -> budgets + one monthly total per budgeted
//                          currency; "amount left" and "per day" are
//                          arithmetic, not queries
//   * category breakdown-> categories + category budgets + the month's
//                          transactions, reduced in JS
//   * shortcuts         -> the account roster + the one batched
//                          all-account-balances read
//   * reminders/totals  -> active loans + installment reminders + one
//                          cached total-owed per loan
export function useDashboardData(): DashboardData {
  const month = getCurrentMonthString();
  const today = getCurrentDateString();

  useEnsureOccurrencesGenerated(today);

  const { data: defaultCurrency, isPending: defaultCurrencyPending } =
    useDefaultCurrency();
  const { data: budgetsThisMonth, isPending: budgetsPending } =
    useBudgetsForMonth(month);
  const { data: cardDebt } = useTotalCreditCardDebt();
  const { data: pendingScheduled } = usePendingScheduledPayments();
  const { data: accounts } = useAccountList();
  const { data: allBalances } = useAllAccountBalances();
  const { data: liabilities } = useActiveLoanAccounts('Liability');
  const { data: receivables } = useActiveLoanAccounts('Receivable');
  const { data: upcomingInstallmentOccurrences } =
    useUpcomingInstallmentOccurrences();

  // Income and the "By Category" preview are both scoped to the app's
  // default currency — see buildCategoryBreakdown's own comment for why
  // that list doesn't get a per-currency tab set the way
  // CategoryBudgetsScreen does. Falls back to the first budgeted
  // currency, then to nothing, if no default currency exists at all
  // (shouldn't happen in practice — setup always leaves exactly one
  // currency flagged default — but this avoids a crash rather than
  // assuming it can't).
  const incomeCurrencyId =
    defaultCurrency?.id ?? budgetsThisMonth?.[0]?.currencyId ?? null;

  const { data: totalIncome } = useMonthlyIncome(month, incomeCurrencyId);
  const { data: categories } = useCategories();
  const { data: categoryBudgets } = useCategoryBudgetsForMonth(
    month,
    incomeCurrencyId,
  );
  const { data: monthTransactions } = useTransactionsByMonth(month);

  // One cached monthly total per budgeted currency. Small list at this
  // app's scale (a personal tracker rarely budgets more than a handful
  // of currencies), so N small cached queries stay simpler than a single
  // mega-query — and unlike before, they are only re-read when something
  // actually invalidates them.
  const budgetedCurrencyIds = useMemo(
    () => (budgetsThisMonth ?? []).map(budget => budget.currencyId),
    [budgetsThisMonth],
  );
  const monthlyTotalResults = useQueries({
    queries: budgetedCurrencyIds.map(currencyId => ({
      queryKey: queryKeys.transactional.transactions.monthlyTotal(
        month,
        currencyId,
      ),
      queryFn: () => getMonthlyTotal(month, currencyId),
      staleTime: TRANSACTIONAL_STALE_TIME,
    })),
  });
  // One fixed-size dependency instead of spreading a list whose length
  // tracks how many currencies are budgeted — see hooks/useStableList.ts.
  const monthlyTotals = useStableList(
    monthlyTotalResults.map(result => result.data),
  );

  const budgetCards = useMemo<DashboardBudgetCard[]>(
    () =>
      (budgetsThisMonth ?? []).map((budget, index) => {
        const total = monthlyTotals[index] ?? 0;
        const amountLeft = amountLeftFrom(budget.limitAmount, total);
        return {
          currencyId: budget.currencyId,
          currencyCode: budget.currencyCode,
          budget,
          total,
          amountLeft,
          averageLeftPerDay: averageLeftPerDayFrom(month, amountLeft),
        };
      }),
    [budgetsThisMonth, month, monthlyTotals],
  );

  const categoryBreakdown = useMemo(
    () =>
      incomeCurrencyId == null ||
      !categories ||
      !categoryBudgets ||
      !monthTransactions
        ? []
        : buildCategoryBreakdown(
            month,
            incomeCurrencyId,
            categories,
            categoryBudgets,
            monthTransactions,
          ),
    [month, incomeCurrencyId, categories, categoryBudgets, monthTransactions],
  );

  const shortcutAccounts = useMemo(
    () => buildAccountShortcuts(accounts ?? [], allBalances ?? []),
    [accounts, allBalances],
  );

  const activeLoanAccountIds = useMemo(
    () =>
      liabilities || receivables
        ? [...(liabilities ?? []), ...(receivables ?? [])].map(
            loan => loan.accountId,
          )
        : EMPTY_NUMBERS,
    [liabilities, receivables],
  );
  const totalOwedByAccountId = useLoanTotalOwedByAccountId(
    activeLoanAccountIds,
    today,
  );

  const reminders = useMemo(
    () =>
      buildUpcomingReminders(
        today,
        liabilities ?? [],
        receivables ?? [],
        upcomingInstallmentOccurrences ?? [],
        totalOwedByAccountId,
      ),
    [
      today,
      liabilities,
      receivables,
      upcomingInstallmentOccurrences,
      totalOwedByAccountId,
    ],
  );

  // Matches the original's all-or-nothing feel: the screen shows its
  // loading state until the two queries the whole layout is keyed off
  // (which currency, and which budgets exist) have resolved at least
  // once. Everything else fills in around them.
  const loading = defaultCurrencyPending || budgetsPending;

  return {
    loading,
    pendingScheduledCount: pendingScheduled?.length ?? 0,
    totalIncome: totalIncome ?? 0,
    budgetCards,
    creditCardDebt: cardDebt ?? 0,
    categoryBreakdown,
    shortcutAccounts,
    liabilityTotals: reminders.liabilityTotals,
    receivableTotals: reminders.receivableTotals,
    upcomingLoans: reminders.upcomingLoans,
    upcomingInstallments: reminders.upcomingInstallments,
  };
}
