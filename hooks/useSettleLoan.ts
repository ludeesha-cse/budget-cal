
import { getCurrentDateString } from '../utils/date';
import { useTargetedModal } from './useTargetedModal';
import type { UseTargetedModalResult } from './useTargetedModal';
import type { ActiveLoan, LoanAccountRow } from './useLoanAccountsData';
import {
  useSettleLoan as useSettleLoanMutation,
} from './queries';

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
  // Optional since the TanStack Query refactor: a caller used to pass
  // its screen's load() here purely to re-read the database after a
  // successful write. The mutation hooks now invalidate every affected
  // query themselves, so that job is done — this is left for callers
  // that still need to do something ELSE once a save lands (reset
  // local UI state, navigate away).
  onSaved?: () => void | Promise<void>,
): UseSettleLoanResult {
  // Write paths go through the caching layer's mutation hooks: each
  // one runs the same db/queries function as before and then
  // invalidates every query its write can affect (see
  // hooks/queries/invalidation.ts). The call sites below are
  // unchanged — these hooks take the wrapped function's own arguments.
  const settleLoan = useSettleLoanMutation();
  const modal = useTargetedModal<ActiveLoan, SettleLoanValues>({
    operation: 'Settle loan',
    // "Insufficient balance…" when repaying a liability from an account
    // that cannot cover it — shown under the Pay from picker.
    inlineErrorFields: ['account'],
    // Defaults to the account this loan's money actually moved through
    // when it was opened, which is where a repayment almost always goes
    // back to — falling back to the first eligible account only for
    // loans created before that was recorded (see loan_details.
    // counterpart_account_id, added in migration 0027), or if that
    // account has since been closed.
    initialValues: target => {
      const remembered = counterpartAccounts.find(
        account => account.id === target.counterpartAccountId,
      );
      return {
        paymentAmount: '',
        counterpartAccountId: String(
          remembered?.id ?? counterpartAccounts[0]?.id ?? '',
        ),
      };
    },
    validate: values => {
      const parsedAmount = Number(values.paymentAmount);
      if (!values.counterpartAccountId) {
        return 'Choose the account this payment moves through';
      }
      if (!values.paymentAmount.trim()) {
        return 'Enter an amount';
      }
      if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        return 'Enter an amount greater than 0';
      }
      return null;
    },
    requiredFields: values => {
      const missing: string[] = [];
      if (!values.paymentAmount.trim()) {
        missing.push('paymentAmount');
      }
      if (!values.counterpartAccountId) {
        missing.push('counterpartAccountId');
      }
      return missing;
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
