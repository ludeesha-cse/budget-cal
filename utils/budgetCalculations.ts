import {
  getBudgetForMonth,
  getCategoryBudget,
  getMonthlyTotal,
  getTransactionsByMonth,
} from '../db/queries';
import { getCurrentMonthString, getDaysRemainingInMonth } from './dateUtils';

export async function getAmountLeft(month: string): Promise<number | null> {
  const budget = await getBudgetForMonth(month);
  if (!budget) {
    return null;
  }
  const spent = await getMonthlyTotal(month);
  return budget.limitAmount - spent;
}

export async function getAverageLeftPerDay(
  month: string,
): Promise<number | null> {
  if (month !== getCurrentMonthString()) {
    return null;
  }
  const amountLeft = await getAmountLeft(month);
  if (amountLeft === null) {
    return null;
  }
  return amountLeft / getDaysRemainingInMonth(month);
}

// Pure composition over existing queries (getCategoryBudget,
// getTransactionsByMonth) — not a DB read/write itself, so no NETWORK-READY
// comment needed here; the underlying queries already carry one.
// Expense-only, matching getMonthlyTotal's semantics — an Income entry
// filed under this category shouldn't make it look like less was spent.
export async function getCategorySpent(
  month: string,
  categoryId: number,
): Promise<number> {
  const rows = await getTransactionsByMonth(month);
  return rows
    .filter(row => row.categoryId === categoryId && row.entryType === 'Expense')
    .reduce((sum, row) => sum + row.amount, 0);
}

export async function getCategoryAmountLeft(
  month: string,
  categoryId: number,
): Promise<number | null> {
  const budget = await getCategoryBudget(month, categoryId);
  if (!budget) {
    return null;
  }
  const spent = await getCategorySpent(month, categoryId);
  return budget.amount - spent;
}

// Same day-remaining logic as getAverageLeftPerDay, applied per category.
// Only meaningful for the current month.
export async function getCategoryAverageLeftPerDay(
  month: string,
  categoryId: number,
): Promise<number | null> {
  if (month !== getCurrentMonthString()) {
    return null;
  }
  const amountLeft = await getCategoryAmountLeft(month, categoryId);
  if (amountLeft === null) {
    return null;
  }
  return amountLeft / getDaysRemainingInMonth(month);
}
