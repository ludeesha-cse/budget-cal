import { useMemo } from 'react';
import {
  useAccountList,
  useActiveLoanAccounts,
  useAllAccountBalances,
  useAllCurrencies,
  useLoanTotalOwedByAccountId,
  useRemainingInstallmentBalanceByCurrency,
} from './queries';
import { buildNetWorthByCurrency } from '../utils/netWorth';
import type { NetWorthByCurrency } from '../utils/netWorth';
import { getCurrentDateString } from '../utils/date';

export interface UseNetWorthDataResult {
  netWorthByCurrency: Record<string, NetWorthByCurrency>;
  loading: boolean;
}

const EMPTY_IDS: number[] = [];

// Net worth, assembled from queries other screens are already caching.
//
// Deliberately NOT its own query hook: an aggregation over already-cached
// data is a calculation, and giving it a cache entry of its own is the
// one reliable way to make the total disagree with the balances it is
// supposedly the sum of. Every input below is shared — the account
// roster and balances with Accounts and Dashboard, the loan totals with
// Dashboard's reminders and Liabilities & Receivables — so opening this
// screen after visiting those usually reads nothing at all, where the
// old version re-ran roughly (2 x accounts) + (2 x loans) + currencies
// queries on every single focus.
export function useNetWorthData(): UseNetWorthDataResult {
  const today = getCurrentDateString();

  const { data: accounts, isPending: accountsPending } = useAccountList();
  const { data: balances, isPending: balancesPending } = useAllAccountBalances();
  const { data: liabilities, isPending: liabilitiesPending } =
    useActiveLoanAccounts('Liability');
  const { data: receivables, isPending: receivablesPending } =
    useActiveLoanAccounts('Receivable');
  const { data: currencies, isPending: currenciesPending } = useAllCurrencies();

  const loanAccountIds = useMemo(
    () =>
      liabilities || receivables
        ? [...(liabilities ?? []), ...(receivables ?? [])].map(
            loan => loan.accountId,
          )
        : EMPTY_IDS,
    [liabilities, receivables],
  );
  const totalOwedByAccountId = useLoanTotalOwedByAccountId(
    loanAccountIds,
    today,
  );

  const currencyIds = useMemo(
    () => (currencies ?? []).map(currency => currency.id),
    [currencies],
  );
  const remainingInstallmentsByCurrencyId =
    useRemainingInstallmentBalanceByCurrency(currencyIds);

  const netWorthByCurrency = useMemo(
    () =>
      buildNetWorthByCurrency({
        accounts: accounts ?? [],
        balances: balances ?? [],
        liabilities: liabilities ?? [],
        receivables: receivables ?? [],
        totalOwedByAccountId,
        currencies: currencies ?? [],
        remainingInstallmentsByCurrencyId,
      }),
    [
      accounts,
      balances,
      liabilities,
      receivables,
      totalOwedByAccountId,
      currencies,
      remainingInstallmentsByCurrencyId,
    ],
  );

  return {
    netWorthByCurrency,
    loading:
      accountsPending ||
      balancesPending ||
      liabilitiesPending ||
      receivablesPending ||
      currenciesPending,
  };
}
