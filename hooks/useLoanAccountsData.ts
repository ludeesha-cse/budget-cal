import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  getAccounts,
  getActiveLoanAccounts,
  getCurrencies,
  getInactiveLoanAccounts,
  getLoanTotalOwed,
  type LoanAccountType,
} from '../db/queries';
import { getCurrentDateString } from '../utils/date';
import { useKeyedFetch } from './useKeyedFetch';

export type ActiveLoan = Awaited<ReturnType<typeof getActiveLoanAccounts>>[number];
export type InactiveLoan = Awaited<
  ReturnType<typeof getInactiveLoanAccounts>
>[number];
export type LoanCurrencyRow = Awaited<ReturnType<typeof getCurrencies>>[number];
export type LoanAccountRow = Awaited<ReturnType<typeof getAccounts>>[number];

export interface UseLoanAccountsDataResult {
  type: LoanAccountType;
  setType: (type: LoanAccountType) => void;
  // Both types are loaded regardless of the toggle so the totals header
  // can show each side at once without a refetch when the toggle flips.
  activeLiabilities: ActiveLoan[];
  activeReceivables: ActiveLoan[];
  inactiveLoans: InactiveLoan[];
  currencies: LoanCurrencyRow[];
  accounts: LoanAccountRow[];
  loading: boolean;
  // Live total owed (principal + accrued interest, computed fresh — never
  // stored) per active loan account, keyed by accountId.
  totalOwedByAccountId: Record<string | number, number>;
  loans: ActiveLoan[];
  load: () => Promise<void>;
}

// `routeType` mirrors route.params?.type from the FAB's "Liability
// Repayment"/"Receivable Income" shortcuts (App.tsx) — passed in rather
// than the whole route object so this hook doesn't need to know about
// navigation types at all.
export function useLoanAccountsData(
  routeType: LoanAccountType | undefined,
): UseLoanAccountsDataResult {
  const [type, setType] = useState<LoanAccountType>(routeType ?? 'Liability');
  const [activeLiabilities, setActiveLiabilities] = useState<ActiveLoan[]>([]);
  const [activeReceivables, setActiveReceivables] = useState<ActiveLoan[]>([]);
  const [inactiveLoans, setInactiveLoans] = useState<InactiveLoan[]>([]);
  const [currencies, setCurrencies] = useState<LoanCurrencyRow[]>([]);
  const [accounts, setAccounts] = useState<LoanAccountRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [liabilityRows, receivableRows, inactiveRows, currencyRows, accountRows] =
      await Promise.all([
        getActiveLoanAccounts('Liability'),
        getActiveLoanAccounts('Receivable'),
        getInactiveLoanAccounts(type),
        getCurrencies(),
        getAccounts(),
      ]);
    setActiveLiabilities(liabilityRows);
    setActiveReceivables(receivableRows);
    setInactiveLoans(inactiveRows);
    setCurrencies(currencyRows);
    setAccounts(accountRows);
    setLoading(false);
  }, [type]);

  // Reacts to the FAB's "Liability Repayment"/"Receivable Income"
  // shortcuts navigating here with a fresh `type` param while this screen
  // is already mounted from an earlier visit. Deliberately does NOT pair
  // a separate "sync type from route params" effect with this
  // focus-triggered load the way the original screen did — that split
  // could fire load() twice in a row (once via the focus transition
  // itself, with the still-stale `type`, then again once the type-sync
  // effect's setType change produced a new `load` reference) every time
  // the FAB shortcut was used on an already-mounted screen. Folding the
  // sync into this same effect means a mismatched routeType only ever
  // calls setType and returns — never calling load() with the wrong
  // type — and the resulting re-render (with `type` now caught up)
  // re-runs this same effect once more, at which point the condition is
  // false and load() finally runs, exactly once, with the right type.
  useFocusEffect(
    useCallback(() => {
      if (routeType && routeType !== type) {
        setType(routeType);
        return;
      }
      load();
    }, [routeType, type, load]),
  );

  const loans = type === 'Liability' ? activeLiabilities : activeReceivables;

  // Refetched whenever either active-loan list actually changes (i.e.
  // every load()), not on every render — memoized so useKeyedFetch's own
  // `rows` dependency doesn't see a "new" array on renders where neither
  // list changed.
  const allActiveLoans = useMemo(
    () => [...activeLiabilities, ...activeReceivables],
    [activeLiabilities, activeReceivables],
  );
  const totalOwedByAccountId = useKeyedFetch(
    allActiveLoans,
    loan => loan.accountId,
    loan => getLoanTotalOwed(loan.accountId, getCurrentDateString()),
  );

  return {
    type,
    setType,
    activeLiabilities,
    activeReceivables,
    inactiveLoans,
    currencies,
    accounts,
    loading,
    totalOwedByAccountId,
    loans,
    load,
  };
}
