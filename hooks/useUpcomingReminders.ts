import { totalsByCurrency } from '../utils/currencyTotals';
import { daysUntil } from '../utils/date';
import type { ActiveLoanRow } from './queries';
import type { PendingInstallmentOccurrenceRow } from '../db/queries';

const DUE_SOON_WINDOW_DAYS = 7;

export type UpcomingLoanRow = {
  accountId: number;
  counterpartyName: string;
  type: 'Liability' | 'Receivable';
  currencyCode: string;
  totalOwed: number;
  dueDate: string;
  daysUntilDue: number; // negative once overdue
};

export type UpcomingInstallmentRow = {
  id: number; // the PLAN id — what the Pay shortcut deep-links to
  name: string;
  currencyCode: string;
  nextInstallmentNumber: number;
  numberOfMonths: number;
  nextAmountDue: number;
  // Always > 0 here: anything already due has moved to the review
  // banner, so this card only ever says "due in Nd", never "overdue".
  daysUntilDue: number;
};

export type UpcomingRemindersData = {
  upcomingLoans: UpcomingLoanRow[];
  upcomingInstallments: UpcomingInstallmentRow[];
  liabilityTotals: Record<string, number>;
  receivableTotals: Record<string, number>;
};

// Due-soon/overdue loans, installment reminders, and (since they come
// off the same active-loan rows) the running liability/receivable totals
// for the Liabilities & Receivables summary card.
//
// Pure over cached inputs, same as buildCategoryBreakdown. The live
// per-loan totals still come from getLoanTotalOwed — that is a real
// database read and it keeps its own cache entry per loan (see
// useLoanTotalOwedByAccountId); what changed is that this function now
// receives the resolved map instead of firing the reads itself. Totals
// are still never trusted from a stored column: always principal plus
// interest accrued as of today.
export function buildUpcomingReminders(
  today: string,
  liabilities: ActiveLoanRow[],
  receivables: ActiveLoanRow[],
  upcomingInstallmentOccurrences: PendingInstallmentOccurrenceRow[],
  totalOwedByAccountId: Record<number, number>,
): UpcomingRemindersData {
  const withTotalOwed = (
    rows: ActiveLoanRow[],
    type: 'Liability' | 'Receivable',
  ) =>
    rows.map(row => ({
      ...row,
      type,
      totalOwed: totalOwedByAccountId[row.accountId] ?? 0,
    }));

  const liabilitiesWithTotals = withTotalOwed(liabilities, 'Liability');
  const receivablesWithTotals = withTotalOwed(receivables, 'Receivable');
  const allLoansWithTotals = [
    ...liabilitiesWithTotals,
    ...receivablesWithTotals,
  ];

  const upcomingLoans = allLoansWithTotals
    .filter((loan): loan is typeof loan & { dueDate: string } =>
      Boolean(loan.dueDate),
    )
    .map(loan => ({
      accountId: loan.accountId,
      counterpartyName: loan.counterpartyName,
      type: loan.type,
      currencyCode: loan.currencyCode,
      totalOwed: loan.totalOwed,
      dueDate: loan.dueDate,
      daysUntilDue: daysUntil(loan.dueDate, today),
    }))
    // Overdue (negative) through DUE_SOON_WINDOW_DAYS out.
    .filter(loan => loan.daysUntilDue <= DUE_SOON_WINDOW_DAYS)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  // Unlike the loans above, no window filtering happens here any more:
  // getUpcomingInstallmentOccurrences already returns exactly the rows in
  // its window, and it does so by reading the SAME occurrence table the
  // review banner reads. That is the point — this card used to derive its
  // own due date from the plan's dueDayOfMonth, which is how it ended up
  // announcing next month's installment the moment this month's was paid.
  //
  // Everything here is strictly NOT yet due (the banner owns everything
  // that is), so daysUntilDue is always positive and the two never show
  // the same plan at the same time.
  const upcomingInstallments = upcomingInstallmentOccurrences
    .map(occurrence => ({
      // The PLAN id, not the occurrence id: tapping Pay deep-links to
      // that plan on the Installment Plans screen.
      id: occurrence.installmentPlanId,
      name: occurrence.planName,
      currencyCode: occurrence.currencyCode,
      nextInstallmentNumber: occurrence.payableInstallmentNumber,
      numberOfMonths: occurrence.numberOfMonths,
      nextAmountDue: occurrence.amount,
      daysUntilDue: daysUntil(occurrence.dueDate, today),
    }))
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  return {
    upcomingLoans,
    upcomingInstallments,
    liabilityTotals: totalsByCurrency(
      liabilitiesWithTotals,
      row => row.totalOwed,
    ),
    receivableTotals: totalsByCurrency(
      receivablesWithTotals,
      row => row.totalOwed,
    ),
  };
}
