import { useEffect, useState } from 'react';
import { getAccountBalances } from '../db/queries';
import { preferredCurrencyId } from '../utils/currencyHelpers';
import { useDefaultCurrency } from './queries';

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
  const { data: defaultCurrency } = useDefaultCurrency();

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

  // Same preselect as useAccountCurrency, and for the same reason — see
  // that hook's note. Only ever fills an empty selection, so an existing
  // rule's own currency (set directly by RecurringRulesScreen's edit
  // flow) is never overwritten.
  useEffect(() => {
    if (currencyId != null || accountBalances.length === 0) {
      return;
    }
    const preferred = preferredCurrencyId(accountBalances, defaultCurrency?.id);
    if (preferred != null) {
      setCurrencyId(preferred);
    }
  }, [currencyId, accountBalances, defaultCurrency?.id]);

  return { accountBalances, currencyId, setCurrencyId };
}
