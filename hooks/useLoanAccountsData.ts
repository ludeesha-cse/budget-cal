import { useEffect, useMemo, useState } from 'react';
import {
  useAccountList,
  useActiveCurrencies,
  useActiveLoanAccounts,
  useInactiveLoanAccounts,
  useLoanTotalOwedByAccountId,
} from './queries';
import {
  getAccounts,
  getActiveCurrencies,
  getActiveLoanAccounts,
  getInactiveLoanAccounts,
  type LoanAccountType,
} from '../db/queries';
import { getCurrentDateString } from '../utils/date';

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

// Now four cached queries plus one cached total-owed per active loan,
// instead of a five-way Promise.all on every focus. Note the toggle
// (`type`) still only affects WHICH inactive list is queried — both
// active lists are always fetched, exactly as before, and flipping the
// toggle now costs nothing at all once each side has been seen once.
export function useLoanAccountsData(
  deps: UseLoanAccountsDataDeps,
): UseLoanAccountsDataResult {
  const { routeParams, clearRouteParams } = deps;
  const [type, setType] = useState<LoanAccountType>(
    routeParams?.type ?? 'Liability',
  );

  const { data: activeLiabilities, isPending: liabilitiesPending } =
    useActiveLoanAccounts('Liability');
  const { data: activeReceivables, isPending: receivablesPending } =
    useActiveLoanAccounts('Receivable');
  const { data: inactiveLoans, isPending: inactivePending } =
    useInactiveLoanAccounts(type);
  const { data: currencies, isPending: currenciesPending } =
    useActiveCurrencies();
  const { data: accounts, isPending: accountsPending } = useAccountList();

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

  // Memoized so useLoanTotalOwedByAccountId's own dependency doesn't see
  // a "new" array on renders where neither list actually changed.
  const allActiveLoanIds = useMemo(
    () =>
      [...(activeLiabilities ?? []), ...(activeReceivables ?? [])].map(
        loan => loan.accountId,
      ),
    [activeLiabilities, activeReceivables],
  );
  const totalOwedByAccountId = useLoanTotalOwedByAccountId(
    allActiveLoanIds,
    getCurrentDateString(),
  );

  return {
    type,
    setType,
    activeLiabilities: activeLiabilities ?? [],
    activeReceivables: activeReceivables ?? [],
    inactiveLoans: inactiveLoans ?? [],
    currencies: currencies ?? [],
    accounts: accounts ?? [],
    loading:
      liabilitiesPending ||
      receivablesPending ||
      inactivePending ||
      currenciesPending ||
      accountsPending,
    totalOwedByAccountId,
    loans: loans ?? [],
  };
}
