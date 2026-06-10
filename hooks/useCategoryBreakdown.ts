import { useCallback, useState } from 'react';
import {
  getCategories,
  getCategoryBudgetsForMonth,
  getTransactionsByMonth,
} from '../db/queries';
import {
  getCategoryAmountLeft,
  getCategoryAverageLeftPerDay,
} from '../utils/budgetCalculations';
import { labelForId } from '../utils/pickerLabels';

export type CategoryBreakdownRow = {
  categoryId: number;
  categoryName: string;
  spent: number;
  budgetAmount: number | null;
  amountLeft: number | null;
  averageLeftPerDay: number | null;
};

export interface UseCategoryBreakdownResult {
  categoryBreakdown: CategoryBreakdownRow[];
  setCategoryBreakdown: React.Dispatch<React.SetStateAction<CategoryBreakdownRow[]>>;
  computeCategoryBreakdown: (month: string) => Promise<CategoryBreakdownRow[]>;
}

// Dashboard's own hand-built "spent vs. budget per category" list —
// pulled out of the old ~225-line focus-effect callback (Step 16).
// `computeCategoryBreakdown` is a pure fetch-and-shape function rather
// than a self-contained fetch-on-focus hook (unlike most other useXData
// hooks in this codebase) — it never calls setCategoryBreakdown itself.
// That's deliberate: useDashboardData runs it alongside its own fetches
// inside one shared useFocusEffect and only commits the result if that
// effect's own single `cancelled` flag is still false once everything
// resolves, exactly mirroring the original screen's one-cancellation-
// guard-for-everything behavior.
export function useCategoryBreakdown(): UseCategoryBreakdownResult {
  const [categoryBreakdown, setCategoryBreakdown] = useState<
    CategoryBreakdownRow[]
  >([]);

  const computeCategoryBreakdown = useCallback(
    async (month: string): Promise<CategoryBreakdownRow[]> => {
      const [categories, categoryBudgets, monthTransactions] =
        await Promise.all([
          getCategories(),
          getCategoryBudgetsForMonth(month),
          getTransactionsByMonth(month),
        ]);

      // Expense-only, same as getMonthlyTotal — an Income entry filed
      // under a category shouldn't reduce how "spent" it looks. Every
      // Expense still requires a category (only Income can be null, as
      // of the categoryId-nullable migration); the null check here just
      // satisfies that at the type level too. Also skips
      // excludeFromBudget transactions, same as
      // getMonthlyTotal/getCategorySpent — getTransactionsByMonth itself
      // still returns everything (History needs the full record), so
      // this is the one place Dashboard applies the exclusion to its own
      // hand-built category breakdown.
      const spentByCategory = new Map<number, number>();
      for (const transaction of monthTransactions) {
        if (
          transaction.entryType !== 'Expense' ||
          transaction.categoryId == null ||
          transaction.excludeFromBudget
        ) {
          continue;
        }
        const categoryId = transaction.categoryId;
        spentByCategory.set(
          categoryId,
          (spentByCategory.get(categoryId) ?? 0) + transaction.amount,
        );
      }
      const budgetByCategory = new Map(
        categoryBudgets.map(row => [row.categoryId, row.amount]),
      );
      const categoryIdsToShow = new Set<number>([
        ...spentByCategory.keys(),
        ...budgetByCategory.keys(),
      ]);
      const breakdown = await Promise.all(
        Array.from(categoryIdsToShow).map(async categoryId => {
          const categoryName = labelForId(
            categories,
            categoryId,
            'name',
            'Unknown category',
          );
          const spent = spentByCategory.get(categoryId) ?? 0;
          const budgetAmount = budgetByCategory.get(categoryId) ?? null;
          const hasBudget = budgetAmount !== null;
          const [rowAmountLeft, rowAverageLeftPerDay] = hasBudget
            ? await Promise.all([
                getCategoryAmountLeft(month, categoryId),
                getCategoryAverageLeftPerDay(month, categoryId),
              ])
            : [null, null];
          return {
            categoryId,
            categoryName,
            spent,
            budgetAmount,
            amountLeft: rowAmountLeft,
            averageLeftPerDay: rowAverageLeftPerDay,
          };
        }),
      );
      // Budgeted categories first (the dashboard preview only makes
      // sense for a "spent X of Y — Z%" reading), then by how much of
      // the budget is used, so the categories closest to (or over) their
      // limit surface first — the ones worth a glance.
      breakdown.sort((a, b) => {
        if (a.budgetAmount == null && b.budgetAmount == null) {
          return a.categoryName.localeCompare(b.categoryName);
        }
        if (a.budgetAmount == null) return 1;
        if (b.budgetAmount == null) return -1;
        const aPct = a.budgetAmount > 0 ? a.spent / a.budgetAmount : 0;
        const bPct = b.budgetAmount > 0 ? b.spent / b.budgetAmount : 0;
        return bPct - aPct;
      });

      return breakdown;
    },
    [],
  );

  return { categoryBreakdown, setCategoryBreakdown, computeCategoryBreakdown };
}
