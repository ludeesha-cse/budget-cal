import { getBudgetForMonth, getMonthlyTotal } from '../db/queries';
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
