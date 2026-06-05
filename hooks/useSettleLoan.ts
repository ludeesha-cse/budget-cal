import { settleLoan } from '../db/queries';
import { getCurrentDateString } from '../utils/date';
import { useTargetedModal } from './useTargetedModal';
import type { UseTargetedModalResult } from './useTargetedModal';
import type { ActiveLoan, LoanAccountRow } from './useLoanAccountsData';

export type SettleLoanValues = {
  paymentAmount: string;
  counterpartAccountId: string;
};

export interface UseSettleLoanResult
  extends UseTargetedModalResult<ActiveLoan, SettleLoanValues> {
  setPaymentAmount: (value: string) => void;
  setCounterpartAccountId: (value: string) => void;
}

// Settle/pay off a loan, built on useTargetedModal (Step 8). A payment
// equal to or greater than getLoanTotalOwed's answer pays the loan off in
// full and closes the account — settleLoan itself decides that, this
// hook just collects the amount and which account it moves through.
// Same as useUpdateBalance/usePayOffCard: both the validation checks and
// any settleLoan failure surface as the hook's own inline `error` string
// rather than a separate Alert.
export function useSettleLoan(
  counterpartAccounts: LoanAccountRow[],
  onSaved: () => void | Promise<void>,
): UseSettleLoanResult {
  const modal = useTargetedModal<ActiveLoan, SettleLoanValues>({
    initialValues: () => ({
      paymentAmount: '',
      counterpartAccountId: String(counterpartAccounts[0]?.id ?? ''),
    }),
    validate: values => {
      const parsedAmount = Number(values.paymentAmount);
      if (
        !values.paymentAmount ||
        Number.isNaN(parsedAmount) ||
        parsedAmount <= 0
      ) {
        return 'Enter a valid payment amount';
      }
      if (!values.counterpartAccountId) {
        return 'Select the account this payment moves through';
      }
      return null;
    },
    onSubmit: (target, values) =>
      settleLoan({
        loanAccountId: target.accountId,
        counterpartAccountId: Number(values.counterpartAccountId),
        paymentAmount: Number(values.paymentAmount),
        currencyId: target.currencyId,
        date: getCurrentDateString(),
      }),
    onSaved,
  });

  const setPaymentAmount = (value: string) =>
    modal.setValues(current => ({ ...current, paymentAmount: value }));
  const setCounterpartAccountId = (value: string) =>
    modal.setValues(current => ({ ...current, counterpartAccountId: value }));

  return { ...modal, setPaymentAmount, setCounterpartAccountId };
}
