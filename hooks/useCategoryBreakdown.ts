import {
  amountLeftFrom,
  averageLeftPerDayFrom,
  categorySpentFrom,
} from '../utils/budgetCalculations';
import { labelForId } from '../utils/pickerLabels';
import type { CategoryRow } from './queries';
import type {
  getCategoryBudgetsForMonth,
  getTransactionsByMonth,
} from '../db/queries';

export type CategoryBreakdownRow = {
  categoryId: number;
  categoryName: string;
  spent: number;
  budgetAmount: number | null;
  amountLeft: number | null;
  averageLeftPerDay: number | null;
};

type CategoryBudgetRow = Awaited<
  ReturnType<typeof getCategoryBudgetsForMonth>
>[number];
type MonthTransactionRow = Awaited<
  ReturnType<typeof getTransactionsByMonth>
>[number];

// Dashboard's own hand-built "spent vs. budget per category" list.
//
// Now a PURE function over three cached queries (categories, this
// month's category budgets, this month's transactions) rather than a
// hook that fetched them itself. Two things drove that: under the
// caching rules a calculation over already-fetched data is not a
// candidate for its own cache entry, and the old version's per-category
// getCategoryAmountLeft/getCategoryAverageLeftPerDay calls each re-read
// the entire month's transactions — an N+1 over data the caller was
// already holding. The arithmetic below is the same arithmetic those
// functions do, run once over one copy of the rows.
//
// Scoped to a single currency (Stage 21b) — this used to sum every
// transaction's amount across every currency into one figure per
// category, which silently mixed e.g. a USD purchase into an LKR
// category's "spent" total. Dashboard only ever shows one at-a-glance
// breakdown list (unlike CategoryBudgetsScreen, which gets a full
// currency-tabbed view — see that screen), so this is scoped to the
// app's default currency; a category budgeted only in a second currency
// simply won't appear in this preview, the same way its overall budget
// card only shows up if that currency has a budget at all.
export function buildCategoryBreakdown(
  month: string,
  currencyId: number,
  categories: CategoryRow[],
  categoryBudgets: CategoryBudgetRow[],
  monthTransactions: MonthTransactionRow[],
): CategoryBreakdownRow[] {
  // Expense-only, same as getMonthlyTotal — an Income entry filed under
  // a category shouldn't reduce how "spent" it looks. Every Expense
  // still requires a category (only Income can be null, as of the
  // categoryId-nullable migration); the null check here just satisfies
  // that at the type level too. Also skips excludeFromBudget
  // transactions, same as getMonthlyTotal/getCategorySpent —
  // getTransactionsByMonth itself still returns everything (History
  // needs the full record), so this is the one place Dashboard applies
  // the exclusion to its own hand-built category breakdown. currencyId
  // filter is the Stage 21b fix described above.
  const spentByCategory = new Map<number, number>();
  for (const transaction of monthTransactions) {
    if (
      transaction.entryType !== 'Expense' ||
      transaction.categoryId == null ||
      transaction.currencyId !== currencyId ||
      transaction.excludeFromBudget
    ) {
      continue;
    }
    const id = transaction.categoryId;
    spentByCategory.set(id, (spentByCategory.get(id) ?? 0) + transaction.amount);
  }

  const budgetByCategory = new Map(
    categoryBudgets.map(row => [row.categoryId, row.amount]),
  );
  const categoryIdsToShow = new Set<number>([
    ...spentByCategory.keys(),
    ...budgetByCategory.keys(),
  ]);

  const breakdown = Array.from(categoryIdsToShow).map(categoryId => {
    const categoryName = labelForId(
      categories,
      categoryId,
      'name',
      'Unknown category',
    );
    const spent = spentByCategory.get(categoryId) ?? 0;
    const budgetAmount = budgetByCategory.get(categoryId) ?? null;
    // categorySpentFrom re-derives the per-category spend from the same
    // rows rather than reusing `spent` above, so this stays identical to
    // what getCategoryAmountLeft would have computed even if the two
    // filters ever drift apart.
    const rowAmountLeft =
      budgetAmount === null
        ? null
        : amountLeftFrom(
            budgetAmount,
            categorySpentFrom(monthTransactions, categoryId, currencyId),
          );
    return {
      categoryId,
      categoryName,
      spent,
      budgetAmount,
      amountLeft: rowAmountLeft,
      averageLeftPerDay: averageLeftPerDayFrom(month, rowAmountLeft),
    };
  });

  // Budgeted categories first (the dashboard preview only makes sense
  // for a "spent X of Y — Z%" reading), then by how much of the budget
  // is used, so the categories closest to (or over) their limit surface
  // first — the ones worth a glance.
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
}
