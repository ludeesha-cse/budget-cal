import { useMemo, useState } from 'react';
import { useActiveCurrencies, useSavingsGoals } from './queries';
import { getActiveCurrencies, getSavingsGoals } from '../db/queries';

export type SavingsGoalRow = Awaited<ReturnType<typeof getSavingsGoals>>[number];
export type SavingsGoalCurrencyRow = Awaited<
  ReturnType<typeof getActiveCurrencies>
>[number];

export type SavingsGoalFilter = 'active' | 'history';

export interface UseSavingsGoalsDataResult {
  goals: SavingsGoalRow[];
  currencies: SavingsGoalCurrencyRow[];
  loading: boolean;
  filter: SavingsGoalFilter;
  setFilter: (filter: SavingsGoalFilter) => void;
  visibleGoals: SavingsGoalRow[];
}

// Goals come from the transactional cache (a goal row carries its
// saved-so-far total, which every contribution moves); the currency list
// from the reference cache. `filter` stays plain local UI state — it
// picks between rows already in hand and has never been a reason to
// touch the database.
export function useSavingsGoalsData(): UseSavingsGoalsDataResult {
  const [filter, setFilter] = useState<SavingsGoalFilter>('active');
  const { data: goals, isPending: goalsPending } = useSavingsGoals();
  const { data: currencies, isPending: currenciesPending } =
    useActiveCurrencies();

  const visibleGoals = useMemo(
    () =>
      (goals ?? []).filter(g =>
        filter === 'active' ? g.status === 'active' : g.status !== 'active',
      ),
    [goals, filter],
  );

  return {
    goals: goals ?? [],
    currencies: currencies ?? [],
    loading: goalsPending || currenciesPending,
    filter,
    setFilter,
    visibleGoals,
  };
}
