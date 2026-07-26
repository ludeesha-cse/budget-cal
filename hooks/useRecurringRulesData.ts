import { useMemo, useState } from 'react';
import { useAccountList, useCategories, useRecurringRules } from './queries';
import { getAccounts, getCategories, getRecurringRules } from '../db/queries';
import { isPayableAccount } from '../utils/accountTypes';

export type RecurringRuleRow = Awaited<ReturnType<typeof getRecurringRules>>[number];
export type RecurringRuleAccountRow = Awaited<ReturnType<typeof getAccounts>>[number];
export type RecurringRuleCategoryRow = Awaited<ReturnType<typeof getCategories>>[number];

export type RecurringRuleListType = 'Income' | 'Expense';

// Same exclusion as TransactionForm/IncomeForm — a Liability/Receivable
// account only ever moves through the loan flows, never an ordinary
// Expense/Income posting, so a recurring rule can't point at one either.
// See utils/accountTypes.ts — a recurring rule posts an ordinary
// transaction, so it is bound by the same rule as any other spend.

export interface UseRecurringRulesDataResult {
  listType: RecurringRuleListType;
  setListType: (listType: RecurringRuleListType) => void;
  rules: RecurringRuleRow[];
  accounts: RecurringRuleAccountRow[];
  categories: RecurringRuleCategoryRow[];
  loading: boolean;
  visibleRules: RecurringRuleRow[];
}

// Rules come from the transactional cache (see useRecurringRules' own
// note on why rules do not fit the reference rule cleanly); accounts and
// categories from the reference cache. `listType` is a local toggle over
// rows already in hand.
export function useRecurringRulesData(): UseRecurringRulesDataResult {
  // Which section of the list is showing — independent of the form's own
  // type toggle, so switching tabs never disturbs an open form.
  const [listType, setListType] = useState<RecurringRuleListType>('Income');
  const { data: rules, isPending: rulesPending } = useRecurringRules(false);
  const { data: accountRows, isPending: accountsPending } = useAccountList();
  const { data: categories, isPending: categoriesPending } = useCategories();

  const accounts = useMemo(
    () =>
      (accountRows ?? []).filter(
        isPayableAccount,
      ),
    [accountRows],
  );

  const visibleRules = useMemo(
    () => (rules ?? []).filter(r => r.ruleType === listType),
    [rules, listType],
  );

  return {
    listType,
    setListType,
    rules: rules ?? [],
    accounts,
    categories: categories ?? [],
    loading: rulesPending || accountsPending || categoriesPending,
    visibleRules,
  };
}
