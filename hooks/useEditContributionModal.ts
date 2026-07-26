import { useTargetedModal } from './useTargetedModal';
import type { UseTargetedModalResult } from './useTargetedModal';
import type { SavingsContributionRow } from './useSavingsTransferForm';
import type { SavingsGoalRow } from './useSavingsGoalsData';
import { useUpdateTransfer as useUpdateTransferMutation } from './queries';

export type EditContributionValues = {
  amount: string;
  date: string;
};

// The goal is carried alongside the contribution because correcting the
// contribution means correcting the TRANSFER behind it, and a transfer
// needs both of its ends — the source account is on the contribution,
// the destination account and the currency are the goal's.
export type EditContributionTarget = {
  contribution: SavingsContributionRow;
  goal: SavingsGoalRow;
};

export interface UseEditContributionModalResult
  extends UseTargetedModalResult<
    EditContributionTarget,
    EditContributionValues
  > {
  setAmount: (value: string) => void;
  setDate: (value: string) => void;
}

// Correcting how much was moved into a savings goal.
//
// A contribution is an earmark ATTACHED TO A REAL TRANSFER, never a
// free-standing number — so this edits the transfer, and updateTransfer
// carries the contribution's own amount along with it in the same
// write (see its savingsContributions update). Editing the earmark
// directly is what this deliberately avoids: it would leave the goal
// claiming money the accounts do not agree has moved.
//
// Both sides stay in the goal's currency. That is not a limitation this
// form imposes but the rule createSavingsTransfer already enforces — a
// goal's contributions are denominated in the goal's currency, and a
// conversion agreed at some past rate is not something an amount edit
// should silently re-open.
//
// Only contributions with a transfer behind them are editable. A legacy
// one, logged before goals were account-backed, has no money movement to
// correct — the details screen simply does not offer Edit on those.
export function useEditContributionModal(
  onSaved?: () => void | Promise<void>,
): UseEditContributionModalResult {
  const updateTransfer = useUpdateTransferMutation();

  const modal = useTargetedModal<
    EditContributionTarget,
    EditContributionValues
  >({
    initialValues: target => ({
      amount: String(target.contribution.amount),
      date: target.contribution.date,
    }),
    validate: values => {
      const parsed = Number(values.amount);
      if (!values.amount || Number.isNaN(parsed) || parsed <= 0) {
        return 'Enter an amount greater than zero.';
      }
      if (!values.date) {
        return 'Pick a date.';
      }
      return null;
    },
    requiredFields: values =>
      !values.amount || Number(values.amount) <= 0 ? ['amount'] : [],
    onSubmit: (target, values) => {
      const { contribution, goal } = target;
      if (contribution.transferId == null || contribution.fromAccountId == null) {
        throw new Error(
          'This entry was logged before goals were tied to an account, so there is no transfer to correct. Remove it and add the money again.',
        );
      }
      if (goal.accountId == null) {
        throw new Error(
          'This goal has no account to save into yet — pick one by editing the goal first.',
        );
      }
      const amount = Number(values.amount);
      return updateTransfer(contribution.transferId, {
        fromAccountId: contribution.fromAccountId,
        toAccountId: goal.accountId,
        amount,
        currencyId: goal.currencyId,
        toCurrencyId: goal.currencyId,
        toAmount: amount,
        date: values.date,
      });
    },
    onSaved,
  });

  const setField = <K extends keyof EditContributionValues>(
    key: K,
    value: EditContributionValues[K],
  ) => modal.setValues(current => ({ ...current, [key]: value }));

  return {
    ...modal,
    setAmount: value => setField('amount', value),
    setDate: value => setField('date', value),
  };
}
