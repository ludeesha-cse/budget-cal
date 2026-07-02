import React, { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import ScreenBackground from '../components/ScreenBackground';
import Card from '../components/Card';
import EmptyState from '../components/common/EmptyState';
import SegmentedToggle from '../components/common/SegmentedToggle';
import CurrencyTabs from '../components/common/CurrencyTabs';
import ReportSummaryCard from '../components/reports/ReportSummaryCard';
import CategoryPieCard from '../components/reports/CategoryPieCard';
import AmountListRow from '../components/reports/AmountListRow';
import AccountTypeBars from '../components/reports/AccountTypeBars';
import TrendChartCard from '../components/reports/TrendChartCard';
import { useReportData } from '../hooks/useReportData';
import type { ReportRangePreset } from '../utils/dateUtils';
import { formatMonthLabel, formatRangeHeader } from '../utils/dateUtils';
import { formatAmount, formatPercent } from '../utils/formatAmount';
import { labelForId } from '../utils/pickerLabels';
import { useTheme } from '../contexts/ThemeContext';
import { typography, scaleFont } from '../theme/typography';

const PRESET_OPTIONS: { key: ReportRangePreset; label: string }[] = [
  { key: 'currentMonth', label: 'Month' },
  { key: 'last3Months', label: '3 Months' },
  { key: 'lastYear', label: 'Year' },
];

function ReportsScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const [preset, setPreset] = useState<ReportRangePreset>('currentMonth');
  const [includeExcluded, setIncludeExcluded] = useState(false);

  const {
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
  } = useReportData(preset, includeExcluded);

  const selectedCurrencyCode = labelForId(currencies, currencyId, 'code', 'Select currency');
  const windowWidth = useWindowDimensions().width;
  const chartWidth = Math.max(240, windowWidth - 32);

  return (
    <ScreenBackground colors={colors} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={[typography.eyebrow, styles.eyebrow, { color: colors.primary }]}>
            Statistics
          </Text>
          <Text style={[typography.screenTitle, { color: colors.text }]}>Reports</Text>
        </View>

        <SegmentedToggle options={PRESET_OPTIONS} value={preset} onChange={setPreset} />

        <Text style={[typography.amountMono, styles.rangeLabel, { color: colors.textSecondary }]}>
          {formatRangeHeader(range)}
          {selectedCurrencyCode !== 'Select currency' ? ` · ${selectedCurrencyCode}` : ''}
        </Text>

        {availableCurrencies.length > 1 && (
          <CurrencyTabs
            currencies={availableCurrencies}
            value={currencyId}
            onChange={setCurrencyId}
            style={styles.currencyTabs}
          />
        )}

        <View style={styles.switchRow}>
          <Text style={[styles.switchLabel, { color: colors.text }]}>
            Include excluded transactions
          </Text>
          <Switch
            value={includeExcluded}
            onValueChange={setIncludeExcluded}
            trackColor={{ false: colors.border, true: colors.primarySoft }}
            thumbColor={includeExcluded ? colors.primary : colors.surface}
          />
        </View>

        {loading ? (
          <EmptyState message="Loading..." />
        ) : currencyId == null || !summary ? (
          <EmptyState message="No transactions in this range yet." />
        ) : (
          <>
            <ReportSummaryCard summary={summary} />

            <Text style={[typography.eyebrow, styles.sectionLabel, { color: colors.textSecondary }]}>
              Spending by Category
            </Text>
            {categoryBreakdown.length === 0 ? (
              <Card colors={colors} style={styles.card}>
                <Text style={{ color: colors.textSecondary }}>No expenses in this range.</Text>
              </Card>
            ) : (
              <>
                <CategoryPieCard
                  categoryBreakdown={categoryBreakdown}
                  chartWidth={chartWidth}
                  totalExpenses={summary.totalExpenses}
                  currencyCode={selectedCurrencyCode}
                />
                {categoryBreakdown.map(row => (
                  <AmountListRow
                    key={row.categoryId ?? 'uncategorized'}
                    label={row.categoryName}
                    primaryText={formatAmount(row.total, selectedCurrencyCode)}
                    primaryColor={colors.text}
                    secondaryText={formatPercent(row.percentage, 1)}
                    secondaryColor={colors.textSecondary}
                  />
                ))}
              </>
            )}

            <Text style={[typography.eyebrow, styles.sectionLabel, { color: colors.textSecondary }]}>
              Spending by Account Type
            </Text>
            <AccountTypeBars
              accountTypeBreakdown={accountTypeBreakdown}
              currencyCode={selectedCurrencyCode}
            />

            <Text style={[typography.eyebrow, styles.sectionLabel, { color: colors.textSecondary }]}>
              Monthly Trend
            </Text>
            <TrendChartCard trend={trend} chartWidth={chartWidth} />
            {trend.map(row => (
              <AmountListRow
                key={row.month}
                label={formatMonthLabel(row.month)}
                primaryText={`+${formatAmount(row.totalIncome, selectedCurrencyCode)}`}
                primaryColor={colors.success}
                secondaryText={`-${formatAmount(row.totalExpenses, selectedCurrencyCode)}`}
                secondaryColor={colors.danger}
              />
            ))}
          </>
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    padding: 16,
    // Clears the floating tab bar pill + FAB (see App.tsx) — same value
    // as DashboardScreen's own container for the same reason.
    paddingBottom: 120,
  },
  header: {
    marginBottom: 16,
  },
  eyebrow: {
    marginBottom: 4,
  },
  rangeLabel: {
    fontSize: scaleFont(13),
    marginTop: 12,
    marginBottom: 4,
  },
  currencyTabs: {
    marginTop: 10,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
  switchLabel: {
    fontSize: scaleFont(15),
    fontWeight: '600',
    flexShrink: 1,
    marginRight: 12,
  },
  sectionLabel: {
    marginTop: 22,
    marginBottom: 10,
  },
  card: {
    padding: 16,
  },
});

export default ReportsScreen;
