import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getCurrencies, getSavingsGoals } from '../db/queries';

export type SavingsGoalRow = Awaited<ReturnType<typeof getSavingsGoals>>[number];
export type SavingsGoalCurrencyRow = Awaited<
  ReturnType<typeof getCurrencies>
>[number];

export type SavingsGoalFilter = 'active' | 'history';

export interface UseSavingsGoalsDataResult {
  goals: SavingsGoalRow[];
  currencies: SavingsGoalCurrencyRow[];
  loading: boolean;
  filter: SavingsGoalFilter;
  setFilter: (filter: SavingsGoalFilter) => void;
  visibleGoals: SavingsGoalRow[];
  reload: () => Promise<void>;
}

export function useSavingsGoalsData(): UseSavingsGoalsDataResult {
  const [filter, setFilter] = useState<SavingsGoalFilter>('active');
  const [goals, setGoals] = useState<SavingsGoalRow[]>([]);
  const [currencies, setCurrencies] = useState<SavingsGoalCurrencyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const [goalRows, currencyRows] = await Promise.all([
      getSavingsGoals(),
      getCurrencies(),
    ]);
    setGoals(goalRows);
    setCurrencies(currencyRows);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const visibleGoals = useMemo(
    () =>
      goals.filter(g =>
        filter === 'active' ? g.status === 'active' : g.status !== 'active',
      ),
    [goals, filter],
  );

  return { goals, currencies, loading, filter, setFilter, visibleGoals, reload };
}
