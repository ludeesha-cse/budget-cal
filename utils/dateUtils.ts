export { getCurrentMonthString } from './date';

// Hardcoded name tables rather than Intl/toLocaleString — same reasoning
// as utils/formatAmount.ts: these only ever need a fixed English label,
// never actual locale-aware formatting, so there's nothing to gain from
// depending on Hermes' locale-data being complete on every device. Single
// source for both Dashboard and Reports, which previously each hardcoded
// their own byte-for-byte-identical copy of MONTH_NAMES.
export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

// "1st" / "2nd" / "3rd" / "4th" — only ever fed a day-of-month (1-31), so
// no need to handle negative numbers or anything outside that range.
export function ordinalSuffix(day: number): string {
  if (day % 10 === 1 && day !== 11) return 'st';
  if (day % 10 === 2 && day !== 12) return 'nd';
  if (day % 10 === 3 && day !== 13) return 'rd';
  return 'th';
}

// "August 2026"
export function formatMonthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${MONTH_NAMES[monthNumber - 1]} ${year}`;
}

// "August" — same data as formatMonthLabel but without the year, for
// contexts (e.g. a section title already scoped to "this year") where
// repeating the year would be redundant.
export function formatMonthTitle(month: string): string {
  const [, monthNumber] = month.split('-').map(Number);
  return MONTH_NAMES[monthNumber - 1];
}

// Short 3-letter form of the same month names, for chart axis labels
// where formatMonthLabel's "August 2026" would be far too wide — sliced
// from the same MONTH_NAMES array rather than a second hardcoded list,
// so the two labelings can never drift out of sync.
export function formatMonthAxisLabel(month: string): string {
  const [, monthNumber] = month.split('-').map(Number);
  return MONTH_NAMES[monthNumber - 1].slice(0, 3);
}

// "1 – 31 August 2026" for a single-month range, or falls back to
// "August 2026 – October 2026" for a multi-month one — day-level
// granularity only reads as meaningful within one calendar month.
export function formatRangeHeader(range: {
  startDate: string;
  endDate: string;
  months: string[];
}): string {
  if (range.months.length === 1) {
    const [, monthNumber, endDay] = range.endDate.split('-').map(Number);
    const startDay = Number(range.startDate.split('-')[2]);
    const year = Number(range.startDate.split('-')[0]);
    return `${startDay} – ${endDay} ${MONTH_NAMES[monthNumber - 1]} ${year}`;
  }
  return `${formatMonthLabel(range.months[0])} – ${formatMonthLabel(range.months[range.months.length - 1])}`;
}

// "SAT, 10 AUG"
export function formatEyebrowDate(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00`);
  const day = DAY_NAMES[date.getDay()].toUpperCase();
  const month = MONTH_NAMES[date.getMonth()].slice(0, 3).toUpperCase();
  return `${day}, ${date.getDate()} ${month}`;
}

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
