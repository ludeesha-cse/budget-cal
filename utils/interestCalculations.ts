// Pure math only — no DB access here, so no NETWORK-READY comments apply.
// Every loan figure in the app (LiabilitiesReceivablesScreen, Dashboard,
// settleLoan) is computed live by calling these against the stored
// principal + anchor date, never by writing an accrued number back into
// the database — that's what keeps "today's total owed" always correct
// without a background job to update it.

/**
 * Whole days between two 'YYYY-MM-DD' dates. `Date` parses a bare
 * 'YYYY-MM-DD' string as UTC midnight, so both ends land on the same
 * time-of-day and subtracting just counts calendar days — no timezone or
 * DST drift to worry about as long as both inputs stay in this format.
 */
function daysBetween(fromDate: string, toDate: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const from = new Date(`${fromDate}T00:00:00Z`).getTime();
  const to = new Date(`${toDate}T00:00:00Z`).getTime();
  return Math.round((to - from) / msPerDay);
}

/**
 * Simple (non-compounding) daily interest: the daily rate is applied to
 * the original `principal` for every elapsed day, not to a growing
 * principal-plus-interest balance. This is a deliberate simplification —
 * do not "fix" this into compounding. A monthly rate is treated as
 * accruing evenly over 30 days and an annual rate over 365, since neither
 * loan_details.interestPeriod option carries actual calendar-month/leap-
 * year bookkeeping; it's a stated approximation, not a bug.
 *
 * interestRate is stored as rate × 100 (5.5% is 550), so it's divided by
 * 100 first to recover the real percentage, then again by 100 to convert
 * percent to a fraction — hence /100/100, folded into a single /10000
 * below for the annual case and /100/30/100 (=/3000) for monthly, kept
 * spelled out rather than pre-simplified so the "why" stays visible.
 */
export function calculateAccruedInterest(
  principal: number,
  interestRate: number,
  interestPeriod: 'monthly' | 'annual',
  fromDate: string,
  toDate: string,
): number {
  const realRate = interestRate / 100 / 100; // e.g. 550 -> 5.5 -> 0.055
  const dailyRate = interestPeriod === 'annual' ? realRate / 365 : realRate / 30;
  const daysElapsed = daysBetween(fromDate, toDate);
  const accrued = principal * dailyRate * daysElapsed;
  // No fractional currency units — matches how every other amount in
  // this app (transactions, balances) is already stored and displayed.
  return Math.round(accrued);
}

/**
 * What's actually owed on a loan today: principal alone if no interest
 * rate was set on it (rate/period are optional per Stage 9a), otherwise
 * principal plus everything accrued since the last settlement (or since
 * the loan was opened, if it's never been settled) — see loan_details'
 * lastAccrualAnchorDate comment for why that anchor, not dateCreated, is
 * the starting point.
 */
export function getTotalOwed(
  principal: number,
  interestRate: number | null,
  interestPeriod: 'monthly' | 'annual' | null,
  lastAccrualAnchorDate: string,
  asOfDate: string,
): number {
  if (interestRate == null || interestPeriod == null) {
    return principal;
  }
  return (
    principal +
    calculateAccruedInterest(
      principal,
      interestRate,
      interestPeriod,
      lastAccrualAnchorDate,
      asOfDate,
    )
  );
}
