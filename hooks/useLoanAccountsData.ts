import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  getAccounts,
  getActiveCurrencies,
  getActiveLoanAccounts,
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
export type LoanCurrencyRow = Awaited<ReturnType<typeof getActiveCurrencies>>[number];
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

export interface UseLoanAccountsDataDeps {
  // Only ever set for the FAB's "Liability Repayment"/"Receivable Income"
  // shortcuts (App.tsx's AddEntrySheet) — undefined means no deep link is
  // pending, same convention as useTransfer's routeParams.
  routeParams: { type?: LoanAccountType } | undefined;
  // Clears routeParams.type right after it's consumed (below), the same
  // one-time-preset pattern useTransfer uses for withdrawMode/openTransfer.
  // Without this, `type` being in a focus effect's own dependency array
  // (the original implementation) meant EVERY type change — including the
  // user's own SegmentedToggle taps, not just the FAB's initial preset —
  // re-triggered the "does routeType still disagree with type?" check,
  // forcing the toggle straight back and making it look stuck.
  clearRouteParams: () => void;
}

export function useLoanAccountsData(
  deps: UseLoanAccountsDataDeps,
): UseLoanAccountsDataResult {
  const { routeParams, clearRouteParams } = deps;
  const [type, setType] = useState<LoanAccountType>(
    routeParams?.type ?? 'Liability',
  );
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
        getActiveCurrencies(),
        getAccounts(),
      ]);
    setActiveLiabilities(liabilityRows);
    setActiveReceivables(receivableRows);
    setInactiveLoans(inactiveRows);
    setCurrencies(currencyRows);
    setAccounts(accountRows);
    setLoading(false);
  }, [type]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Consumes the FAB's one-time `type` preset exactly once, mirroring
  // useTransfer's withdrawMode/openTransfer handling — clearRouteParams
  // wipes routeParams.type immediately after, so this never fires again
  // from a later SegmentedToggle tap (those only ever call the plain
  // setType below, never touch routeParams) and never re-forces the type
  // back on a later re-render.
  useEffect(() => {
    if (routeParams?.type) {
      setType(routeParams.type);
      clearRouteParams();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeParams?.type]);

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
