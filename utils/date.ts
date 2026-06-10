export function formatDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCurrentDateString(): string {
  return formatDateString(new Date());
}

export function getCurrentMonthString(): string {
  return getCurrentDateString().slice(0, 7);
}

export function getCurrentYearString(): string {
  return getCurrentDateString().slice(0, 4);
}

// Whole calendar days from today to dueDate — negative once the due date
// has passed, same UTC-midnight-parse trick as
// utils/interestCalculations.ts's daysBetween, kept separate since this
// one only needs to compare against "today" rather than two arbitrary
// dates. Used by Dashboard's due-soon/overdue reminders (loans and
// installments).
export function daysUntil(dueDate: string, today: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const due = new Date(`${dueDate}T00:00:00Z`).getTime();
  const now = new Date(`${today}T00:00:00Z`).getTime();
  return Math.round((due - now) / msPerDay);
}

// A recurring rule set for day 31 must still fire in a month that only
// has 28, 29, or 30 days — this decides which real calendar date that
// becomes (Stage 13b). `month` is 1-based (2 = February), matching every
// other month value in this codebase's 'YYYY-MM' string convention, even
// though the underlying Date constructor takes a 0-based month — passing
// day 0 of that same 1-based `month` lands on the last day of the
// *previous* (0-based) month, which is exactly the month we mean.
export function clampDayToMonth(
  year: number,
  month: number,
  dayOfMonth: number,
): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  return Math.min(dayOfMonth, daysInMonth);
}

// The next clamped occurrence of `dayOfMonth` on or after `fromDate` —
// this month's clamped date if that hasn't passed yet, otherwise next
// month's. Used for installment plan due-date reminders (Dashboard),
// which only ever care about the single next occurrence, unlike
// getOccurrenceDatesBetween's whole-range walk below.
export function getNextOccurrenceDate(
  dayOfMonth: number,
  fromDate: string,
): string {
  const [year, month] = fromDate.split('-').map(Number);
  const thisMonthDay = clampDayToMonth(year, month, dayOfMonth);
  const thisMonthDate = `${year}-${String(month).padStart(2, '0')}-${String(
    thisMonthDay,
  ).padStart(2, '0')}`;
  if (thisMonthDate >= fromDate) {
    return thisMonthDate;
  }
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonthDay = clampDayToMonth(nextYear, nextMonth, dayOfMonth);
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(
    nextMonthDay,
  ).padStart(2, '0')}`;
}

// Every clamped occurrence date for `dayOfMonth` between fromDate and
// toDate inclusive, one per calendar month in range. Pure — no DB access
// — so generatePendingOccurrences (db/queries.ts) can lean on this for
// the actual date math while only handling persistence itself. Walks
// whole months rather than days so a short month (e.g. February when
// dayOfMonth is 31) only ever contributes its one clamped date, never
// zero and never two.
export function getOccurrenceDatesBetween(
  dayOfMonth: number,
  fromDate: string,
  toDate: string,
): string[] {
  const [fromYear, fromMonth] = fromDate.split('-').map(Number);
  const [toYear, toMonth] = toDate.split('-').map(Number);

  const dates: string[] = [];
  let year = fromYear;
  let month = fromMonth;
  while (year < toYear || (year === toYear && month <= toMonth)) {
    const clampedDay = clampDayToMonth(year, month, dayOfMonth);
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(
      clampedDay,
    ).padStart(2, '0')}`;
    if (dateStr >= fromDate && dateStr <= toDate) {
      dates.push(dateStr);
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return dates;
}
