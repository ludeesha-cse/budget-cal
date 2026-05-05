// Pure math for Stage 14's savings goals — no DB access, so both of
// these can be unit-tested (and are, via a standalone dry-run script)
// without touching SQLite at all.

// Fraction of the target already contributed. Deliberately unclamped —
// over-saving past the target is a real, good outcome (e.g. 1.35 for
// 135%) and must display as such, not be capped at 1 or treated as an
// error. targetAmount <=0 only guards against a divide-by-zero on a
// value that should never occur in practice (createSavingsGoal rejects
// a non-positive target); returning 0 here is just a safe display
// fallback, never a thrown error over what's ultimately just a number
// on screen.
export function getProgress(
  totalContributed: number,
  targetAmount: number,
): number {
  if (targetAmount <= 0) {
    return 0;
  }
  return totalContributed / targetAmount;
}

// Whole calendar months between two 'YYYY-MM-DD' dates, floored toward
// zero (i.e. only counts a month once the same day-of-month has been
// reached) — this is what makes getRequiredPerMonth's "less than one
// month remaining" branch below mean the same thing a person would
// mean by it, rather than an approximate 30-day average.
function monthsBetween(fromDate: string, toDate: string): number {
  const [fromYear, fromMonth, fromDay] = fromDate.split('-').map(Number);
  const [toYear, toMonth, toDay] = toDate.split('-').map(Number);
  let months = (toYear - fromYear) * 12 + (toMonth - fromMonth);
  if (toDay < fromDay) {
    // The target's day-of-month hasn't been reached yet in what would
    // otherwise be the final counted month, so that last month isn't
    // actually complete — e.g. Aug 15 -> Nov 1 is 2 whole months, not 3.
    months -= 1;
  }
  return months;
}

// What must be set aside each month, from today, to reach the target by
// targetDate — or null when "per month" no longer means anything because
// the date has already arrived (the UI shows an overdue state instead of
// a number in that case; see SavingsGoalsScreen).
export function getRequiredPerMonth(
  remaining: number,
  targetDate: string,
  today: string,
): number | null {
  // Already there (or over) — there's nothing left to divide across any
  // number of months, so the honest answer is zero, not a negative
  // figure or a divide producing something nonsensical.
  if (remaining <= 0) {
    return 0;
  }
  // Due today or already in the past: dividing a positive remaining
  // amount by zero or negative months would produce Infinity or a
  // negative "required per month", neither of which means anything to a
  // person — this is what an overdue goal actually is, so the caller is
  // expected to render that state instead of a number.
  if (targetDate <= today) {
    return null;
  }
  const months = monthsBetween(today, targetDate);
  // Less than a full month left: dividing by a fractional or zero month
  // count would inflate or blow up the figure. The honest number here
  // is simply "you need the whole remaining amount now."
  if (months < 1) {
    return remaining;
  }
  return remaining / months;
}
