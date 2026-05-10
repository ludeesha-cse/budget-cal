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

// Shifts a 'YYYY-MM' month string by `delta` whole months (negative goes
// back). Pure integer arithmetic on the zero-based month index rather
// than constructing a Date, so there's no risk of a day-of-month
// (e.g. the 31st) rolling into the wrong month the way `new Date(y, m, d)`
// arithmetic sometimes does — this function never carries a day at all.
function addMonths(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const zeroBasedTotal = monthNumber - 1 + delta;
  // Floor-divide, not truncate — a negative zeroBasedTotal (going back
  // past January) must still land on a valid 0-11 month index rather
  // than a negative one, which is what plain `%` would give for a
  // negative dividend in JS.
  const newYear = year + Math.floor(zeroBasedTotal / 12);
  const newMonthZeroBased = ((zeroBasedTotal % 12) + 12) % 12;
  return `${newYear}-${String(newMonthZeroBased + 1).padStart(2, '0')}`;
}

export type ReportRangePreset = 'currentMonth' | 'last3Months' | 'lastYear';

// How many whole months to go back from the current month, inclusive of
// the current month itself — e.g. last3Months with monthsBack=2 means
// "the current month plus the 2 before it" = 3 months total.
const REPORT_RANGE_MONTHS_BACK: Record<ReportRangePreset, number> = {
  currentMonth: 0,
  last3Months: 2,
  lastYear: 11,
};

// Stage 16a: rolling report windows, always anchored on `today` and
// always including the current month — a report that stopped at "last
// month" would be missing the very month someone opening Reports is
// usually most curious about. Returns the explicit month list (not just
// a date range) because getMonthlyTrend needs to report a zero for any
// month with no activity at all, which a plain start/end date range
// can't express — there's no row to derive a month from if nothing was
// ever recorded in it.
export function getReportRange(
  preset: ReportRangePreset,
  today: string,
): { startDate: string; endDate: string; months: string[] } {
  const currentMonth = today.slice(0, 7);
  const monthsBack = REPORT_RANGE_MONTHS_BACK[preset];
  const months: string[] = [];
  for (let i = monthsBack; i >= 0; i--) {
    months.push(addMonths(currentMonth, -i));
  }
  const startMonth = months[0];
  const endMonth = months[months.length - 1];
  const startDate = `${startMonth}-01`;
  const endDate = `${endMonth}-${String(getDaysInMonth(endMonth)).padStart(2, '0')}`;
  return { startDate, endDate, months };
}
