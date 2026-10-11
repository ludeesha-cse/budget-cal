import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Card from '../Card';
import EmptyState from '../common/EmptyState';
import AmountListRow from './AmountListRow';
import ComparisonSummaryCard from './ComparisonSummaryCard';
import ComparisonBarChart from './ComparisonBarChart';
import CategoryComparisonChart from './CategoryComparisonChart';
import CategoryChangeList from './CategoryChangeList';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, scaleFont } from '../../theme/typography';
import { useReportComparisonData } from '../../hooks/useReportComparisonData';
import { formatAmount, formatPercent } from '../../utils/formatAmount';
import {
  biggestDecreases,
  biggestIncreases,
  formatPercentChange,
  topWithOther,
} from '../../utils/reportComparison';
import type { ComparisonPeriods } from '../../utils/dateUtils';

type Props = {
  periods: ComparisonPeriods;
  currencyId: number | null;
  currencyCode: string;
  includeExcluded: boolean;
};

// The Reports "Compare" tab: the selected period against the one before
// it (see getPreviousPeriod for which period that is).
function ReportComparison({
  periods,
  currencyId,
  currencyCode,
  includeExcluded,
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { current, previous } = periods;
  const data = useReportComparisonData(periods, currencyId, includeExcluded);

  const chartCategories = useMemo(
    () => topWithOther(data.categories, 6),
    [data.categories],
  );
  const increases = useMemo(
    () => biggestIncreases(data.categories),
    [data.categories],
  );
  const decreases = useMemo(
    () => biggestDecreases(data.categories),
    [data.categories],
  );

  const header = (
    <View style={styles.header}>
      <Text style={[styles.headerTitle, { color: colors.text }]}>
        {current.shortLabel} vs {previous.shortLabel}
      </Text>
      <Text style={[styles.headerDates, { color: colors.textSecondary }]}>
        {current.dateLabel} · {previous.dateLabel}
      </Text>
      {periods.note && (
        <Text style={[styles.note, { color: colors.textSecondary }]}>
          {periods.note}
        </Text>
      )}
    </View>
  );

  if (currencyId == null) {
    return (
      <>
        {header}
        <EmptyState message="No income or expenses in either period yet." />
      </>
    );
  }
  if (data.loading || !data.totals) {
    return (
      <>
        {header}
        <EmptyState message="Loading..." />
      </>
    );
  }
  if (!data.currentHasData && !data.previousHasData) {
    return (
      <>
        {header}
        <EmptyState message="No income or expenses in either period yet." />
      </>
    );
  }

  const { totals } = data;
  const rate = (value: number | null) =>
    value == null ? '—' : formatPercent(value, 1);

  return (
    <>
      {header}

      {/* Data in only one of the two periods: everything below still
          renders (the other side reads as zero / "New"), with a line
          saying why so it doesn't look like a broken comparison. */}
      {!data.previousHasData && (
        <Text style={[styles.oneSided, { color: colors.warning }]}>
          Nothing was recorded in {previous.shortLabel}, so every figure below
          is new.
        </Text>
      )}
      {!data.currentHasData && (
        <Text style={[styles.oneSided, { color: colors.warning }]}>
          Nothing has been recorded in {current.shortLabel} yet.
        </Text>
      )}

      <View style={styles.grid}>
        <ComparisonSummaryCard
          title="Income"
          delta={totals.income}
          currencyCode={currencyCode}
        />
        <ComparisonSummaryCard
          title="Expenses"
          delta={totals.expenses}
          currencyCode={currencyCode}
        />
        <ComparisonSummaryCard
          title="Net"
          delta={totals.net}
          currencyCode={currencyCode}
        />
        <ComparisonSummaryCard
          title="Avg daily spend"
          delta={totals.avgDailySpend}
          currencyCode={currencyCode}
          decimals={0}
        />
      </View>
      <Text style={[styles.savingsRate, { color: colors.textSecondary }]}>
        Savings rate {rate(totals.savingsRate.current)} (was{' '}
        {rate(totals.savingsRate.previous)}) · averages over {current.dayCount}{' '}
        vs {previous.dayCount} days
      </Text>

      <Text
        style={[
          typography.eyebrow,
          styles.sectionLabel,
          { color: colors.textSecondary },
        ]}
      >
        Income, Expenses & Net
      </Text>
      <ComparisonBarChart
        groups={[
          {
            label: 'Income',
            current: totals.income.current,
            previous: totals.income.previous,
          },
          {
            label: 'Expenses',
            current: totals.expenses.current,
            previous: totals.expenses.previous,
          },
          {
            label: 'Net',
            current: totals.net.current,
            previous: totals.net.previous,
          },
        ]}
        currentLabel={current.shortLabel}
        previousLabel={previous.shortLabel}
      />

      <Text
        style={[
          typography.eyebrow,
          styles.sectionLabel,
          { color: colors.textSecondary },
        ]}
      >
        Spending by Category
      </Text>
      {chartCategories.length === 0 ? (
        <Card colors={colors} style={styles.card}>
          <Text style={{ color: colors.textSecondary }}>
            No spending in either period.
          </Text>
        </Card>
      ) : (
        <CategoryComparisonChart
          rows={chartCategories}
          currencyCode={currencyCode}
          currentLabel={current.shortLabel}
          previousLabel={previous.shortLabel}
        />
      )}

      <CategoryChangeList
        title="Biggest increases"
        rows={increases}
        currencyCode={currencyCode}
        emptyMessage="No category's spending went up."
      />
      <CategoryChangeList
        title="Biggest decreases"
        rows={decreases}
        currencyCode={currencyCode}
        emptyMessage="No category's spending went down."
      />

      <Text
        style={[
          typography.eyebrow,
          styles.sectionLabel,
          { color: colors.textSecondary },
        ]}
      >
        Spending by Account Type
      </Text>
      {data.accountTypes.length === 0 ? (
        <Text style={{ color: colors.textSecondary }}>
          No spending in either period.
        </Text>
      ) : (
        data.accountTypes.map(row => (
          <AmountListRow
            key={row.key}
            label={row.label}
            primaryText={formatAmount(row.current, currencyCode)}
            primaryColor={colors.text}
            secondaryText={`was ${formatAmount(row.previous, currencyCode, {
              decimals: 0,
            })} (${formatPercentChange(row.percent)})`}
            secondaryColor={colors.textSecondary}
          />
        ))
      )}
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    marginTop: 16,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: scaleFont(17),
    fontWeight: '700',
  },
  headerDates: {
    fontSize: scaleFont(13),
    marginTop: 2,
  },
  note: {
    fontSize: scaleFont(12),
    fontStyle: 'italic',
    marginTop: 6,
  },
  oneSided: {
    fontSize: scaleFont(13),
    fontWeight: '600',
    marginBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  savingsRate: {
    fontSize: scaleFont(12),
    marginTop: 10,
  },
  sectionLabel: {
    marginTop: 22,
    marginBottom: 10,
  },
  card: {
    padding: 16,
  },
});

export default ReportComparison;
