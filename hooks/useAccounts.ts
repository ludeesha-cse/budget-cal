import { useMemo } from 'react';
import { loadFailureOf } from './loadFailure';
import {
  useAccountList,
  useActiveCurrencies,
  useAllAccountBalances,
  type AccountBalanceRow,
} from './queries';
import { getAccounts, getActiveCurrencies } from '../db/queries';

export type { AccountBalanceRow };
export type CurrencyRow = Awaited<
  ReturnType<typeof getActiveCurrencies>
>[number];
export type AccountWithBalances = Awaited<
  ReturnType<typeof getAccounts>
>[number] & {
  balances: AccountBalanceRow[];
};

export interface UseAccountsResult {
  accounts: AccountWithBalances[];
  currencies: CurrencyRow[];
  // Closed accounts stay in `accounts` (anything that still needs to look
  // one up by id can) but drop out of every visible list.
  activeAccounts: AccountWithBalances[];
  // See hooks/loadFailure.ts.
  loadFailed: boolean;
  retry: () => void;
}

// AccountsScreen's core data: every account, every currency, and each
// account's own balances joined on.
//
// This used to refetch all three on every screen focus. It now reads
// three cached queries instead — the account roster and the currency
// list from the long reference cache (neither changes without a Settings
// edit, and those edits invalidate them), the balances from the
// 10-minute transactional cache. A transaction, transfer, payoff or loan
// settlement logged anywhere else invalidates the balance query as part
// of that write, so this screen still shows the change the moment it is
// looked at again — the difference is that coming back to it WITHOUT a
// write no longer costs three database round trips.
//
// The joining below is plain synchronous work over already-fetched rows,
// so it stays a memo rather than becoming a cache entry of its own.
export function useAccounts(): UseAccountsResult {
  const rowsQuery = useAccountList();
  const { data: rows } = rowsQuery;
  const currencyRowsQuery = useActiveCurrencies();
  const { data: currencyRows } = currencyRowsQuery;
  const allBalancesQuery = useAllAccountBalances();
  const { data: allBalances } = allBalancesQuery;

  const accounts = useMemo<AccountWithBalances[]>(() => {
    if (!rows) {
      return [];
    }
    const balancesByAccountId = new Map<number, AccountBalanceRow[]>();
    for (const balance of allBalances ?? []) {
      const existing = balancesByAccountId.get(balance.accountId);
      if (existing) {
        existing.push(balance);
      } else {
        balancesByAccountId.set(balance.accountId, [balance]);
      }
    }
    return rows.map(account => ({
      ...account,
      balances: balancesByAccountId.get(account.id) ?? [],
    }));
  }, [rows, allBalances]);

  const activeAccounts = useMemo(
    () => accounts.filter(a => a.active),
    [accounts],
  );

  const failure = loadFailureOf(rowsQuery, currencyRowsQuery, allBalancesQuery);

  return {
    ...failure,
    accounts,
    currencies: currencyRows ?? [],
    activeAccounts,
  };
}
