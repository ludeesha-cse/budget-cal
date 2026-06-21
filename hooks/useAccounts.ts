import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  getAccounts,
  getActiveCurrencies,
  getAllAccountBalances,
} from '../db/queries';

export type CurrencyRow = Awaited<ReturnType<typeof getActiveCurrencies>>[number];
export type AccountBalanceRow = Awaited<
  ReturnType<typeof getAllAccountBalances>
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
  load: () => Promise<void>;
}

// AccountsScreen's core data: every account, every currency, and each
// account's own balances joined on. Refetches on every focus so a
// transaction/transfer/payoff logged elsewhere is reflected the moment
// this screen is looked at again.
export function useAccounts(): UseAccountsResult {
  const [accounts, setAccounts] = useState<AccountWithBalances[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyRow[]>([]);

  const load = useCallback(async () => {
    const [rows, currencyRows, allBalances] = await Promise.all([
      getAccounts(),
      getActiveCurrencies(),
      getAllAccountBalances(),
    ]);
    setCurrencies(currencyRows);
    const balancesByAccountId = new Map<number, AccountBalanceRow[]>();
    for (const balance of allBalances) {
      const existing = balancesByAccountId.get(balance.accountId);
      if (existing) {
        existing.push(balance);
      } else {
        balancesByAccountId.set(balance.accountId, [balance]);
      }
    }
    setAccounts(
      rows.map(account => ({
        ...account,
        balances: balancesByAccountId.get(account.id) ?? [],
      })),
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const activeAccounts = accounts.filter(a => a.active);

  return { accounts, currencies, activeAccounts, load };
}
