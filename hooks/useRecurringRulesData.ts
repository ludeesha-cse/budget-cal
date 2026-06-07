import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getAccounts, getCategories, getRecurringRules } from '../db/queries';

export type RecurringRuleRow = Awaited<ReturnType<typeof getRecurringRules>>[number];
export type RecurringRuleAccountRow = Awaited<ReturnType<typeof getAccounts>>[number];
export type RecurringRuleCategoryRow = Awaited<ReturnType<typeof getCategories>>[number];

export type RecurringRuleListType = 'Income' | 'Expense';

// Same exclusion as TransactionForm/IncomeForm — a Liability/Receivable
// account only ever moves through the loan flows, never an ordinary
// Expense/Income posting, so a recurring rule can't point at one either.
const NON_TRANSACTABLE_ACCOUNT_TYPES = ['Liability', 'Receivable'];

export interface UseRecurringRulesDataResult {
  listType: RecurringRuleListType;
  setListType: (listType: RecurringRuleListType) => void;
  rules: RecurringRuleRow[];
  accounts: RecurringRuleAccountRow[];
  categories: RecurringRuleCategoryRow[];
  loading: boolean;
  visibleRules: RecurringRuleRow[];
  load: () => Promise<void>;
}

export function useRecurringRulesData(): UseRecurringRulesDataResult {
  // Which section of the list is showing — independent of the form's own
  // type toggle, so switching tabs never disturbs an open form.
  const [listType, setListType] = useState<RecurringRuleListType>('Income');
  const [rules, setRules] = useState<RecurringRuleRow[]>([]);
  const [accounts, setAccounts] = useState<RecurringRuleAccountRow[]>([]);
  const [categories, setCategories] = useState<RecurringRuleCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [ruleRows, accountRows, categoryRows] = await Promise.all([
      getRecurringRules(false),
      getAccounts(),
      getCategories(),
    ]);
    setRules(ruleRows);
    setAccounts(
      accountRows.filter(
        a => a.active && !NON_TRANSACTABLE_ACCOUNT_TYPES.includes(a.type),
      ),
    );
    setCategories(categoryRows);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const visibleRules = useMemo(
    () => rules.filter(r => r.ruleType === listType),
    [rules, listType],
  );

  return { listType, setListType, rules, accounts, categories, loading, visibleRules, load };
}
