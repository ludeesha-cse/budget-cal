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

// ---------------------------------------------------------------------
// THE CAP: why a goal's saved figure is derived and never written down
// ---------------------------------------------------------------------
//
// A savings goal names a real account it saves into. The money backing
// the goal is not a separate pot — it is part of that account's ordinary
// balance, and the user can spend it at any moment without telling the
// goal anything. So the goal's saved figure has to answer a question the
// contribution rows alone cannot:
//
//   "How much of what I earmarked is actually still there?"
//
// The answer is min(what was earmarked, what the account holds). Deriving
// that on every read, rather than writing a reduced number back into the
// contribution rows, is what makes the following all fall out of ONE
// rule instead of needing a hook on every code path that moves money:
//
//   - spend from the account  -> the goal drops, with no write anywhere
//   - money comes back in     -> the goal recovers, with no write either
//   - point the goal at a
//     different account        -> it re-derives against the new balance
//   - delete a funding
//     transfer                 -> the earmark goes with it (that one IS
//                                 a write, in deleteTransfer)
//
// The alternative — writing the reduction into the contributions — would
// destroy the record of what the user originally set aside, would need
// recompute hooks on transactions, transfers, loans, payoffs,
// installments, recurring confirms and balance corrections, and would
// still be wrong the moment any of those was edited afterwards.

export type GoalAllocationInput = {
  id: number;
  // Null only for a goal whose account could not be assigned. Such a
  // goal is backed by nothing and allocates zero — it is surfaced in the
  // UI as needing an account rather than quietly reading as empty.
  accountId: number | null;
  currencyId: number;
  // The plain sum of the goal's contribution rows: what was earmarked,
  // before the account balance has any say.
  rawContributed: number;
  createdAt: number;
  status: 'active' | 'achieved' | 'abandoned';
};

// Key for one pool of money: goals compete only with goals saving into
// the SAME account in the SAME currency. Two currencies inside one
// account are two independent pools, consistent with the rest of this
// app never summing currencies together (see utils/currencyTotals.ts).
export function poolKey(accountId: number, currencyId: number): string {
  return `${accountId}:${currencyId}`;
}

// Splits an account's balance across the goals backed by it, oldest
// first, and returns each goal's actual saved figure by id.
//
// OLDEST FIRST, AND WHY IT IS NOT PRO-RATA: with 150,000 in the account
// and two goals of 100,000 each, oldest-first gives 100,000 / 50,000
// while pro-rata would give 75,000 / 75,000. Oldest-first is chosen
// because a goal that was fully funded before the second goal existed
// should not appear to lose money because of a goal created afterwards —
// the older commitment is the one already relied on. It also means only
// the newest goal moves when the balance dips, which is far easier to
// reason about than every goal shifting at once.
//
// ABANDONED GOALS TAKE NOTHING AND KEEP THEIR NUMBER: an abandoned goal
// is a historical record ("I was putting money aside for this, then
// stopped"), so it releases its share of the pool to the goals still
// running, and its own figure stays at what was contributed rather than
// being re-derived against a balance it no longer has any claim on.
// Achieved goals DO still hold their share — money reached the target
// and is presumably still sitting there waiting to be spent on it.
//
// `balanceByPool` maps poolKey(accountId, currencyId) to that pair's
// CURRENT balance (stored baseline plus every transaction's effect — the
// same figure getAllAccountBalances returns as `currentBalance`, not the
// raw account_balances row). A missing entry means the account holds
// nothing in that currency and every goal on it allocates zero.
export function allocateGoalSavings(
  goals: GoalAllocationInput[],
  balanceByPool: Map<string, number>,
): Map<number, number> {
  const savedByGoalId = new Map<number, number>();

  // Group the goals that actually draw on a pool. Abandoned goals and
  // goals with no account are settled directly and never enter a group,
  // so they cannot consume capacity from the goals that do.
  const byPool = new Map<string, GoalAllocationInput[]>();
  for (const goal of goals) {
    if (goal.status === 'abandoned') {
      savedByGoalId.set(goal.id, goal.rawContributed);
      continue;
    }
    if (goal.accountId == null) {
      savedByGoalId.set(goal.id, 0);
      continue;
    }
    const key = poolKey(goal.accountId, goal.currencyId);
    const existing = byPool.get(key);
    if (existing) {
      existing.push(goal);
    } else {
      byPool.set(key, [goal]);
    }
  }

  for (const [key, poolGoals] of byPool) {
    // A negative balance (an overdrawn account) backs nothing at all —
    // clamped here rather than allowed to flow through as a negative
    // "remaining", which would make the arithmetic below hand out
    // negative saved amounts.
    let remaining = Math.max(0, balanceByPool.get(key) ?? 0);
    // Oldest first, with id as the tie-break so two goals created in the
    // same millisecond still get a stable, repeatable order rather than
    // one that depends on how the rows happened to come back.
    const ordered = [...poolGoals].sort(
      (a, b) => a.createdAt - b.createdAt || a.id - b.id,
    );
    for (const goal of ordered) {
      // Math.max guards a negative rawContributed, which should be
      // impossible (every contribution amount is validated positive) but
      // would otherwise ADD to `remaining` and inflate the next goal.
      const claim = Math.max(0, goal.rawContributed);
      const granted = Math.min(claim, remaining);
      savedByGoalId.set(goal.id, granted);
      remaining -= granted;
    }
  }

  return savedByGoalId;
}
