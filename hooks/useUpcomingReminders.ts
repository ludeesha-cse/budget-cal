import { useCallback, useState } from 'react';
import {
  getActiveLoanAccounts,
  getInstallmentReminders,
  getLoanTotalOwed,
} from '../db/queries';
import { totalsByCurrency } from '../utils/currencyTotals';
import { daysUntil } from '../utils/date';

const DUE_SOON_WINDOW_DAYS = 7;
// Narrower than loans' own DUE_SOON_WINDOW_DAYS — installment reminders
// are meant to catch "this is about to come out of your account", not a
// week-out heads-up, per the explicit "within 3 or 4 days" ask.
const INSTALLMENT_REMINDER_WINDOW_DAYS = 4;

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

export interface UseUpcomingRemindersResult extends UpcomingRemindersData {
  setUpcomingReminders: React.Dispatch<React.SetStateAction<UpcomingRemindersData>>;
  computeUpcomingReminders: (today: string) => Promise<UpcomingRemindersData>;
}

const EMPTY_DATA: UpcomingRemindersData = {
  upcomingLoans: [],
  upcomingInstallments: [],
  liabilityTotals: {},
  receivableTotals: {},
};

// Due-soon/overdue loans, installment reminders, and (since they share
// the same getActiveLoanAccounts + getLoanTotalOwed fetch as the loans
// half of this) the running liability/receivable totals for the
// Liabilities & Receivables summary card. Same pure-compute-function
// shape as useCategoryBreakdown — see that hook's own comment for why.
export function useUpcomingReminders(): UseUpcomingRemindersResult {
  const [data, setUpcomingReminders] =
    useState<UpcomingRemindersData>(EMPTY_DATA);

  const computeUpcomingReminders = useCallback(
    async (today: string): Promise<UpcomingRemindersData> => {
      const [liabilities, receivables, installmentReminders] =
        await Promise.all([
          getActiveLoanAccounts('Liability'),
          getActiveLoanAccounts('Receivable'),
          getInstallmentReminders(),
        ]);

      // Live totals, same as LiabilitiesReceivablesScreen — never
      // trusted from a stored column, always principal + interest
      // accrued as of today.
      const withTotalOwed = async <
        T extends { accountId: number },
      >(
        rows: T[],
        type: 'Liability' | 'Receivable',
      ) =>
        Promise.all(
          rows.map(async row => ({
            ...row,
            type,
            totalOwed: await getLoanTotalOwed(row.accountId, today),
          })),
        );
      const [liabilitiesWithTotals, receivablesWithTotals] =
        await Promise.all([
          withTotalOwed(liabilities, 'Liability'),
          withTotalOwed(receivables, 'Receivable'),
        ]);
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
      // narrower window (see INSTALLMENT_REMINDER_WINDOW_DAYS' own
      // comment) — installmentReminders itself already excludes
      // fully-paid plans and plans with no due date set.
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
    },
    [],
  );

  return { ...data, setUpcomingReminders, computeUpcomingReminders };
}
