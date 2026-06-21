import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  getActiveCurrencies,
  getDefaultCurrency,
  getMonthlyTrend,
  getReportSummary,
  getSpendingByAccountType,
  getSpendingByCategory,
} from '../db/queries';
import { getReportRange } from '../utils/dateUtils';
import type { ReportRangePreset } from '../utils/dateUtils';
import { getCurrentDateString } from '../utils/date';

export type ReportCurrencyRow = Awaited<ReturnType<typeof getActiveCurrencies>>[number];
export type ReportSummaryResult = Awaited<ReturnType<typeof getReportSummary>>;
export type ReportCategoryRow = Awaited<ReturnType<typeof getSpendingByCategory>>[number];
export type ReportAccountTypeRow = Awaited<
  ReturnType<typeof getSpendingByAccountType>
>[number];
export type ReportTrendRow = Awaited<ReturnType<typeof getMonthlyTrend>>[number];
export type ReportRange = ReturnType<typeof getReportRange>;

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
  range: ReportRange;
}

// preset/includeExcluded stay owned by the screen orchestrator (they're
// plain UI toggles, not fetched data) and are passed in here since both
// drive what gets queried.
export function useReportData(
  preset: ReportRangePreset,
  includeExcluded: boolean,
): UseReportDataResult {
  const [currencies, setCurrencies] = useState<ReportCurrencyRow[]>([]);
  // Only currencies with at least one matching transaction in the
  // current range + includeExcluded state — recomputed every load, so
  // toggling "include excluded" can change which currencies are even
  // offered (a currency whose only activity is excluded transactions
  // only shows up once the toggle is on).
  const [availableCurrencyIds, setAvailableCurrencyIds] = useState<number[]>([]);
  const [currencyId, setCurrencyId] = useState<number | null>(null);
  const [summary, setSummary] = useState<ReportSummaryResult | null>(null);
  const [categoryBreakdown, setCategoryBreakdown] = useState<ReportCategoryRow[]>([]);
  const [accountTypeBreakdown, setAccountTypeBreakdown] = useState<
    ReportAccountTypeRow[]
  >([]);
  const [trend, setTrend] = useState<ReportTrendRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Computed once per mount — a report screen isn't expected to stay open
  // across a real midnight rollover in a way that matters here.
  const today = useMemo(() => getCurrentDateString(), []);
  const range = useMemo(() => getReportRange(preset, today), [preset, today]);

  // Which currencies actually have activity in this range, and which one
  // should end up selected: the current selection if it's still valid,
  // else the app's default currency if that's available, else the first
  // available one. Starts from getActiveCurrencies() rather than every
  // currency in the app — a currency the user has disabled on the
  // Currencies screen shouldn't surface as a report tab even if it has
  // old activity sitting in it.
  const resolveAvailableCurrencies = useCallback(async () => {
    const [allCurrencies, defaultCurrency] = await Promise.all([
      getActiveCurrencies(),
      getDefaultCurrency(),
    ]);
    // One summary per currency just to test "does this currency have any
    // activity in this range" — cheap at this app's scale (a handful of
    // currencies for a personal tracker), and reuses the exact same
    // query the summary section itself calls, so "has activity" can
    // never disagree with what the summary would actually show.
    const summaries = await Promise.all(
      allCurrencies.map(currency =>
        getReportSummary(range.startDate, range.endDate, currency.id, includeExcluded),
      ),
    );
    const available = allCurrencies.filter(
      (_, index) =>
        summaries[index].totalExpenses > 0 || summaries[index].totalIncome > 0,
    );
    const resolvedCurrencyId =
      currencyId != null && available.some(c => c.id === currencyId)
        ? currencyId
        : defaultCurrency && available.some(c => c.id === defaultCurrency.id)
          ? defaultCurrency.id
          : (available[0]?.id ?? null);
    return { allCurrencies, available, resolvedCurrencyId };
  }, [range, includeExcluded, currencyId]);

  // The four report aggregates for whichever currency was just resolved.
  const fetchReportData = useCallback(
    async (resolvedCurrencyId: number) => {
      const [summaryResult, categoryResult, accountTypeResult, trendResult] =
        await Promise.all([
          getReportSummary(range.startDate, range.endDate, resolvedCurrencyId, includeExcluded),
          getSpendingByCategory(range.startDate, range.endDate, resolvedCurrencyId, includeExcluded),
          getSpendingByAccountType(range.startDate, range.endDate, resolvedCurrencyId, includeExcluded),
          getMonthlyTrend(range.months, resolvedCurrencyId, includeExcluded),
        ]);
      return { summaryResult, categoryResult, accountTypeResult, trendResult };
    },
    [range, includeExcluded],
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);

      resolveAvailableCurrencies().then(
        async ({ allCurrencies, available, resolvedCurrencyId }) => {
          if (cancelled) {
            return;
          }
          setCurrencies(allCurrencies);
          setAvailableCurrencyIds(available.map(c => c.id));
          if (resolvedCurrencyId !== currencyId) {
            setCurrencyId(resolvedCurrencyId);
          }

          if (resolvedCurrencyId == null) {
            setSummary(null);
            setCategoryBreakdown([]);
            setAccountTypeBreakdown([]);
            setTrend([]);
            setLoading(false);
            return;
          }

          const { summaryResult, categoryResult, accountTypeResult, trendResult } =
            await fetchReportData(resolvedCurrencyId);
          if (cancelled) {
            return;
          }
          setSummary(summaryResult);
          setCategoryBreakdown(categoryResult);
          setAccountTypeBreakdown(accountTypeResult);
          setTrend(trendResult);
          setLoading(false);
        },
      );

      return () => {
        cancelled = true;
      };
    }, [resolveAvailableCurrencies, fetchReportData, currencyId]),
  );

  const availableCurrencies = useMemo(
    () => currencies.filter(c => availableCurrencyIds.includes(c.id)),
    [currencies, availableCurrencyIds],
  );

  return {
    currencyId,
    setCurrencyId,
    currencies,
    availableCurrencies,
    summary,
    categoryBreakdown,
    accountTypeBreakdown,
    trend,
    loading,
    range,
  };
}
