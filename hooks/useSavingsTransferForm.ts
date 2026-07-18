import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { getContributions } from '../db/queries';
import { getCurrentDateString } from '../utils/date';
import { formatAmount } from '../utils/formatAmount';
import { useAsyncAction } from './useAsyncAction';
import { useConfirmDelete } from './useConfirmDelete';
import { useFieldErrors } from './useFieldErrors';
import type {
  SavingsGoalAccountOption,
  SavingsGoalRow,
} from './useSavingsGoalsData';
import {
  useCreateSavingsTransfer as useCreateSavingsTransferMutation,
  useDeleteContribution as useDeleteContributionMutation,
} from './queries';

export type SavingsContributionRow = Awaited<
  ReturnType<typeof getContributions>
>[number];

export interface UseSavingsTransferFormResult {
  // Which goal's "Transfer & Save" mini-form is open, or null.
  openForGoalId: number | null;
  fromAccountId: string;
  setFromAccountId: (value: string) => void;
  amount: string;
  setAmount: (value: string) => void;
  date: string;
  setDate: (value: string) => void;
  // Accounts that can fund the currently-open goal: open, savings
  // capable, holding the goal's currency, and not the goal's own
  // account.
  sourceOptions: SavingsGoalAccountOption[];
  // "NTB: 45,000.00 LKR available", or null before a source is picked.
  sourceBalanceText: string | null;
  canSave: boolean;
  // True when this required field is empty AND the user has already
  // pressed Transfer & Save. See hooks/useFieldErrors.
  isMissing: (field: string) => boolean;
  open: (goal: SavingsGoalRow) => void;
  close: () => void;
  submit: () => void;
  handleDeleteContribution: (
    goal: SavingsGoalRow,
    contribution: SavingsContributionRow,
  ) => void;
}

// "Transfer & Save" — the ONLY way money enters a savings goal now.
//
// This replaces the old add/edit-contribution pair. A contribution used
// to be a free-standing number the user typed, which could claim money
// that was never anywhere; it is now the by-product of a real transfer
// into the goal's own account, written atomically with it (see
// createSavingsTransfer). There is deliberately no "edit contribution"
// here either: the amount that matters is the transfer's, so editing
// happens on the transfer in History and carries the contribution with
// it.
//
// SAME CURRENCY ONLY. The transfer machinery underneath can convert, but
// a contribution is denominated in the goal's currency and pairing it
// with a rate nothing re-checks later would make the earmark and the
// money disagree. So the source list is filtered to accounts that
// already hold the goal's currency; converting first, then funding, is
// two deliberate steps.
export function useSavingsTransferForm(
  accountOptions: SavingsGoalAccountOption[],
  // Optional: the mutations invalidate every affected query themselves,
  // so this is only for callers that need to do something ELSE once a
  // save lands — the screen uses it to refresh the expanded row's
  // lazily-fetched contribution list, which sits outside the cache.
  onSaved?: (goalId: number) => void | Promise<void>,
): UseSavingsTransferFormResult {
  const createSavingsTransfer = useCreateSavingsTransferMutation();
  const deleteContribution = useDeleteContributionMutation();
  const runAction = useAsyncAction();
  const confirmDelete = useConfirmDelete();

  const [goal, setGoal] = useState<SavingsGoalRow | null>(null);
  const [fromAccountId, setFromAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(getCurrentDateString());

  const sourceOptions = useMemo(() => {
    if (!goal) {
      return [];
    }
    return accountOptions.filter(
      account =>
        account.id !== goal.accountId &&
        account.currencyIds.includes(goal.currencyId),
    );
  }, [accountOptions, goal]);

  const sourceBalanceText = useMemo(() => {
    if (!goal || !fromAccountId) {
      return null;
    }
    const source = sourceOptions.find(a => String(a.id) === fromAccountId);
    if (!source) {
      return null;
    }
    const available = source.balanceByCurrencyId[goal.currencyId] ?? 0;
    return `${source.name}: ${formatAmount(
      available,
      goal.currencyCode,
    )} available`;
  }, [goal, fromAccountId, sourceOptions]);

  const missingFields = useMemo(() => {
    const missing: string[] = [];
    if (!fromAccountId) {
      missing.push('fromAccountId');
    }
    if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
      missing.push('amount');
    }
    return missing;
  }, [fromAccountId, amount]);

  const fieldErrors = useFieldErrors(missingFields);
  // Read through a ref so the callbacks below can reveal or clear the
  // outlines without listing fieldErrors — whose identity changes on
  // every keystroke — as a dependency.
  const fieldErrorsRef = useRef(fieldErrors);
  fieldErrorsRef.current = fieldErrors;

  const open = useCallback((target: SavingsGoalRow) => {
    setGoal(target);
    setFromAccountId('');
    setAmount('');
    setDate(getCurrentDateString());
    fieldErrorsRef.current.reset();
  }, []);

  const close = useCallback(() => setGoal(null), []);

  const perform = useCallback(
    async (parsedAmount: number, target: SavingsGoalRow) => {
      await runAction(async () => {
        await createSavingsTransfer({
          savingsGoalId: target.id,
          fromAccountId: Number(fromAccountId),
          amount: parsedAmount,
          date,
        });
        setGoal(null);
        await onSaved?.(target.id);
      }, 'Could not transfer to this goal');
    },
    [runAction, createSavingsTransfer, fromAccountId, date, onSaved],
  );

  const submit = useCallback(() => {
    if (!goal) {
      return;
    }
    // The button is muted but pressable while the form is incomplete, so
    // this is the path an incomplete press takes — point at the controls
    // rather than only raising an alert the user has to map back.
    if (missingFields.length > 0) {
      fieldErrorsRef.current.reveal();
    }
    if (!fromAccountId) {
      Alert.alert('Missing information', 'Choose an account to transfer from.');
      return;
    }
    const parsedAmount = Number(amount);
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid amount', 'Enter an amount greater than zero.');
      return;
    }
    // Same rule as an ordinary transfer: real accounts can go negative,
    // so this warns rather than blocks.
    const source = sourceOptions.find(a => String(a.id) === fromAccountId);
    const available = source?.balanceByCurrencyId[goal.currencyId] ?? 0;
    const resulting = available - parsedAmount;
    if (resulting < 0) {
      Alert.alert(
        'This will leave the account negative',
        `This will leave ${source?.name ?? 'the account'} at ${formatAmount(
          resulting,
          goal.currencyCode,
        )}. Continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: () => perform(parsedAmount, goal) },
        ],
      );
      return;
    }
    perform(parsedAmount, goal);
  }, [goal, fromAccountId, amount, sourceOptions, perform, missingFields]);

  // Removing a contribution reverses the transfer behind it — the money
  // goes back where it came from. The prompt says so explicitly, because
  // "delete this row" reading as "and move money" is exactly the kind of
  // surprise a confirmation exists to prevent.
  const handleDeleteContribution = useCallback(
    (target: SavingsGoalRow, contribution: SavingsContributionRow) => {
      const isLinked = contribution.transferId != null;
      confirmDelete(
        isLinked ? 'Remove this transfer?' : 'Delete contribution',
        isLinked
          ? `This moves ${formatAmount(
              contribution.amount,
              target.currencyCode,
            )} back to ${
              contribution.fromAccountName ?? 'the source account'
            } and removes it from "${target.name}". The transfer disappears from History too. This cannot be undone.`
          : `Delete this ${contribution.date} entry? It was logged before goals were tied to an account, so no money moves. This cannot be undone.`,
        isLinked ? 'Remove' : 'Delete',
        () =>
          runAction(async () => {
            await deleteContribution(contribution.id);
            await onSaved?.(target.id);
          }, 'Could not remove this contribution'),
      );
    },
    [confirmDelete, runAction, deleteContribution, onSaved],
  );

  const canSave = goal != null && missingFields.length === 0;

  return {
    openForGoalId: goal?.id ?? null,
    fromAccountId,
    setFromAccountId,
    amount,
    setAmount,
    date,
    setDate,
    sourceOptions,
    sourceBalanceText,
    canSave,
    isMissing: fieldErrors.isMissing,
    open,
    close,
    submit,
    handleDeleteContribution,
  };
}
