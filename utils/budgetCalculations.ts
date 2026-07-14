import {
  getBudgetForMonth,
  getCategoryBudget,
  getMonthlyTotal,
  getTransactionsByMonth,
} from '../db/queries';
import { getCurrentMonthString, getDaysRemainingInMonth } from './dateUtils';

export async function getAmountLeft(
  month: string,
  currencyId: number,
): Promise<number | null> {
  const budget = await getBudgetForMonth(month, currencyId);
  if (!budget) {
    return null;
  }
  const spent = await getMonthlyTotal(month, currencyId);
  return budget.limitAmount - spent;
}

export async function getAverageLeftPerDay(
  month: string,
  currencyId: number,
): Promise<number | null> {
  if (month !== getCurrentMonthString()) {
    return null;
  }
  const amountLeft = await getAmountLeft(month, currencyId);
  if (amountLeft === null) {
    return null;
  }
  return amountLeft / getDaysRemainingInMonth(month);
}

// Distinct from getAverageLeftPerDay on purpose: that one spreads what's
// still *unspent* over the days *remaining* in the current month (and only
// ever makes sense for the current month). This one spreads the *entire*
// budget amount over the *full* length of whatever month it's set for —
// a flat "roughly how much per day is this budget" figure, meaningful even
// while editing a future or past month's budget where "days remaining"
// wouldn't apply. Pure math over caller-supplied numbers rather than a DB
// query itself, since the budget amount here may be a not-yet-saved value
// still being typed into a form.
export function getFullBudgetPerDay(
  budgetAmount: number,
  daysInMonth: number,
): number {
  return budgetAmount / daysInMonth;
}

// Pure composition over existing queries (getCategoryBudget,
// getTransactionsByMonth) — not a DB read/write itself, so no NETWORK-READY
// comment needed here; the underlying queries already carry one.
// Expense-only, matching getMonthlyTotal's semantics — an Income entry
// filed under this category shouldn't make it look like less was spent.
// getTransactionsByMonth deliberately returns every transaction
// (including excludeFromBudget ones — History needs the full record), so
// this is the one place that applies the Stage 16a exclusion, matching
// getMonthlyTotal's own filtering for the same reason. Also currency-
// scoped now (Stage 21b) — a category budget set in one currency must
// only ever be compared against spending in that same currency.
export async function getCategorySpent(
  month: string,
  categoryId: number,
  currencyId: number,
): Promise<number> {
  const rows = await getTransactionsByMonth(month);
  return rows
    .filter(
      row =>
        row.categoryId === categoryId &&
        row.entryType === 'Expense' &&
        row.currencyId === currencyId &&
        !row.excludeFromBudget,
    )
    .reduce((sum, row) => sum + row.amount, 0);
}

export async function getCategoryAmountLeft(
  month: string,
  categoryId: number,
  currencyId: number,
): Promise<number | null> {
  const budget = await getCategoryBudget(month, categoryId, currencyId);
  if (!budget) {
    return null;
  }
  const spent = await getCategorySpent(month, categoryId, currencyId);
  return budget.amount - spent;
}

// Same day-remaining logic as getAverageLeftPerDay, applied per category.
// Only meaningful for the current month.
export async function getCategoryAverageLeftPerDay(
  month: string,
  categoryId: number,
  currencyId: number,
): Promise<number | null> {
  if (month !== getCurrentMonthString()) {
    return null;
  }
  const amountLeft = await getCategoryAmountLeft(month, categoryId, currencyId);
  if (amountLeft === null) {
    return null;
  }
  return amountLeft / getDaysRemainingInMonth(month);
}

// ---------------------------------------------------------------------
// Pure counterparts of the four functions above, for callers that
// already hold the rows.
//
// Added with the TanStack Query caching layer. The async versions above
// each re-query the database for numbers a screen has usually already
// fetched — getAmountLeft re-reads the budget and the month's total that
// the dashboard is holding in cache, and getCategoryAmountLeft re-reads
// the whole month's transactions once PER CATEGORY. Under the caching
// rules those are calculations over already-fetched data, not reads
// worth a cache entry of their own, so this is what the hooks use. The
// async versions are unchanged for any caller that genuinely starts
// from nothing.
// ---------------------------------------------------------------------

export function amountLeftFrom(
  limitAmount: number | null | undefined,
  spent: number,
): number | null {
  if (limitAmount == null) {
    return null;
  }
  return limitAmount - spent;
}

// Same rule as getAverageLeftPerDay: only ever meaningful for the
// current month, so any other month returns null rather than a figure
// that would read as authoritative.
export function averageLeftPerDayFrom(
  month: string,
  amountLeft: number | null,
): number | null {
  if (month !== getCurrentMonthString() || amountLeft === null) {
    return null;
  }
  return amountLeft / getDaysRemainingInMonth(month);
}

// Byte-for-byte the same filter getCategorySpent applies, over rows the
// caller already has: Expense-only, this category, this currency, and
// never an excludeFromBudget row.
export function categorySpentFrom(
  rows: Array<{
    categoryId: number | null;
    entryType: string;
    currencyId: number;
    excludeFromBudget: boolean | null;
    amount: number;
  }>,
  categoryId: number,
  currencyId: number,
): number {
  return rows
    .filter(
      row =>
        row.categoryId === categoryId &&
        row.entryType === 'Expense' &&
        row.currencyId === currencyId &&
        !row.excludeFromBudget,
    )
    .reduce((sum, row) => sum + row.amount, 0);
}
