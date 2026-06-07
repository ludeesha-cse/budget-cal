import {
  createSavingsGoal,
  updateSavingsGoal,
  type NewSavingsGoalParams,
} from '../db/queries';
import { useEntityFormModal } from './useEntityFormModal';
import type { UseEntityFormModalResult } from './useEntityFormModal';
import type { SavingsGoalCurrencyRow, SavingsGoalRow } from './useSavingsGoalsData';

export type SavingsGoalFormValues = {
  name: string;
  targetAmount: string;
  currencyId: number | null;
  targetDate: string | null;
};

export interface UseSavingsGoalFormResult
  extends UseEntityFormModalResult<SavingsGoalRow, SavingsGoalFormValues> {
  setName: (value: string) => void;
  setTargetAmount: (value: string) => void;
  setCurrencyId: (value: number) => void;
  setTargetDate: (value: string | null) => void;
}

// Add/Edit Savings Goal, built on useEntityFormModal (Step 6). Unlike
// AccountsScreen/CategoriesScreen/InstallmentPlansScreen, creating a
// savings goal is never entitlement-gated at all — the original screen
// had no tier check anywhere in its submit path.
export function useSavingsGoalForm(
  currencies: SavingsGoalCurrencyRow[],
  onSaved: () => void | Promise<void>,
): UseSavingsGoalFormResult {
  const form = useEntityFormModal<
    SavingsGoalRow,
    SavingsGoalFormValues,
    NewSavingsGoalParams
  >({
    initialValues: {
      name: '',
      targetAmount: '',
      currencyId: currencies.find(c => c.isDefault)?.id ?? currencies[0]?.id ?? null,
      targetDate: null,
    },
    populateFromRow: goal => ({
      name: goal.name,
      targetAmount: String(goal.targetAmount),
      currencyId: goal.currencyId,
      targetDate: goal.targetDate,
    }),
    // Mirrors the original's own checks — target date is genuinely
    // optional (per its own "(optional)" label), so it's deliberately
    // left out of this gate.
    validate: values => {
      if (!values.name.trim()) {
        return 'Enter a name';
      }
      const parsedTarget = Number(values.targetAmount);
      if (!values.targetAmount || Number.isNaN(parsedTarget) || parsedTarget <= 0) {
        return 'Enter a valid target amount';
      }
      if (values.currencyId == null) {
        return 'Select a currency';
      }
      return null;
    },
    toParams: values => ({
      name: values.name.trim(),
      targetAmount: Number(values.targetAmount),
      currencyId: values.currencyId!,
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

  return {
    ...form,
    setName: value => setField('name', value),
    setTargetAmount: value => setField('targetAmount', value),
    setCurrencyId: value => setField('currencyId', value),
    setTargetDate: value => setField('targetDate', value),
  };
}
