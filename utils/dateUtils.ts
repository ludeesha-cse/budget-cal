export { getCurrentMonthString } from './date';

export function getDaysInMonth(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

// Assumes `month` is the current month — anchors the count on today's
// day-of-month, so it's only meaningful for the month in progress.
export function getDaysRemainingInMonth(month: string): number {
  const daysInMonth = getDaysInMonth(month);
  const today = new Date();
  return daysInMonth - today.getDate() + 1;
}
