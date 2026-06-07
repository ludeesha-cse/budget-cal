import { useEffect, useState } from 'react';
import { getAccountBalances } from '../db/queries';

type AccountBalanceRow = Awaited<ReturnType<typeof getAccountBalances>>[number];

export interface UseAccountCurrencyBalancesResult {
  accountBalances: AccountBalanceRow[];
  currencyId: number | null;
  setCurrencyId: React.Dispatch<React.SetStateAction<number | null>>;
}

// Distinct from useAccountCurrency (Step 12a): every reload of this
// account's balances preserves a still-valid current currency selection
// rather than only honoring an initial value once on first load. That's
// what lets RecurringRulesScreen's edit flow set currencyId directly to
// an existing rule's currency and have it survive this effect's own
// re-run once balances resolve, instead of being reset like a plain
// account switch would be.
export function useAccountCurrencyBalances(
  accountId: number | null,
): UseAccountCurrencyBalancesResult {
  const [accountBalances, setAccountBalances] = useState<AccountBalanceRow[]>(
    [],
  );
  const [currencyId, setCurrencyId] = useState<number | null>(null);

  useEffect(() => {
    if (accountId == null) {
      setAccountBalances([]);
      setCurrencyId(null);
      return;
    }
    let cancelled = false;
    getAccountBalances(accountId).then(balances => {
      if (cancelled) {
        return;
      }
      setAccountBalances(balances);
      setCurrencyId(current =>
        current != null && balances.some(b => b.currencyId === current)
          ? current
          : balances.length === 1
            ? balances[0].currencyId
            : null,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  return { accountBalances, currencyId, setCurrencyId };
}
