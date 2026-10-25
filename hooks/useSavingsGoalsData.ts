import { useMemo, useState } from 'react';
import { loadFailureOf } from './loadFailure';
import {
  useAccountList,
  useActiveCurrencies,
  useAllAccountBalances,
  useSavingsGoals,
} from './queries';
import { getActiveCurrencies, getSavingsGoals } from '../db/queries';

export type SavingsGoalRow = Awaited<
  ReturnType<typeof getSavingsGoals>
>[number];
export type SavingsGoalCurrencyRow = Awaited<
  ReturnType<typeof getActiveCurrencies>
>[number];

// An account offered as a place to hold a goal's money, with enough
// information for the form to filter by currency and to warn about a
// move that would cap the goal — without any component re-querying
// balances for itself.
export type SavingsGoalAccountOption = {
  id: number;
  name: string;
  type: string;
  // Every currency this account holds a balance row in. Membership, not
  // amount, is what decides whether the account can back a goal in a
  // given currency.
  currencyIds: number[];
  // Current balance per currency id — the same figure the goal cap is
  // computed against, so a warning shown here and the number shown on
  // the card afterwards can never disagree.
  balanceByCurrencyId: Record<number, number>;
};

export type SavingsGoalFilter = 'active' | 'history';

export interface UseSavingsGoalsDataResult {
  goals: SavingsGoalRow[];
  currencies: SavingsGoalCurrencyRow[];
  accountOptions: SavingsGoalAccountOption[];
  loading: boolean;
  // See hooks/loadFailure.ts.
  loadFailed: boolean;
  retry: () => void;
  filter: SavingsGoalFilter;
  setFilter: (filter: SavingsGoalFilter) => void;
  visibleGoals: SavingsGoalRow[];
}

// Only ordinary asset accounts can hold savings — the same list the
// query layer enforces (SAVEABLE_ACCOUNT_TYPES in
// db/queries/savingsGoals.ts). Repeated here so the picker never offers
// something the save would then refuse; the query layer stays the
// authority.
const SAVEABLE_ACCOUNT_TYPES = ['Bank', 'Cash', 'CryptoWallet'];

// Goals come from the transactional cache (a goal row now carries both
// what was contributed and what its account can actually back); the
// currency and account rosters from the reference cache; balances from
// the transactional one.
//
// The balance query is here rather than only inside getSavingsGoals
// because the FORM needs it too — to filter accounts by currency and to
// warn before a move that would cap a goal. Both reads hit the same
// cached query, so this costs nothing extra.
export function useSavingsGoalsData(): UseSavingsGoalsDataResult {
  const [filter, setFilter] = useState<SavingsGoalFilter>('active');
  const goalsQuery = useSavingsGoals();
  const { data: goals, isPending: goalsPending } = goalsQuery;
  const currenciesQuery = useActiveCurrencies();
  const { data: currencies, isPending: currenciesPending } = currenciesQuery;
  const accountsQuery = useAccountList();
  const { data: accounts, isPending: accountsPending } = accountsQuery;
  const balancesQuery = useAllAccountBalances();
  const { data: balances, isPending: balancesPending } = balancesQuery;

  const accountOptions = useMemo<SavingsGoalAccountOption[]>(() => {
    if (!accounts) {
      return [];
    }
    const byAccountId = new Map<
      number,
      { currencyIds: number[]; balanceByCurrencyId: Record<number, number> }
    >();
    for (const balance of balances ?? []) {
      const existing = byAccountId.get(balance.accountId) ?? {
        currencyIds: [],
        balanceByCurrencyId: {},
      };
      existing.currencyIds.push(balance.currencyId);
      existing.balanceByCurrencyId[balance.currencyId] = balance.currentBalance;
      byAccountId.set(balance.accountId, existing);
    }
    return accounts
      .filter(
        account =>
          account.active && SAVEABLE_ACCOUNT_TYPES.includes(account.type),
      )
      .map(account => {
        const held = byAccountId.get(account.id);
        return {
          id: account.id,
          name: account.name,
          type: account.type,
          currencyIds: held?.currencyIds ?? [],
          balanceByCurrencyId: held?.balanceByCurrencyId ?? {},
        };
      });
  }, [accounts, balances]);

  const visibleGoals = useMemo(
    () =>
      (goals ?? []).filter(g =>
        filter === 'active' ? g.status === 'active' : g.status !== 'active',
      ),
    [goals, filter],
  );

  const failure = loadFailureOf(
    goalsQuery,
    currenciesQuery,
    accountsQuery,
    balancesQuery,
  );

  return {
    ...failure,
    goals: goals ?? [],
    currencies: currencies ?? [],
    accountOptions,
    loading:
      goalsPending || currenciesPending || accountsPending || balancesPending,
    filter,
    setFilter,
    visibleGoals,
  };
}
