import { useMemo } from 'react';
import {
  useDefaultCurrency,
  useLoanPaymentsByMonth,
  useLoanPaymentsByYear,
  useTagsForTransactions,
  useTransactionSearch,
  useTransactionsByMonth,
  useTransactionsByYear,
  useTransfersByMonth,
  useTransfersByYear,
} from './queries';
import {
  getLoanPaymentsByMonth,
  getTransactionsByMonth,
  getTransfers,
} from '../db/queries';
import type { TagRow } from './useTransactionHistoryFilters';

export type TransactionRow = Awaited<ReturnType<typeof getTransactionsByMonth>>[number];
export type LoanPaymentRow = Awaited<ReturnType<typeof getLoanPaymentsByMonth>>[number];
export type TransferRow = Awaited<ReturnType<typeof getTransfers>>[number];

// A tagged union so one FlatList can render every kind of money-movement
// event side by side without any of their shapes leaking into each
// other. This is the general "merge non-transaction events into
// History" pattern: adding a future kind (credit_card_payoffs is the
// next candidate — the table exists as of Stage 10b but isn't merged in
// here yet) means adding its query hook below, mapping its rows to a new
// `{ kind: 'creditCardPayoff'; ... }` variant here, passing the mapped
// array into mergeHistoryRows alongside the others, and adding one
// render branch. mergeHistoryRows itself never needs to change — see its
// own comment.
export type HistoryRow =
  | { kind: 'transaction'; date: string; data: TransactionRow }
  | { kind: 'loanPayment'; date: string; data: LoanPaymentRow }
  | { kind: 'transfer'; date: string; data: TransferRow };

// The one thing every money-movement kind needs from the merge: a flat
// list ordered by date, most recent first — matches the mockup's
// "RECENT" list reading top-to-bottom from today backwards. None of the
// source queries sort on their own, so this is the only place ordering
// is ever decided. Already a clean pure function — kept as-is.
function mergeHistoryRows(...sources: HistoryRow[][]): HistoryRow[] {
  const merged = sources.flat();
  merged.sort((a, b) => b.date.localeCompare(a.date));
  return merged;
}

export interface UseTransactionHistoryDataFilters {
  month: string;
  year: string;
  isSearchMode: boolean;
  debouncedQuery: string;
  activeTagFilterIds: number[];
}

export interface UseTransactionHistoryDataResult {
  rows: HistoryRow[];
  loading: boolean;
  tagsByTransactionId: Record<number, TagRow[]>;
  // Threaded down to TransactionRow so it can show a currency tag only on
  // rows whose currency differs from this — see TransactionRow's own
  // render logic. null until the default currency query resolves (or
  // permanently, if no currency is flagged default, which shouldn't
  // happen in practice).
  defaultCurrencyId: number | null;
}

// Whichever rows should currently be on screen — either the month/year
// view (transactions + loan payments + transfers, merged and sorted) or
// search results (transactions only, ignoring month/year entirely) —
// plus each transaction row's own tags.
//
// Every source is now a cached query, so paging back to a month already
// looked at this session costs nothing, and the merge/sort below is
// plain work over rows already in hand. `enabled` is what keeps the two
// modes from both querying: in search mode the month/year queries are
// switched off and vice versa, exactly mirroring the early return the
// old reload() used.
export function useTransactionHistoryData(
  filters: UseTransactionHistoryDataFilters,
): UseTransactionHistoryDataResult {
  const { month, year, isSearchMode, debouncedQuery, activeTagFilterIds } = filters;

  // Read from the reference cache rather than re-fetched on every load:
  // changing the default currency (Currencies screen) invalidates it, so
  // History still picks that up while it is open.
  const { data: defaultCurrency } = useDefaultCurrency();

  // Search ignores month/year entirely, on purpose — see the Stage 15
  // spec: searchTransactions() always looks across every date. Loan
  // payments and transfers never appear here, since search only ever
  // queries `transactions`.
  const trimmedQuery = debouncedQuery.trim();
  const search = useTransactionSearch(
    {
      query: trimmedQuery || undefined,
      tagIds: activeTagFilterIds.length > 0 ? activeTagFilterIds : undefined,
    },
    isSearchMode,
  );

  const monthMode = !isSearchMode && Boolean(month);
  const yearMode = !isSearchMode && !month;
  const period = `${year}-${month}`;

  const monthTransactions = useTransactionsByMonth(period, monthMode);
  const monthLoanPayments = useLoanPaymentsByMonth(period, monthMode);
  const monthTransfers = useTransfersByMonth(period, monthMode);

  const yearTransactions = useTransactionsByYear(year, yearMode);
  const yearLoanPayments = useLoanPaymentsByYear(year, yearMode);
  const yearTransfers = useTransfersByYear(year, yearMode);

  const rows = useMemo<HistoryRow[]>(() => {
    if (isSearchMode) {
      return (search.data ?? []).map(
        (data): HistoryRow => ({ kind: 'transaction', date: data.date, data }),
      );
    }
    const transactionRows = monthMode
      ? monthTransactions.data
      : yearTransactions.data;
    const loanPaymentRows = monthMode
      ? monthLoanPayments.data
      : yearLoanPayments.data;
    const transferRows = monthMode ? monthTransfers.data : yearTransfers.data;
    return mergeHistoryRows(
      (transactionRows ?? []).map(
        (data): HistoryRow => ({ kind: 'transaction', date: data.date, data }),
      ),
      (loanPaymentRows ?? []).map(
        (data): HistoryRow => ({ kind: 'loanPayment', date: data.date, data }),
      ),
      (transferRows ?? []).map(
        (data): HistoryRow => ({ kind: 'transfer', date: data.date, data }),
      ),
    );
  }, [
    isSearchMode,
    monthMode,
    search.data,
    monthTransactions.data,
    monthLoanPayments.data,
    monthTransfers.data,
    yearTransactions.data,
    yearLoanPayments.data,
    yearTransfers.data,
  ]);

  // Each currently-displayed transaction's own tags, one cached entry per
  // transaction (small dataset — a personal tracker's month or
  // search-result page). Same "small table, don't over-engineer"
  // convention used elsewhere in this app; the difference from the old
  // batch is that scrolling back to a month already seen re-reads
  // nothing.
  const transactionIds = useMemo(
    () =>
      rows
        .filter(
          (row): row is Extract<HistoryRow, { kind: 'transaction' }> =>
            row.kind === 'transaction',
        )
        .map(row => row.data.id),
    [rows],
  );
  const tagsByTransactionId = useTagsForTransactions(transactionIds);

  const loading = isSearchMode
    ? search.isPending
    : monthMode
      ? monthTransactions.isPending ||
        monthLoanPayments.isPending ||
        monthTransfers.isPending
      : yearTransactions.isPending ||
        yearLoanPayments.isPending ||
        yearTransfers.isPending;

  return {
    rows,
    loading,
    tagsByTransactionId,
    defaultCurrencyId: defaultCurrency?.id ?? null,
  };
}
