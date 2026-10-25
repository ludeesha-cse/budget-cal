import { Alert } from 'react-native';
import { type NewSavingsGoalParams } from '../db/queries';
import { formatAmount } from '../utils/formatAmount';
import { useEntityFormModal } from './useEntityFormModal';
import type { UseEntityFormModalResult } from './useEntityFormModal';
import type {
  SavingsGoalAccountOption,
  SavingsGoalCurrencyRow,
  SavingsGoalRow,
} from './useSavingsGoalsData';
import {
  useCreateSavingsGoal as useCreateSavingsGoalMutation,
  useUpdateSavingsGoal as useUpdateSavingsGoalMutation,
} from './queries';

export type SavingsGoalFormValues = {
  name: string;
  targetAmount: string;
  currencyId: number | null;
  accountId: number | null;
  targetDate: string | null;
};

export interface UseSavingsGoalFormResult
  extends UseEntityFormModalResult<SavingsGoalRow, SavingsGoalFormValues> {
  setName: (value: string) => void;
  setTargetAmount: (value: string) => void;
  setCurrencyId: (value: number) => void;
  setAccountId: (value: number) => void;
  setTargetDate: (value: string | null) => void;
  // Accounts that can actually hold this goal's money: open, of a
  // savings-capable type, and already holding the selected currency.
  // Recomputed as the currency changes, which is why it lives here
  // rather than being passed in whole.
  accountOptions: SavingsGoalAccountOption[];
}

// Add/Edit Savings Goal, built on useEntityFormModal (Step 6). Creating
// a savings goal is never entitlement-gated — the original screen had no
// tier check anywhere in its submit path.
//
// THE ACCOUNT IS NOW REQUIRED, and choosing it is the one genuinely new
// decision in this form. Two things follow from it:
//
//   - the account list is filtered by the chosen CURRENCY, because a
//     goal denominated in a currency its account does not hold would be
//     permanently capped at zero. Changing the currency therefore clears
//     an account that no longer qualifies rather than leaving an invalid
//     pairing on screen;
//   - moving an EXISTING goal to an account that holds less than the
//     goal has saved is allowed, but confirmed first. It is not an
//     error — someone repointing a goal at an account they are about to
//     fund is doing something reasonable — but it does visibly drop the
//     goal's number, so it should never happen without being asked.
export function useSavingsGoalForm(
  currencies: SavingsGoalCurrencyRow[],
  accounts: SavingsGoalAccountOption[],
  // Optional since the TanStack Query refactor: a caller used to pass
  // its screen's load() here purely to re-read the database after a
  // successful write. The mutation hooks now invalidate every affected
  // query themselves, so that job is done — this is left for callers
  // that still need to do something ELSE once a save lands (reset
  // local UI state, navigate away).
  onSaved?: () => void | Promise<void>,
): UseSavingsGoalFormResult {
  const createSavingsGoal = useCreateSavingsGoalMutation();
  const updateSavingsGoal = useUpdateSavingsGoalMutation();

  const defaultCurrencyId =
    currencies.find(c => c.isDefault)?.id ?? currencies[0]?.id ?? null;

  const form = useEntityFormModal<
    SavingsGoalRow,
    SavingsGoalFormValues,
    NewSavingsGoalParams
  >({
    initialValues: {
      name: '',
      targetAmount: '',
      currencyId: defaultCurrencyId,
      accountId: null,
      targetDate: null,
    },
    populateFromRow: goal => ({
      name: goal.name,
      targetAmount: String(goal.targetAmount),
      currencyId: goal.currencyId,
      accountId: goal.accountId,
      targetDate: goal.targetDate,
    }),
    validate: values => {
      if (!values.name.trim()) {
        return 'Enter a name';
      }
      const parsedTarget = Number(values.targetAmount);
      if (!values.targetAmount || Number.isNaN(parsedTarget) || parsedTarget <= 0) {
        return 'Enter a target amount greater than 0';
      }
      if (values.currencyId == null) {
        return 'Choose a currency';
      }
      if (values.accountId == null) {
        return 'Choose an account to save this money in';
      }
      return null;
    },
    // The four controls that must hold something before this can save.
    // Keys are what GoalFormFields passes to isMissing().
    requiredFields: values => {
      const missing: string[] = [];
      if (!values.name.trim()) {
        missing.push('name');
      }
      // Blank is outlined; a present-but-wrong value is explained by
      // validate()'s message instead (the app-wide form rule).
      if (!values.targetAmount.trim()) {
        missing.push('targetAmount');
      }
      if (values.currencyId == null) {
        missing.push('currencyId');
      }
      if (values.accountId == null) {
        missing.push('accountId');
      }
      return missing;
    },
    toParams: values => ({
      name: values.name.trim(),
      targetAmount: Number(values.targetAmount),
      currencyId: values.currencyId!,
      accountId: values.accountId!,
      targetDate: values.targetDate ?? undefined,
    }),
    onUpdate: (id, params) => updateSavingsGoal(id, params),
    onCreate: params => createSavingsGoal(params),
    onSaved,
    errorTitle: 'Could not save',
  });

  const setField = <K extends keyof SavingsGoalFormValues>(
    key: K,
    value: SavingsGoalFormValues[K],
  ) => form.setValues(current => ({ ...current, [key]: value }));

  const accountOptions = accounts.filter(
    account =>
      form.values.currencyId != null &&
      account.currencyIds.includes(form.values.currencyId),
  );

  // Changing the currency can strip the chosen account of its
  // eligibility. Clearing it here (rather than letting submit fail) is
  // what makes the two pickers behave like one decision.
  const setCurrencyId = (value: number) =>
    form.setValues(current => {
      const stillEligible =
        current.accountId != null &&
        accounts.some(
          a => a.id === current.accountId && a.currencyIds.includes(value),
        );
      return {
        ...current,
        currencyId: value,
        accountId: stillEligible ? current.accountId : null,
      };
    });

  // Wraps submit so an account change that would visibly cap an existing
  // goal is confirmed rather than applied silently. A brand-new goal has
  // nothing saved yet, so it never triggers this.
  const submit = async () => {
    const goal = form.editingRow;
    const nextAccountId = form.values.accountId;
    if (!goal || nextAccountId == null || nextAccountId === goal.accountId) {
      await form.submit();
      return;
    }
    const nextAccount = accounts.find(a => a.id === nextAccountId);
    const currencyId = form.values.currencyId;
    const availableThere =
      nextAccount && currencyId != null
        ? nextAccount.balanceByCurrencyId[currencyId] ?? 0
        : 0;
    // Compared against the RAW contributed figure, not the currently
    // displayed one: the question is what this goal would show once it
    // is pointed at the new account, and its full earmark is what would
    // be competing for that account's balance.
    if (availableThere >= goal.rawContributed) {
      await form.submit();
      return;
    }
    Alert.alert(
      'That account holds less than this goal has saved',
      `${nextAccount?.name ?? 'That account'} holds ${formatAmount(
        availableThere,
        goal.currencyCode,
      )}, but "${goal.name}" has ${formatAmount(
        goal.rawContributed,
        goal.currencyCode,
      )} saved. The goal will show ${formatAmount(
        availableThere,
        goal.currencyCode,
      )} until that account holds more. Nothing is deleted — move money in and the goal comes back up.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Move it anyway', onPress: () => form.submit() },
      ],
    );
  };

  return {
    ...form,
    submit,
    accountOptions,
    setName: value => setField('name', value),
    setTargetAmount: value => setField('targetAmount', value),
    setCurrencyId,
    setAccountId: value => setField('accountId', value),
    setTargetDate: value => setField('targetDate', value),
  };
}
