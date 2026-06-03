import { useEffect, useState } from 'react';
import { getAccountBalances } from '../db/queries';

type AccountBalanceRow = Awaited<ReturnType<typeof getAccountBalances>>[number];

export interface UseAccountCurrencyResult {
  accountBalances: AccountBalanceRow[];
  currencyId: number | null;
  setCurrencyId: React.Dispatch<React.SetStateAction<number | null>>;
}

// Shared by TransactionForm and IncomeForm: after an account is picked
// (including the initial default), loads only that account's own
// currencies. Switching accounts always resets the currency choice
// rather than leaving a stale, invalid selection — silently to the
// account's one currency if it only has one, or to "unselected" if
// there's a real choice to make.
//
// `initialCurrencyId` (only ever meaningful when editing an existing
// transaction — TransactionForm's edit mode) is honored exactly once, on
// the very first balances load for whatever account it started on; every
// load after an actual account switch ignores it. Passing it as
// `undefined` (IncomeForm, which never edits) makes that first-load
// special case never trigger, degrading to the plain "reset on switch"
// behavior with no extra code path needed at the call site.
export function useAccountCurrency(
  accountId: number | null,
  initialCurrencyId?: number,
): UseAccountCurrencyResult {
  const [accountBalances, setAccountBalances] = useState<AccountBalanceRow[]>(
    [],
  );
  const [currencyId, setCurrencyId] = useState<number | null>(null);
  // Whether this effect has run at least once — only that first run
  // honors initialCurrencyId; every run after an actual account switch
  // resets to "no selection" or the account's one currency instead.
  const [hasInitializedCurrency, setHasInitializedCurrency] = useState(false);

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
      const initialCurrencyStillValid =
        !hasInitializedCurrency &&
        initialCurrencyId != null &&
        balances.some(b => b.currencyId === initialCurrencyId);
      setCurrencyId(
        initialCurrencyStillValid
          ? initialCurrencyId!
          : balances.length === 1
            ? balances[0].currencyId
            : null,
      );
      setHasInitializedCurrency(true);
    });
    return () => {
      cancelled = true;
    };
    // Deliberately keyed only on accountId — hasInitializedCurrency and
    // initialCurrencyId are read for their current values, not reasons to
    // re-run: re-running on hasInitializedCurrency flipping would just
    // immediately re-trigger itself, and initialCurrencyId is only ever
    // meaningful on this effect's very first run anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  return { accountBalances, currencyId, setCurrencyId };
}
