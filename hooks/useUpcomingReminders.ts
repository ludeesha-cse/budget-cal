import { totalsByCurrency } from '../utils/currencyTotals';
import { daysUntil } from '../utils/date';
import type { ActiveLoanRow } from './queries';
import type { getInstallmentReminders } from '../db/queries';

const DUE_SOON_WINDOW_DAYS = 7;
// Narrower than loans' own DUE_SOON_WINDOW_DAYS — installment reminders
// are meant to catch "this is about to come out of your account", not a
// week-out heads-up, per the explicit "within 3 or 4 days" ask.
const INSTALLMENT_REMINDER_WINDOW_DAYS = 4;

type InstallmentReminderRow = Awaited<
  ReturnType<typeof getInstallmentReminders>
>[number];

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
  id: number;
  name: string;
  currencyCode: string;
  nextInstallmentNumber: number;
  numberOfMonths: number;
  nextAmountDue: number;
  daysUntilDue: number; // negative once overdue, same convention as UpcomingLoanRow
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
  installmentReminders: InstallmentReminderRow[],
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

  // Same overdue-through-window shape as upcoming loans just above,
  // narrower window (see INSTALLMENT_REMINDER_WINDOW_DAYS' own comment)
  // — installmentReminders itself already excludes fully-paid plans and
  // plans with no due date set.
  const upcomingInstallments = installmentReminders
    .map(reminder => ({
      ...reminder,
      daysUntilDue: daysUntil(reminder.nextDueDate, today),
    }))
    .filter(
      reminder => reminder.daysUntilDue <= INSTALLMENT_REMINDER_WINDOW_DAYS,
    )
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
