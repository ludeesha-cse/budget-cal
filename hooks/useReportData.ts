import { useEffect, useMemo, useState } from 'react';
import { loadFailureOf } from './loadFailure';
import { useQueries } from '@tanstack/react-query';
import {
  getActiveCurrencies,
  getMonthlyTrend,
  getReportSummary,
  getSpendingByAccountType,
  getSpendingByCategory,
} from '../db/queries';
import { queryKeys } from '../db/queryKeys';
import { TRANSACTIONAL_STALE_TIME } from '../db/queryConfig';
import {
  useActiveCurrencies,
  useDefaultCurrency,
  useMonthlyTrend,
  useReportSummary,
  useSpendingByAccountType,
  useSpendingByCategory,
} from './queries';
import { useStableList } from './useStableList';
import { isWholeMonthRange, resolveReportPeriod } from '../utils/dateUtils';
import type { ReportPeriod, ResolvedReportPeriod } from '../utils/dateUtils';
import { getCurrentDateString } from '../utils/date';

export type ReportCurrencyRow = Awaited<
  ReturnType<typeof getActiveCurrencies>
>[number];
export type ReportSummaryResult = Awaited<ReturnType<typeof getReportSummary>>;
export type ReportCategoryRow = Awaited<
  ReturnType<typeof getSpendingByCategory>
>[number];
export type ReportAccountTypeRow = Awaited<
  ReturnType<typeof getSpendingByAccountType>
>[number];
export type ReportTrendRow = Awaited<
  ReturnType<typeof getMonthlyTrend>
>[number];
export type ReportRange = ResolvedReportPeriod;

// A second date range whose activity also makes a currency selectable —
// the Compare tab's previous period, so a currency that only had activity
// THEN can still be picked and compared.
export type ReportProbeRange = { startDate: string; endDate: string };

export interface UseReportDataResult {
  currencyId: number | null;
  setCurrencyId: (id: number) => void;
  currencies: ReportCurrencyRow[];
  availableCurrencies: ReportCurrencyRow[];
  summary: ReportSummaryResult | null;
  categoryBreakdown: ReportCategoryRow[];
  accountTypeBreakdown: ReportAccountTypeRow[];
  trend: ReportTrendRow[];
  loading: boolean;
  // See hooks/loadFailure.ts.
  loadFailed: boolean;
  retry: () => void;
  range: ReportRange;
  // The date the range was resolved against ('YYYY-MM-DD').
  today: string;
}

// period/includeExcluded stay owned by the screen orchestrator (they're
// plain UI toggles, not fetched data) and are passed in here since both
// drive what gets queried.
//
// Every read below is cached and keyed by the exact arguments it was
// asked for, which is what makes the report's own controls cheap:
// flipping back to a range or a currency tab already looked at this
// session re-reads nothing. Any transaction write invalidates the whole
// reports prefix, so the aggregates cannot silently lag the ledger.
export function useReportData(
  period: ReportPeriod,
  includeExcluded: boolean,
  extraProbeRange: ReportProbeRange | null = null,
): UseReportDataResult {
  const [currencyId, setCurrencyId] = useState<number | null>(null);

  // Computed once per mount — a report screen isn't expected to stay open
  // across a real midnight rollover in a way that matters here.
  const today = useMemo(() => getCurrentDateString(), []);
  const range = useMemo(
    () => resolveReportPeriod(period, today),
    [period, today],
  );
  // Only a range that cuts months short (a custom range) needs the trend
  // clamped to its exact days; whole months keep the original query.
  const trendClamp = isWholeMonthRange(range.startDate, range.endDate)
    ? null
    : range;

  // Starts from getActiveCurrencies() rather than every currency in the
  // app — a currency the user has disabled on the Currencies screen
  // shouldn't surface as a report tab even if it has old activity
  // sitting in it.
  const currenciesQuery = useActiveCurrencies();
  const { data: allCurrencies, isPending: currenciesPending } = currenciesQuery;
  const { data: defaultCurrency } = useDefaultCurrency();

  // One summary per currency, purely to test "does this currency have
  // any activity in this range" — cheap at this app's scale (a handful
  // of currencies for a personal tracker), and these are the SAME cache
  // entries the summary section itself reads, so "has activity" can
  // never disagree with what the summary would actually show, and the
  // selected currency's probe costs nothing extra.
  const probeResults = useQueries({
    queries: (allCurrencies ?? []).map(currency => ({
      queryKey: queryKeys.transactional.reports.summary(
        range.startDate,
        range.endDate,
        currency.id,
        includeExcluded,
      ),
      queryFn: () =>
        getReportSummary(
          range.startDate,
          range.endDate,
          currency.id,
          includeExcluded,
        ),
      staleTime: TRANSACTIONAL_STALE_TIME,
    })),
  });
  // One fixed-size dependency instead of spreading a list whose length
  // tracks how many currencies are active — see hooks/useStableList.ts.
  const probeData = useStableList(probeResults.map(result => result.data));

  // Same probe over the extra range, when there is one. These are the
  // exact cache entries the Compare tab's previous-period summary reads.
  const extraProbeResults = useQueries({
    queries: extraProbeRange
      ? (allCurrencies ?? []).map(currency => ({
          queryKey: queryKeys.transactional.reports.summary(
            extraProbeRange.startDate,
            extraProbeRange.endDate,
            currency.id,
            includeExcluded,
          ),
          queryFn: () =>
            getReportSummary(
              extraProbeRange.startDate,
              extraProbeRange.endDate,
              currency.id,
              includeExcluded,
            ),
          // No staleTime: the transactional prefix default applies.
        }))
      : [],
  });
  const extraProbeData = useStableList(
    extraProbeResults.map(result => result.data),
  );
  const probesPending =
    probeResults.some(result => result.isPending) ||
    extraProbeResults.some(result => result.isPending);

  // Only currencies with at least one matching transaction in the
  // current range + includeExcluded state — recomputed whenever those
  // probes change, so toggling "include excluded" can change which
  // currencies are even offered (a currency whose only activity is
  // excluded transactions only shows up once the toggle is on).
  const availableCurrencies = useMemo(
    () =>
      (allCurrencies ?? []).filter((_, index) =>
        [probeData[index], extraProbeData[index]].some(
          summary =>
            summary != null &&
            (summary.totalExpenses > 0 || summary.totalIncome > 0),
        ),
      ),
    [allCurrencies, probeData, extraProbeData],
  );

  // The current selection if it's still valid, else the app's default
  // currency if that's available, else the first available one.
  const resolvedCurrencyId = useMemo(() => {
    if (
      currencyId != null &&
      availableCurrencies.some(c => c.id === currencyId)
    ) {
      return currencyId;
    }
    if (
      defaultCurrency &&
      availableCurrencies.some(c => c.id === defaultCurrency.id)
    ) {
      return defaultCurrency.id;
    }
    return availableCurrencies[0]?.id ?? null;
  }, [currencyId, availableCurrencies, defaultCurrency]);

  useEffect(() => {
    if (resolvedCurrencyId !== currencyId) {
      setCurrencyId(resolvedCurrencyId);
    }
  }, [resolvedCurrencyId, currencyId]);

  // The four report aggregates for whichever currency was just resolved.
  // The summary here hits the exact cache entry the probe above already
  // populated, so it is not a second read.
  const summary = useReportSummary(
    range.startDate,
    range.endDate,
    resolvedCurrencyId,
    includeExcluded,
  );
  const categoryBreakdown = useSpendingByCategory(
    range.startDate,
    range.endDate,
    resolvedCurrencyId,
    includeExcluded,
  );
  const accountTypeBreakdown = useSpendingByAccountType(
    range.startDate,
    range.endDate,
    resolvedCurrencyId,
    includeExcluded,
  );
  const trend = useMonthlyTrend(
    range.months,
    resolvedCurrencyId,
    includeExcluded,
    trendClamp?.startDate,
    trendClamp?.endDate,
  );

  const loading =
    currenciesPending ||
    probesPending ||
    (resolvedCurrencyId != null &&
      (summary.isPending ||
        categoryBreakdown.isPending ||
        accountTypeBreakdown.isPending ||
        trend.isPending));

  const failure = loadFailureOf(
    currenciesQuery,
    ...probeResults,
    ...extraProbeResults,
    summary,
    categoryBreakdown,
    accountTypeBreakdown,
    trend,
  );

  return {
    currencyId,
    setCurrencyId,
    currencies: allCurrencies ?? [],
    availableCurrencies,
    summary: resolvedCurrencyId == null ? null : summary.data ?? null,
    categoryBreakdown:
      resolvedCurrencyId == null ? [] : categoryBreakdown.data ?? [],
    accountTypeBreakdown:
      resolvedCurrencyId == null ? [] : accountTypeBreakdown.data ?? [],
    trend: resolvedCurrencyId == null ? [] : trend.data ?? [],
    ...failure,
    loading: loading && !failure.loadFailed,
    range,
    today,
  };
}
