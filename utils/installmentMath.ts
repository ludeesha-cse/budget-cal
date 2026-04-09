// Pure math for installment plan schedules — no DB access, no rounding
// surprises hidden behind a query. Both entry points return the same
// three numbers (monthlyAmount, finalInstallmentAmount, totalRepayable)
// so db/queries.ts's createInstallmentPlan can store whichever came out,
// regardless of which mode the user picked.

export type InstallmentSchedule = {
  monthlyAmount: number;
  finalInstallmentAmount: number;
  totalRepayable: number;
};

// FLAT interest, not reducing-balance/EMI amortization. Every month's
// interest is charged against the ORIGINAL principal for the plan's
// entire life, the way a simple in-store installment plan (not a bank
// loan) is typically quoted — a future reader used to amortizing loans
// (loan_details/settleLoan's reducing-balance interest, from Stage 9b)
// should not assume this function works the same way; it deliberately
// doesn't.
//
// interestRate is stored the same way loan_details.interestRate is
// (rate × 100, so 10% is 1000) — dividing by 10000 rather than 100
// undoes both that ×100 storage AND converts the percentage to a
// fraction in one step (1000 / 10000 = 0.10).
export function calculateFromPrincipal(
  principal: number,
  interestRate: number,
  months: number,
): InstallmentSchedule {
  const totalRepayable = Math.round(principal * (1 + interestRate / 10000));
  const monthlyAmount = Math.round(totalRepayable / months);
  // The last installment absorbs whatever rounding remainder the other
  // (months - 1) equal installments didn't — see the invariant below,
  // which is the entire reason this field exists instead of every
  // installment just being totalRepayable / months.
  const finalInstallmentAmount =
    totalRepayable - monthlyAmount * (months - 1);
  return { monthlyAmount, finalInstallmentAmount, totalRepayable };
}

// No interest at all — the user already knows the flat monthly figure
// (e.g. a phone or appliance installment plan quoted as "$50/month for
// 12 months"), so there's nothing to compute except the total.
export function calculateFromMonthly(
  monthlyAmount: number,
  months: number,
): InstallmentSchedule {
  const totalRepayable = monthlyAmount * months;
  const finalInstallmentAmount = monthlyAmount;
  return { monthlyAmount, finalInstallmentAmount, totalRepayable };
}

// INVARIANT (must hold exactly for both functions above):
//   monthlyAmount * (months - 1) + finalInstallmentAmount === totalRepayable
// This is the whole reason finalInstallmentAmount is stored as its own
// field rather than always being equal to monthlyAmount: rounding
// totalRepayable / months to a whole number for every "regular" month
// almost never divides evenly, and without a differently-sized final
// installment to absorb the remainder, the sum of all installments would
// silently drift away from totalRepayable by a few units.
