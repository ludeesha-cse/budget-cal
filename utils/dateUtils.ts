import { addDays, daysUntil } from './date';

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
// granularity only reads as meaningful within one calendar month. A
// range that doesn't start on the 1st or end on a month's last day (a
// custom range) gets its exact dates instead, e.g. "15 Jul – 2 Sep 2026",
// so a partial month is never passed off as a whole one.
export function formatRangeHeader(range: {
  startDate: string;
  endDate: string;
  months: string[];
}): string {
  if (!isWholeMonthRange(range.startDate, range.endDate)) {
    return formatDateRangeLabel(range.startDate, range.endDate);
  }
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

// Short 3-letter, uppercase month abbreviations keyed by zero-padded
// month number ('01'..'12') — used for History's per-row day/month date
// block ("07" / "AUG"). Built from the same MONTH_NAMES table as every
// other month label in this file, so it can never drift out of sync,
// and doesn't depend on MonthYearPicker's own MONTH_OPTIONS (a
// component shouldn't be something a util imports from).
const MONTH_ABBR: Record<string, string> = Object.fromEntries(
  MONTH_NAMES.map((name, index) => [
    String(index + 1).padStart(2, '0'),
    name.slice(0, 3).toUpperCase(),
  ]),
);

// Splits a 'YYYY-MM-DD' date into the day/month block History's row
// layout uses ("07" / "AUG") — pure string slicing, no Date parsing
// needed since the stored format is already zero-padded.
export function splitDateForRow(date: string): { day: string; month: string } {
  const [, month, day] = date.split('-');
  return { day, month: MONTH_ABBR[month] ?? month };
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

// ---------------------------------------------------------------------
// Report periods (Reports screen: Month | 3 Months | Year | Custom)
// ---------------------------------------------------------------------

// What the user picked. 'month' is any single calendar month ('YYYY-MM');
// the two presets stay rolling windows anchored on today exactly as
// getReportRange always computed them; 'custom' is an inclusive pair of
// 'YYYY-MM-DD' dates.
export type ReportPeriod =
  | { kind: 'month'; month: string }
  | { kind: 'last3Months' }
  | { kind: 'lastYear' }
  | { kind: 'custom'; startDate: string; endDate: string };

export type ResolvedReportPeriod = {
  kind: ReportPeriod['kind'];
  startDate: string;
  endDate: string;
  // Every calendar month the range touches, oldest first — what
  // getMonthlyTrend zero-fills against.
  months: string[];
  // Inclusive length of the range in days.
  dayCount: number;
  label: string;
};

// Custom ranges this short span at most two partial months, where a
// per-month trend would mislead (see ReportOverview for what is shown
// instead).
export const SHORT_RANGE_MAX_DAYS = 31;

const SHORT_MONTH_NAMES = MONTH_NAMES.map(name => name.slice(0, 3));

function monthEndDate(month: string): string {
  return `${month}-${String(getDaysInMonth(month)).padStart(2, '0')}`;
}

// Inclusive day count between two 'YYYY-MM-DD' dates.
export function countDaysInclusive(startDate: string, endDate: string): number {
  return daysUntil(endDate, startDate) + 1;
}

// Calendar months from the start date's month to the end date's month.
export function monthsBetween(startDate: string, endDate: string): string[] {
  const months: string[] = [];
  const last = endDate.slice(0, 7);
  for (let month = startDate.slice(0, 7); month <= last; month = addMonths(month, 1)) {
    months.push(month);
  }
  return months;
}

// True when the range starts on a 1st and ends on a month's last day.
export function isWholeMonthRange(startDate: string, endDate: string): boolean {
  return (
    startDate.endsWith('-01') && endDate === monthEndDate(endDate.slice(0, 7))
  );
}

// "3 – 19 Sep 2026", "15 Jul – 2 Sep 2026", "15 Dec 2025 – 2 Jan 2026" —
// only as much of the second date is repeated as is needed to read it.
export function formatDateRangeLabel(startDate: string, endDate: string): string {
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
  const startMonthName = SHORT_MONTH_NAMES[startMonth - 1];
  const endMonthName = SHORT_MONTH_NAMES[endMonth - 1];
  if (startDate === endDate) {
    return `${startDay} ${startMonthName} ${startYear}`;
  }
  if (startYear === endYear && startMonth === endMonth) {
    return `${startDay} – ${endDay} ${endMonthName} ${endYear}`;
  }
  if (startYear === endYear) {
    return `${startDay} ${startMonthName} – ${endDay} ${endMonthName} ${endYear}`;
  }
  return `${startDay} ${startMonthName} ${startYear} – ${endDay} ${endMonthName} ${endYear}`;
}

// "Sep 2026", "Aug – Oct 2026", "Nov 2025 – Oct 2026" — the compact name
// of a whole-month range; falls back to exact dates for anything else.
export function formatPeriodShortLabel(startDate: string, endDate: string): string {
  if (!isWholeMonthRange(startDate, endDate)) {
    return formatDateRangeLabel(startDate, endDate);
  }
  const [startYear, startMonth] = startDate.split('-').map(Number);
  const [endYear, endMonth] = endDate.split('-').map(Number);
  const start = SHORT_MONTH_NAMES[startMonth - 1];
  const end = SHORT_MONTH_NAMES[endMonth - 1];
  if (startYear === endYear && startMonth === endMonth) {
    return `${start} ${startYear}`;
  }
  if (startYear === endYear) {
    return `${start} – ${end} ${endYear}`;
  }
  return `${start} ${startYear} – ${end} ${endYear}`;
}

// The label for one row of the trend list. A month the range only
// partly covers says which days, e.g. "15 – 31 Jul 2026", instead of
// "July 2026" for a figure that leaves half of July out.
export function formatTrendRowLabel(
  month: string,
  startDate: string,
  endDate: string,
): string {
  const first = `${month}-01`;
  const last = monthEndDate(month);
  const from = startDate > first ? startDate : first;
  const to = endDate < last ? endDate : last;
  if (from === first && to === last) {
    return formatMonthLabel(month);
  }
  return formatDateRangeLabel(from, to);
}

export function resolveReportPeriod(
  period: ReportPeriod,
  today: string,
): ResolvedReportPeriod {
  let startDate: string;
  let endDate: string;
  if (period.kind === 'month') {
    startDate = `${period.month}-01`;
    endDate = monthEndDate(period.month);
  } else if (period.kind === 'custom') {
    startDate = period.startDate;
    endDate = period.endDate;
  } else {
    const range = getReportRange(
      period.kind === 'last3Months' ? 'last3Months' : 'lastYear',
      today,
    );
    startDate = range.startDate;
    endDate = range.endDate;
  }
  const months = monthsBetween(startDate, endDate);
  return {
    kind: period.kind,
    startDate,
    endDate,
    months,
    dayCount: countDaysInclusive(startDate, endDate),
    label: formatRangeHeader({ startDate, endDate, months }),
  };
}

export type CustomRangeValidation = {
  startInvalid: boolean;
  endInvalid: boolean;
  message: string | null;
};

// Start must not be after end, and neither may be in the future (there
// is nothing to report there yet).
export function validateCustomRange(
  startDate: string,
  endDate: string,
  today: string,
): CustomRangeValidation {
  const startFuture = startDate > today;
  const endFuture = endDate > today;
  if (startFuture || endFuture) {
    return {
      startInvalid: startFuture,
      endInvalid: endFuture,
      message: "Dates can't be in the future.",
    };
  }
  if (startDate > endDate) {
    return {
      startInvalid: true,
      endInvalid: true,
      message: 'Start date must be on or before the end date.',
    };
  }
  return { startInvalid: false, endInvalid: false, message: null };
}

// The N days ending today, for the "Last 7 / 30 / 90 days" chips.
export function lastNDaysRange(
  days: number,
  today: string,
): { startDate: string; endDate: string } {
  return { startDate: addDays(today, -(days - 1)), endDate: today };
}

// ---------------------------------------------------------------------
// Compare tab: the period before the selected one
// ---------------------------------------------------------------------

export type ComparisonRange = {
  startDate: string;
  endDate: string;
  // Days the range is averaged over: its full length, except a range
  // reaching past today, which only counts the days that have happened.
  dayCount: number;
  // "Sep 2026" / "1 – 11 Oct 2026"
  shortLabel: string;
  // Exact dates, "1 – 30 Sep 2026"
  dateLabel: string;
};

export type ComparisonPeriods = {
  current: ComparisonRange;
  previous: ComparisonRange;
  monthToDate: boolean;
  // Shown above the comparison when it isn't simply "whole period vs
  // whole period".
  note: string | null;
};

function comparisonRange(
  startDate: string,
  endDate: string,
  today: string,
): ComparisonRange {
  const countedEnd = endDate > today ? today : endDate;
  return {
    startDate,
    endDate,
    dayCount: Math.max(1, countDaysInclusive(startDate, countedEnd)),
    shortLabel: formatPeriodShortLabel(startDate, endDate),
    dateLabel: formatDateRangeLabel(startDate, endDate),
  };
}

// What the selected period is compared against:
//   - one calendar month: the whole previous calendar month (Sep vs Aug),
//     not "the previous 30 days". If the selected month is the one in
//     progress, it is compared like-for-like instead: 1–11 Oct vs 1–11
//     Sep, the earlier month clamped to its own length (1–30 Mar vs
//     1–28 Feb).
//   - 3 Months / Year: the same number of whole months immediately before
//     (Jul–Sep vs Apr–Jun).
//   - custom N days: the N days ending the day before it starts.
export function getPreviousPeriod(
  resolved: ResolvedReportPeriod,
  today: string,
): ComparisonPeriods {
  if (resolved.kind === 'month') {
    const month = resolved.startDate.slice(0, 7);
    const previousMonth = addMonths(month, -1);
    const inProgress =
      today.slice(0, 7) === month && today < resolved.endDate;
    if (inProgress) {
      const day = Number(today.slice(8, 10));
      const previousEndDay = Math.min(day, getDaysInMonth(previousMonth));
      const previousEnd = `${previousMonth}-${String(previousEndDay).padStart(2, '0')}`;
      const currentName = SHORT_MONTH_NAMES[Number(month.slice(5, 7)) - 1];
      const previousName = SHORT_MONTH_NAMES[Number(previousMonth.slice(5, 7)) - 1];
      return {
        current: comparisonRange(resolved.startDate, today, today),
        previous: comparisonRange(`${previousMonth}-01`, previousEnd, today),
        monthToDate: true,
        note: `Comparing 1–${day} ${currentName} with 1–${previousEndDay} ${previousName} (month to date)`,
      };
    }
    return {
      current: comparisonRange(resolved.startDate, resolved.endDate, today),
      previous: comparisonRange(
        `${previousMonth}-01`,
        monthEndDate(previousMonth),
        today,
      ),
      monthToDate: false,
      note: null,
    };
  }

  if (resolved.kind === 'custom') {
    const previousEnd = addDays(resolved.startDate, -1);
    const previousStart = addDays(resolved.startDate, -resolved.dayCount);
    return {
      current: comparisonRange(resolved.startDate, resolved.endDate, today),
      previous: comparisonRange(previousStart, previousEnd, today),
      monthToDate: false,
      note: `Comparing ${resolved.dayCount} days with the ${resolved.dayCount} days before`,
    };
  }

  const monthCount = resolved.months.length;
  const firstPrevious = addMonths(resolved.months[0], -monthCount);
  const lastPrevious = addMonths(resolved.months[0], -1);
  const current = comparisonRange(resolved.startDate, resolved.endDate, today);
  return {
    current,
    previous: comparisonRange(`${firstPrevious}-01`, monthEndDate(lastPrevious), today),
    monthToDate: false,
    // A rolling window always includes the month in progress, so its
    // daily average only counts the days so far — say so.
    note:
      resolved.endDate > today
        ? `Includes the current month to date — daily averages use the ${current.dayCount} days so far`
        : null,
  };
}
