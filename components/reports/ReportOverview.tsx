import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import Card from '../Card';
import ReportSummaryCard from './ReportSummaryCard';
import CategoryPieCard from './CategoryPieCard';
import AmountListRow from './AmountListRow';
import AccountTypeBars from './AccountTypeBars';
import TrendChartCard from './TrendChartCard';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import {
  SHORT_RANGE_MAX_DAYS,
  formatTrendRowLabel,
} from '../../utils/dateUtils';
import { formatAmount, formatPercent } from '../../utils/formatAmount';
import type {
  ReportAccountTypeRow,
  ReportCategoryRow,
  ReportRange,
  ReportSummaryResult,
  ReportTrendRow,
} from '../../hooks/useReportData';

type Props = {
  summary: ReportSummaryResult;
  categoryBreakdown: ReportCategoryRow[];
  accountTypeBreakdown: ReportAccountTypeRow[];
  trend: ReportTrendRow[];
  range: ReportRange;
  currencyCode: string;
  chartWidth: number;
};

// The Reports "Overview" tab: summary, spending by category and account
// type, and the trend over the selected period. The period/currency/
// include-excluded controls stay on ReportsScreen, shared with Compare.
function ReportOverview({
  summary,
  categoryBreakdown,
  accountTypeBreakdown,
  trend,
  range,
  currencyCode,
  chartWidth,
}: Props): React.JSX.Element {
  const { colors } = useTheme();

  // A custom range of a month or less spans at most two PARTIAL months,
  // and two half-empty month bars would read as a trend that isn't
  // there. It gets the whole range as one Income-vs-Expenses pair
  // instead — from the summary already loaded, so no extra query.
  const isShortRange =
    range.kind === 'custom' && range.dayCount <= SHORT_RANGE_MAX_DAYS;
  const trendRows = useMemo<ReportTrendRow[]>(
    () =>
      isShortRange
        ? [
            {
              month: range.startDate.slice(0, 7),
              totalIncome: summary.totalIncome,
              totalExpenses: summary.totalExpenses,
            },
          ]
        : trend,
    [isShortRange, range.startDate, summary, trend],
  );
  const formatMonth = useCallback(
    (month: string) =>
      isShortRange
        ? range.label
        : formatTrendRowLabel(month, range.startDate, range.endDate),
    [isShortRange, range],
  );

  return (
    <>
      <ReportSummaryCard summary={summary} />

      <Text
        style={[
          typography.eyebrow,
          styles.sectionLabel,
          { color: colors.textSecondary },
        ]}
      >
        Spending by Category
      </Text>
      {categoryBreakdown.length === 0 ? (
        <Card colors={colors} style={styles.card}>
          <Text style={{ color: colors.textSecondary }}>
            No expenses in this range.
          </Text>
        </Card>
      ) : (
        <>
          <CategoryPieCard
            categoryBreakdown={categoryBreakdown}
            chartWidth={chartWidth}
            totalExpenses={summary.totalExpenses}
            currencyCode={currencyCode}
          />
          {categoryBreakdown.map(row => (
            <AmountListRow
              key={row.categoryId ?? 'uncategorized'}
              label={row.categoryName}
              primaryText={formatAmount(row.total, currencyCode)}
              primaryColor={colors.text}
              secondaryText={formatPercent(row.percentage, 1)}
              secondaryColor={colors.textSecondary}
            />
          ))}
        </>
      )}

      <Text
        style={[
          typography.eyebrow,
          styles.sectionLabel,
          { color: colors.textSecondary },
        ]}
      >
        Spending by Account Type
      </Text>
      <AccountTypeBars
        accountTypeBreakdown={accountTypeBreakdown}
        currencyCode={currencyCode}
      />

      <Text
        style={[
          typography.eyebrow,
          styles.sectionLabel,
          { color: colors.textSecondary },
        ]}
      >
        {isShortRange ? 'Income vs Expenses' : 'Monthly Trend'}
      </Text>
      {/* Keyed on the range so a tapped month (an index into this
          range's months) is cleared rather than carried into another. */}
      <TrendChartCard
        key={`${range.startDate}:${range.endDate}`}
        trend={trendRows}
        chartWidth={chartWidth}
        currencyCode={currencyCode}
        formatMonth={formatMonth}
      />
      {trendRows.map(row => (
        <AmountListRow
          key={row.month}
          label={formatMonth(row.month)}
          primaryText={`+${formatAmount(row.totalIncome, currencyCode)}`}
          primaryColor={colors.success}
          secondaryText={`-${formatAmount(row.totalExpenses, currencyCode)}`}
          secondaryColor={colors.danger}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    marginTop: 22,
    marginBottom: 10,
  },
  card: {
    padding: 16,
  },
});

export default ReportOverview;
