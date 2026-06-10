import { useCallback, useState } from 'react';
import { getAccountBalance, getAccountBalances, getAccounts } from '../db/queries';

export type ShortcutAccountRow = {
  accountId: number;
  name: string;
  currencyCode: string;
  balance: number;
};

export interface UseAccountShortcutsResult {
  shortcutAccounts: ShortcutAccountRow[];
  setShortcutAccounts: React.Dispatch<React.SetStateAction<ShortcutAccountRow[]>>;
  computeShortcutAccounts: () => Promise<ShortcutAccountRow[]>;
}

// "Dashboard Shortcuts" — each active account's balance in whichever
// currency it was first opened with. Multi-currency accounts only ever
// show that one row here; the full picture (every currency) is what
// "Manage" (Accounts) is for. Same pure-compute-function shape as
// useCategoryBreakdown — see that hook's own comment for why.
export function useAccountShortcuts(): UseAccountShortcutsResult {
  const [shortcutAccounts, setShortcutAccounts] = useState<
    ShortcutAccountRow[]
  >([]);

  const computeShortcutAccounts = useCallback(async (): Promise<
    ShortcutAccountRow[]
  > => {
    const accounts = await getAccounts();
    const activeAccounts = accounts.filter(a => a.active);
    return (
      await Promise.all(
        activeAccounts.map(async account => {
          const balances = await getAccountBalances(account.id);
          const first = balances[0];
          if (!first) {
            return null;
          }
          const liveBalance = await getAccountBalance(
            account.id,
            first.currencyId,
          );
          return {
            accountId: account.id,
            name: account.name,
            currencyCode: first.currencyCode,
            balance: liveBalance,
          };
        }),
      )
    ).filter((row): row is ShortcutAccountRow => row !== null);
  }, []);

  return { shortcutAccounts, setShortcutAccounts, computeShortcutAccounts };
}
