import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  getLoanPaymentsByMonth,
  getLoanPaymentsByYear,
  getTagsForTransaction,
  getTransactionsByMonth,
  getTransactionsByYear,
  getTransfers,
  getTransfersByYear,
  searchTransactions,
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
// here yet) means adding its fetch call to reload() below, mapping its
// rows to a new `{ kind: 'creditCardPayoff'; ... }` variant here, passing
// the mapped array into mergeHistoryRows alongside the others, and
// adding one render branch. mergeHistoryRows itself never needs to
// change — see its own comment.
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
  reload: () => Promise<void>;
}

// Fetches whichever rows should currently be on screen — either the
// month/year view (transactions + loan payments + transfers, merged and
// sorted) or search results (transactions only, ignoring month/year
// entirely) — plus each transaction row's own tags in one batch.
export function useTransactionHistoryData(
  filters: UseTransactionHistoryDataFilters,
): UseTransactionHistoryDataResult {
  const { month, year, isSearchMode, debouncedQuery, activeTagFilterIds } = filters;
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tagsByTransactionId, setTagsByTransactionId] = useState<
    Record<number, TagRow[]>
  >({});

  // Loads each currently-displayed transaction's own tags in one batch —
  // small dataset (a personal tracker's month or search-result page), so
  // one query per transaction is simpler and plenty fast, matching the
  // "small table, don't over-engineer" convention used elsewhere in this
  // app (e.g. Stage 15's own tag-AND filtering in searchTransactions).
  const loadTagsForRows = async (historyRows: HistoryRow[]) => {
    const transactionRows = historyRows.filter(
      (row): row is Extract<HistoryRow, { kind: 'transaction' }> =>
        row.kind === 'transaction',
    );
    const entries = await Promise.all(
      transactionRows.map(
        async row =>
          [row.data.id, await getTagsForTransaction(row.data.id)] as const,
      ),
    );
    setTagsByTransactionId(Object.fromEntries(entries));
  };

  const reload = useCallback(async () => {
    setLoading(true);

    if (isSearchMode) {
      // Search ignores month/year entirely, on purpose — see the Stage 15
      // spec: searchTransactions() always looks across every date. Loan
      // payments and transfers never appear here, since search only ever
      // queries `transactions`.
      const results = await searchTransactions({
        query: debouncedQuery.trim() || undefined,
        tagIds: activeTagFilterIds.length > 0 ? activeTagFilterIds : undefined,
      });
      const merged = results.map(
        (data): HistoryRow => ({ kind: 'transaction', date: data.date, data }),
      );
      setRows(merged);
      await loadTagsForRows(merged);
      setLoading(false);
      return;
    }

    const [transactionRows, loanPaymentRows, transferRows] = month
      ? await Promise.all([
          getTransactionsByMonth(`${year}-${month}`),
          getLoanPaymentsByMonth(`${year}-${month}`),
          getTransfers(`${year}-${month}`),
        ])
      : await Promise.all([
          getTransactionsByYear(year),
          getLoanPaymentsByYear(year),
          getTransfersByYear(year),
        ]);
    const merged = mergeHistoryRows(
      transactionRows.map(
        (data): HistoryRow => ({ kind: 'transaction', date: data.date, data }),
      ),
      loanPaymentRows.map(
        (data): HistoryRow => ({ kind: 'loanPayment', date: data.date, data }),
      ),
      transferRows.map(
        (data): HistoryRow => ({ kind: 'transfer', date: data.date, data }),
      ),
    );
    setRows(merged);
    await loadTagsForRows(merged);
    setLoading(false);
  }, [month, year, isSearchMode, debouncedQuery, activeTagFilterIds]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return { rows, loading, tagsByTransactionId, reload };
}
