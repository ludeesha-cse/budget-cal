import { useMemo } from 'react';
import {
  useReportSummary,
  useSpendingByAccountType,
  useSpendingByCategory,
} from './queries';
import type { ComparisonPeriods } from '../utils/dateUtils';
import {
  accountTypeRowsForComparison,
  categoryRowsForComparison,
  compareBreakdown,
  compareTotals,
} from '../utils/reportComparison';
import type {
  BreakdownComparisonRow,
  TotalsComparison,
} from '../utils/reportComparison';

export type ReportComparisonData = {
  loading: boolean;
  // Whether each period had any income or spending at all.
  currentHasData: boolean;
  previousHasData: boolean;
  totals: TotalsComparison | null;
  categories: BreakdownComparisonRow[];
  accountTypes: BreakdownComparisonRow[];
};

// The Compare tab's data: the same three report queries the Overview
// uses, run once for each of the two ranges. Their keys already carry
// the dates, so each range is its own cache entry — flipping between
// tabs or back to a period seen before reads nothing again. All the
// comparison itself is pure maths over those rows (utils/reportComparison.ts).
export function useReportComparisonData(
  periods: ComparisonPeriods,
  currencyId: number | null,
  includeExcluded: boolean,
): ReportComparisonData {
  const { current, previous } = periods;

  const currentSummary = useReportSummary(
    current.startDate,
    current.endDate,
    currencyId,
    includeExcluded,
  );
  const previousSummary = useReportSummary(
    previous.startDate,
    previous.endDate,
    currencyId,
    includeExcluded,
  );
  const currentCategories = useSpendingByCategory(
    current.startDate,
    current.endDate,
    currencyId,
    includeExcluded,
  );
  const previousCategories = useSpendingByCategory(
    previous.startDate,
    previous.endDate,
    currencyId,
    includeExcluded,
  );
  const currentAccountTypes = useSpendingByAccountType(
    current.startDate,
    current.endDate,
    currencyId,
    includeExcluded,
  );
  const previousAccountTypes = useSpendingByAccountType(
    previous.startDate,
    previous.endDate,
    currencyId,
    includeExcluded,
  );

  const totals = useMemo(
    () =>
      currentSummary.data && previousSummary.data
        ? compareTotals(
            currentSummary.data,
            previousSummary.data,
            current.dayCount,
            previous.dayCount,
          )
        : null,
    [
      currentSummary.data,
      previousSummary.data,
      current.dayCount,
      previous.dayCount,
    ],
  );

  const categories = useMemo(
    () =>
      compareBreakdown(
        categoryRowsForComparison(currentCategories.data ?? []),
        categoryRowsForComparison(previousCategories.data ?? []),
      ),
    [currentCategories.data, previousCategories.data],
  );

  const accountTypes = useMemo(
    () =>
      compareBreakdown(
        accountTypeRowsForComparison(currentAccountTypes.data ?? []),
        accountTypeRowsForComparison(previousAccountTypes.data ?? []),
      ),
    [currentAccountTypes.data, previousAccountTypes.data],
  );

  const hasActivity = (summary: typeof currentSummary.data) =>
    summary != null && (summary.totalIncome > 0 || summary.totalExpenses > 0);

  return {
    loading:
      currencyId != null &&
      [
        currentSummary,
        previousSummary,
        currentCategories,
        previousCategories,
        currentAccountTypes,
        previousAccountTypes,
      ].some(query => query.isPending),
    currentHasData: hasActivity(currentSummary.data),
    previousHasData: hasActivity(previousSummary.data),
    totals,
    categories,
    accountTypes,
  };
}
