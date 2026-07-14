import { useQuery } from '@tanstack/react-query';
import {
  getMonthlyTrend,
  getReportSummary,
  getSpendingByAccountType,
  getSpendingByCategory,
} from '../../db/queries';
import { queryKeys } from '../../db/queryKeys';

// Report aggregates. Every one of these is a GROUP BY over the same
// transactions table, so all four are stale under exactly the conditions
// the transaction list is, and every transaction write invalidates them.

// Transactional stale time: income/expense/net for a date range —
// recomputed from the ledger, so it inherits the ledger's window.
export function useReportSummary(
  startDate: string,
  endDate: string,
  currencyId: number | null,
  includeExcluded: boolean,
) {
  return useQuery({
    queryKey: queryKeys.transactional.reports.summary(
      startDate,
      endDate,
      currencyId ?? -1,
      includeExcluded,
    ),
    queryFn: () =>
      getReportSummary(startDate, endDate, currencyId as number, includeExcluded),
    enabled: currencyId != null,
  });
}

// Transactional stale time: spend grouped by category over a range —
// same source rows, same tolerance as the summary above.
export function useSpendingByCategory(
  startDate: string,
  endDate: string,
  currencyId: number | null,
  includeExcluded?: boolean,
) {
  return useQuery({
    queryKey: queryKeys.transactional.reports.spendingByCategory(
      startDate,
      endDate,
      currencyId ?? -1,
      includeExcluded ?? false,
    ),
    queryFn: () =>
      getSpendingByCategory(
        startDate,
        endDate,
        currencyId as number,
        includeExcluded,
      ),
    enabled: currencyId != null,
  });
}

// Transactional stale time: spend grouped by account type over a range —
// same source rows again.
export function useSpendingByAccountType(
  startDate: string,
  endDate: string,
  currencyId: number | null,
  includeExcluded: boolean,
) {
  return useQuery({
    queryKey: queryKeys.transactional.reports.spendingByAccountType(
      startDate,
      endDate,
      currencyId ?? -1,
      includeExcluded,
    ),
    queryFn: () =>
      getSpendingByAccountType(
        startDate,
        endDate,
        currencyId as number,
        includeExcluded,
      ),
    enabled: currencyId != null,
  });
}

// Transactional stale time: the month-by-month trend line, aggregated
// from the ledger and invalidated by the same writes.
export function useMonthlyTrend(
  months: string[],
  currencyId: number | null,
  includeExcluded: boolean,
) {
  return useQuery({
    queryKey: queryKeys.transactional.reports.monthlyTrend(
      months,
      currencyId ?? -1,
      includeExcluded,
    ),
    queryFn: () =>
      getMonthlyTrend(months, currencyId as number, includeExcluded),
    enabled: currencyId != null,
  });
}
