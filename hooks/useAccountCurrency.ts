import { useEffect, useState } from 'react';
import { getAccountBalances } from '../db/queries';
import { preferredCurrencyId } from '../utils/currencyHelpers';
import { useDefaultCurrency } from './queries';

type AccountBalanceRow = Awaited<ReturnType<typeof getAccountBalances>>[number];

export interface UseAccountCurrencyResult {
  accountBalances: AccountBalanceRow[];
  currencyId: number | null;
  setCurrencyId: React.Dispatch<React.SetStateAction<number | null>>;
  // The account whose balances `accountBalances` currently holds, or null
  // while they are still loading. Lets a form tell "this account holds no
  // currency" apart from "not loaded yet" without flashing an empty state
  // on every account switch.
  balancesLoadedFor: number | null;
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
  const [balancesLoadedFor, setBalancesLoadedFor] = useState<number | null>(
    null,
  );
  const { data: defaultCurrency } = useDefaultCurrency();

  useEffect(() => {
    setBalancesLoadedFor(null);
    if (accountId == null) {
      setAccountBalances([]);
      setCurrencyId(null);
      return;
    }
    let cancelled = false;
    getAccountBalances(accountId)
      .then(balances => {
        if (cancelled) {
          return;
        }
        setAccountBalances(balances);
        setBalancesLoadedFor(accountId);
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
      })
      .catch(error => {
        // Leaves the picker on "Select currency"; saving then says what
        // is missing rather than failing silently.
        console.error(
          `useAccountCurrency: failed to load balances for account id=${accountId}`,
          error,
        );
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

  // Preselects the user's default currency on an account that holds
  // several — the old behavior left the picker empty and made them pick
  // the same answer every time (see preferredCurrencyId). Split out from
  // the effect above rather than folded into it because the default
  // currency arrives from its own cached query, which can resolve AFTER
  // the balances do on a cold start; this way the preselect still lands
  // when it does.
  //
  // Only ever fills an EMPTY selection, so it can never overwrite the
  // currency of a transaction being edited, nor a choice the user has
  // already made — there is no control in this app that sets the
  // currency back to null.
  useEffect(() => {
    if (currencyId != null || accountBalances.length === 0) {
      return;
    }
    const preferred = preferredCurrencyId(accountBalances, defaultCurrency?.id);
    if (preferred != null) {
      setCurrencyId(preferred);
    }
  }, [currencyId, accountBalances, defaultCurrency?.id]);

  return { accountBalances, currencyId, setCurrencyId, balancesLoadedFor };
}
