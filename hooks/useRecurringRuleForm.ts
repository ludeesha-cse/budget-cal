import { useState } from 'react';
import {
  getAccountBalances,
  type NewRecurringRuleParams,
} from '../db/queries';
import { useAccountCurrencyBalances } from './useAccountCurrencyBalances';
import { useEntityFormModal } from './useEntityFormModal';
import type { UseEntityFormModalResult } from './useEntityFormModal';
import type {
  RecurringRuleAccountRow,
  RecurringRuleCategoryRow,
  RecurringRuleRow,
} from './useRecurringRulesData';
import {
  useCreateRecurringRule as useCreateRecurringRuleMutation,
  useUpdateRecurringRule as useUpdateRecurringRuleMutation,
} from './queries';

export type RecurringRuleFormValues = {
  ruleType: 'Income' | 'Expense';
  name: string;
  amount: string;
  dayOfMonth: string;
  categoryId: number | null;
};

type AccountBalanceRow = Awaited<ReturnType<typeof getAccountBalances>>[number];

export interface UseRecurringRuleFormResult
  extends UseEntityFormModalResult<RecurringRuleRow, RecurringRuleFormValues> {
  setRuleType: (value: 'Income' | 'Expense') => void;
  setName: (value: string) => void;
  setAmount: (value: string) => void;
  setDayOfMonth: (value: string) => void;
  setCategoryId: (value: number | null) => void;
  accountId: number | null;
  setAccountId: (value: number | null) => void;
  currencyId: number | null;
  setCurrencyId: (value: number | null) => void;
  accountBalances: AccountBalanceRow[];
}

// Add/Edit Recurring Rule, built on useEntityFormModal (Step 6). accountId
// and currencyId live outside useEntityFormModal's own `values` — they're
// driven by useAccountCurrencyBalances (Step 15i), which owns currencyId
// itself and must be constructed before useEntityFormModal so that hook's
// validate/toParams closures (evaluated synchronously on every render,
// including the very first) can read a currencyId that's already been
// declared.
export function useRecurringRuleForm(
  accounts: RecurringRuleAccountRow[],
  categories: RecurringRuleCategoryRow[],
  // Optional since the TanStack Query refactor: a caller used to pass
  // its screen's load() here purely to re-read the database after a
  // successful write. The mutation hooks now invalidate every affected
  // query themselves, so that job is done — this is left for callers
  // that still need to do something ELSE once a save lands (reset
  // local UI state, navigate away).
  onSaved?: () => void | Promise<void>,
): UseRecurringRuleFormResult {
  // Write paths go through the caching layer's mutation hooks: each
  // one runs the same db/queries function as before and then
  // invalidates every query its write can affect (see
  // hooks/queries/invalidation.ts). The call sites below are
  // unchanged — these hooks take the wrapped function's own arguments.
  const createRecurringRule = useCreateRecurringRuleMutation();
  const updateRecurringRule = useUpdateRecurringRuleMutation();
  const [accountId, setAccountIdState] = useState<number | null>(null);
  const { accountBalances, currencyId, setCurrencyId } =
    useAccountCurrencyBalances(accountId);

  const resetAccountId = () => setAccountIdState(accounts[0]?.id ?? null);

  const form = useEntityFormModal<
    RecurringRuleRow,
    RecurringRuleFormValues,
    NewRecurringRuleParams
  >({
    initialValues: {
      ruleType: 'Expense',
      name: '',
      amount: '',
      dayOfMonth: '1',
      categoryId: categories[0]?.id ?? null,
    },
    populateFromRow: rule => ({
      ruleType: rule.ruleType,
      name: rule.name,
      amount: String(rule.amount),
      dayOfMonth: String(rule.dayOfMonth),
      categoryId: rule.categoryId ?? categories[0]?.id ?? null,
    }),
    // Mirrors the original's own checks (minus trimming/rounding, which
    // only matter at actual submit time) so Save disables the instant a
    // required field is missing, rather than only failing after a tap.
    validate: values => {
      if (!values.name.trim()) {
        return 'Enter a name';
      }
      const parsedAmount = Number(values.amount);
      if (!values.amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        return 'Enter an amount greater than 0';
      }
      const parsedDay = Number(values.dayOfMonth);
      if (!Number.isInteger(parsedDay) || parsedDay < 1 || parsedDay > 31) {
        return 'Enter a day of the month between 1 and 31';
      }
      if (accountId == null) {
        return 'Choose an account';
      }
      if (currencyId == null) {
        return 'Choose a currency';
      }
      if (values.ruleType === 'Expense' && values.categoryId == null) {
        return 'Choose a category';
      }
      return null;
    },
    // categoryId is required for an Expense rule and meaningless for an
    // Income one — the Income tab has no category picker at all — so it
    // is conditional here for the same reason it is in validate().
    requiredFields: values => {
      const missing: string[] = [];
      if (!values.name.trim()) {
        missing.push('name');
      }
      // Blank is outlined; a present-but-wrong value is explained by
      // validate()'s message instead (the app-wide form rule).
      if (!values.amount.trim()) {
        missing.push('amount');
      }
      if (!String(values.dayOfMonth).trim()) {
        missing.push('dayOfMonth');
      }
      if (accountId == null) {
        missing.push('accountId');
      }
      if (currencyId == null) {
        missing.push('currencyId');
      }
      if (values.ruleType === 'Expense' && values.categoryId == null) {
        missing.push('categoryId');
      }
      return missing;
    },
    toParams: values => ({
      name: values.name.trim(),
      ruleType: values.ruleType,
      amount: Number(values.amount),
      dayOfMonth: Number(values.dayOfMonth),
      categoryId:
        values.ruleType === 'Expense' ? (values.categoryId ?? undefined) : undefined,
      accountId: accountId!,
      currencyId: currencyId!,
    }),
    onUpdate: (id, params) => updateRecurringRule(id, params),
    onCreate: params => createRecurringRule(params),
    // Resets accountId back to the default before reloading — mirrors the
    // original's own resetForm(), which handleSubmit called right after a
    // successful save.
    onSaved: async () => {
      resetAccountId();
      await onSaved?.();
    },
    errorTitle: 'Could not save',
  });

  const setField = <K extends keyof RecurringRuleFormValues>(
    key: K,
    value: RecurringRuleFormValues[K],
  ) => form.setValues(current => ({ ...current, [key]: value }));

  const setRuleType = (value: 'Income' | 'Expense') => {
    setField('ruleType', value);
    // Selecting Income hides the category picker entirely (see
    // RuleFormFields) rather than leaving it present-but-unused — clearing
    // it here means an Income rule never silently carries a category
    // picked before the switch.
    if (value === 'Income') {
      setField('categoryId', null);
    } else if (form.values.categoryId == null) {
      setField('categoryId', categories[0]?.id ?? null);
    }
  };

  const openAdd = () => {
    form.openAdd();
    resetAccountId();
  };

  const openEdit = (rule: RecurringRuleRow) => {
    form.openEdit(rule);
    setAccountIdState(rule.accountId);
    // Set immediately so the picker doesn't flash "Select currency"
    // before useAccountCurrencyBalances' async getAccountBalances
    // resolves — that effect then confirms/keeps this same value once it
    // loads.
    setCurrencyId(rule.currencyId);
  };

  const close = () => {
    form.close();
    resetAccountId();
  };

  return {
    ...form,
    openAdd,
    openEdit,
    close,
    setRuleType,
    setName: value => setField('name', value),
    setAmount: value => setField('amount', value),
    setDayOfMonth: value => setField('dayOfMonth', value),
    setCategoryId: value => setField('categoryId', value),
    accountId,
    setAccountId: setAccountIdState,
    currencyId,
    setCurrencyId,
    accountBalances,
  };
}
