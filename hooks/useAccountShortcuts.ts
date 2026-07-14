import type { AccountBalanceRow, AccountRow } from './queries';

export type ShortcutAccountRow = {
  accountId: number;
  name: string;
  currencyCode: string;
  balance: number;
};

// "Dashboard Shortcuts" — each active account's balance in whichever
// currency it was first opened with. Multi-currency accounts only ever
// show that one row here; the full picture (every currency) is what
// "Manage" (Accounts) is for.
//
// Now a pure function over two cached queries. The old version issued
// one getAccountBalances() plus one getAccountBalance() PER ACCOUNT;
// getAllAccountBalances already returns every account's every currency
// row with its live `currentBalance` computed in three queries total, so
// the same figures come out of data the dashboard is holding anyway.
// Row order within an account is the same table order getAccountBalances
// returned, so "first currency" still means the same currency it did.
export function buildAccountShortcuts(
  accounts: AccountRow[],
  allBalances: AccountBalanceRow[],
): ShortcutAccountRow[] {
  const firstBalanceByAccountId = new Map<number, AccountBalanceRow>();
  for (const balance of allBalances) {
    if (!firstBalanceByAccountId.has(balance.accountId)) {
      firstBalanceByAccountId.set(balance.accountId, balance);
    }
  }
  return accounts
    .filter(account => account.active)
    .map(account => {
      const first = firstBalanceByAccountId.get(account.id);
      if (!first) {
        return null;
      }
      return {
        accountId: account.id,
        name: account.name,
        currencyCode: first.currencyCode,
        balance: first.currentBalance,
      };
    })
    .filter((row): row is ShortcutAccountRow => row !== null);
}
