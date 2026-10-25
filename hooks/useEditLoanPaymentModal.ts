import { useMemo } from 'react';
import { useTargetedModal } from './useTargetedModal';
import type { UseTargetedModalResult } from './useTargetedModal';
import type { LoanPaymentRow } from './useTransactionHistoryData';
import { isPayableAccount } from '../utils/accountTypes';
import {
  useAccountList,
  useUpdateLoanPayment as useUpdateLoanPaymentMutation,
} from './queries';

export type EditLoanPaymentValues = {
  amount: string;
  counterpartAccountId: string;
  date: string;
};

export interface UseEditLoanPaymentModalResult
  extends UseTargetedModalResult<LoanPaymentRow, EditLoanPaymentValues> {
  setAmount: (value: string) => void;
  setCounterpartAccountId: (value: string) => void;
  setDate: (value: string) => void;
  // The real accounts this payment could have moved through. Loan
  // accounts themselves are excluded — a repayment moves money between a
  // loan and a REAL account, never between two loans.
  counterpartAccounts: { id: number; name: string; type: string }[];
}

// Correcting a repayment or a collection from History.
//
// WHY THIS EXISTS AT ALL: a loan payment was the one money movement in
// the app with no way back. Mistype 5,000 as 50,000 and the loan showed
// as settled, the account was 45,000 short, and there was no screen
// anywhere that would let you say otherwise — the only escape was to
// delete the whole loan and rebuild it. Everything else in History has
// been editable for a long time; this closes the last gap.
//
// The loan itself is deliberately NOT selectable here. Moving a payment
// from one counterparty to another is not a correction, it is two
// different events — deleting it and recording it against the right loan
// says what actually happened, and keeps both loans' balances honest
// without this form having to reason about two loans at once.
export function useEditLoanPaymentModal(
  // Optional since the TanStack Query refactor: the mutation invalidates
  // every query this write affects, so this is only for callers that
  // need to do something ELSE once a save lands.
  onSaved?: () => void | Promise<void>,
): UseEditLoanPaymentModalResult {
  const updateLoanPayment = useUpdateLoanPaymentMutation();
  const { data: accounts } = useAccountList();

  const counterpartAccounts = useMemo(
    () => (accounts ?? []).filter(isPayableAccount),
    [accounts],
  );

  const modal = useTargetedModal<LoanPaymentRow, EditLoanPaymentValues>({
    operation: 'Edit loan payment',
    inlineErrorFields: ['account'],
    initialValues: payment => ({
      amount: String(payment.amount),
      counterpartAccountId: String(payment.counterpartAccountId),
      date: payment.date,
    }),
    validate: values => {
      const parsed = Number(values.amount);
      if (!values.amount.trim()) {
        return 'Enter an amount';
      }
      if (Number.isNaN(parsed) || parsed <= 0) {
        return 'Enter an amount greater than 0';
      }
      if (!values.counterpartAccountId) {
        return 'Choose the account this payment moves through';
      }
      if (!values.date) {
        return 'Choose a date';
      }
      return null;
    },
    requiredFields: values => {
      const missing: string[] = [];
      if (!values.amount.trim()) {
        missing.push('amount');
      }
      if (!values.counterpartAccountId) {
        missing.push('counterpartAccountId');
      }
      return missing;
    },
    onSubmit: (target, values) =>
      updateLoanPayment({
        paymentId: target.id,
        paymentAmount: Number(values.amount),
        counterpartAccountId: Number(values.counterpartAccountId),
        date: values.date,
      }),
    onSaved,
  });

  const setField = <K extends keyof EditLoanPaymentValues>(
    key: K,
    value: EditLoanPaymentValues[K],
  ) => modal.setValues(current => ({ ...current, [key]: value }));

  return {
    ...modal,
    setAmount: value => setField('amount', value),
    setCounterpartAccountId: value => setField('counterpartAccountId', value),
    setDate: value => setField('date', value),
    counterpartAccounts,
  };
}
