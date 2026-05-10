import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import CollapsiblePicker from '../components/CollapsiblePicker';
import {
  getCurrencies,
  getDefaultCurrency,
  getMonthlyTrend,
  getReportSummary,
  getSpendingByAccountType,
  getSpendingByCategory,
} from '../db/queries';
import { getReportRange, ReportRangePreset } from '../utils/dateUtils';
import { getCurrentDateString } from '../utils/date';
import { formatAmount } from '../utils/formatAmount';
import { useTheme } from '../contexts/ThemeContext';

type CurrencyRow = Awaited<ReturnType<typeof getCurrencies>>[number];
type ReportSummaryResult = Awaited<ReturnType<typeof getReportSummary>>;
type CategoryRow = Awaited<ReturnType<typeof getSpendingByCategory>>[number];
type AccountTypeRow = Awaited<
  ReturnType<typeof getSpendingByAccountType>
>[number];
type TrendRow = Awaited<ReturnType<typeof getMonthlyTrend>>[number];

const PRESET_OPTIONS: { key: ReportRangePreset; label: string }[] = [
  { key: 'currentMonth', label: 'Current Month' },
  { key: 'last3Months', label: 'Last 3 Months' },
  { key: 'lastYear', label: 'Last Year' },
];

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// Hardcoded month names rather than Intl/toLocaleString — same reasoning
// as utils/formatAmount.ts: this only ever needs a fixed English label,
// never actual locale-aware formatting, so there's nothing to gain from
// depending on Hermes' locale-data being complete on every device.
function formatMonthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${MONTH_NAMES[monthNumber - 1]} ${year}`;
}

function formatRangeLabel(months: string[]): string {
  if (months.length === 0) {
    return '';
  }
  if (months.length === 1) {
    return formatMonthLabel(months[0]);
  }
  return `${formatMonthLabel(months[0])} – ${formatMonthLabel(months[months.length - 1])}`;
}

function ReportsScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const [preset, setPreset] = useState<ReportRangePreset>('currentMonth');
  const [includeExcluded, setIncludeExcluded] = useState(false);
  const [currencies, setCurrencies] = useState<CurrencyRow[]>([]);
  // Only currencies with at least one matching transaction in the
  // current range + includeExcluded state — recomputed every load(), so
  // toggling "include excluded" can change which currencies are even
  // offered (a currency whose only activity is excluded transactions
  // only shows up once the toggle is on).
  const [availableCurrencyIds, setAvailableCurrencyIds] = useState<number[]>(
    [],
  );
  const [currencyId, setCurrencyId] = useState<number | null>(null);
  const [summary, setSummary] = useState<ReportSummaryResult | null>(null);
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryRow[]>(
    [],
  );
  const [accountTypeBreakdown, setAccountTypeBreakdown] = useState<
    AccountTypeRow[]
  >([]);
  const [trend, setTrend] = useState<TrendRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Computed once per mount — a report screen isn't expected to stay open
  // across a real midnight rollover in a way that matters here.
  const today = useMemo(() => getCurrentDateString(), []);
  const range = useMemo(() => getReportRange(preset, today), [preset, today]);

  const load = useCallback(async () => {
    setLoading(true);
    const [allCurrencies, defaultCurrency] = await Promise.all([
      getCurrencies(),
      getDefaultCurrency(),
    ]);
    setCurrencies(allCurrencies);

    // One summary per currency just to test "does this currency have any
    // activity in this range" — cheap at this app's scale (a handful of
    // currencies for a personal tracker), and reuses the exact same
    // query the summary section itself calls, so "has activity" can
    // never disagree with what the summary would actually show.
    const summaries = await Promise.all(
      allCurrencies.map(currency =>
        getReportSummary(
          range.startDate,
          range.endDate,
          currency.id,
          includeExcluded,
        ),
      ),
    );
    const available = allCurrencies.filter(
      (_, index) =>
        summaries[index].totalExpenses > 0 || summaries[index].totalIncome > 0,
    );
    setAvailableCurrencyIds(available.map(currency => currency.id));

    const resolvedCurrencyId =
      currencyId != null && available.some(c => c.id === currencyId)
        ? currencyId
        : defaultCurrency && available.some(c => c.id === defaultCurrency.id)
          ? defaultCurrency.id
          : (available[0]?.id ?? null);
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

    const [summaryResult, categoryResult, accountTypeResult, trendResult] =
      await Promise.all([
        getReportSummary(
          range.startDate,
          range.endDate,
          resolvedCurrencyId,
          includeExcluded,
        ),
        getSpendingByCategory(
          range.startDate,
          range.endDate,
          resolvedCurrencyId,
          includeExcluded,
        ),
        getSpendingByAccountType(
          range.startDate,
          range.endDate,
          resolvedCurrencyId,
          includeExcluded,
        ),
        getMonthlyTrend(range.months, resolvedCurrencyId, includeExcluded),
      ]);
    setSummary(summaryResult);
    setCategoryBreakdown(categoryResult);
    setAccountTypeBreakdown(accountTypeResult);
    setTrend(trendResult);
    setLoading(false);
  }, [range, includeExcluded, currencyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const selectedCurrencyCode =
    currencies.find(c => c.id === currencyId)?.code ?? 'Select currency';
  const availableCurrencies = currencies.filter(c =>
    availableCurrencyIds.includes(c.id),
  );

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.container}>
      <Text style={[styles.title, { color: colors.text }]}>Reports</Text>

      <View style={styles.toggleRow}>
        {PRESET_OPTIONS.map(option => (
          <Pressable
            key={option.key}
            style={[
              styles.toggleButton,
              { backgroundColor: colors.surface, borderColor: colors.primary },
              preset === option.key && { backgroundColor: colors.primary },
            ]}
            onPress={() => setPreset(option.key)}>
            <Text
              style={[
                styles.toggleButtonText,
                { color: colors.primary },
                preset === option.key && { color: colors.primaryText },
              ]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.rangeLabel, { color: colors.textSecondary }]}>
        {formatRangeLabel(range.months)}
      </Text>

      {availableCurrencies.length > 0 && (
        <>
          <Text style={[styles.label, { color: colors.text }]}>Currency</Text>
          <CollapsiblePicker
            displayLabel={selectedCurrencyCode}
            selectedValue={currencyId != null ? String(currencyId) : ''}
            onValueChange={value => setCurrencyId(Number(value))}
            items={availableCurrencies.map(c => ({
              label: `${c.code} — ${c.name}`,
              value: String(c.id),
            }))}
          />
        </>
      )}

      <Pressable
        style={styles.checkboxRow}
        onPress={() => setIncludeExcluded(current => !current)}>
        <View
          style={[
            styles.checkboxBox,
            { borderColor: colors.primary },
            includeExcluded && { backgroundColor: colors.primary },
          ]}>
          {includeExcluded && (
            <Text style={[styles.checkboxMark, { color: colors.primaryText }]}>
              ✓
            </Text>
          )}
        </View>
        <Text style={[styles.checkboxLabel, { color: colors.text }]}>
          Include excluded transactions
        </Text>
      </Pressable>

      {loading ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>
          Loading...
        </Text>
      ) : currencyId == null || !summary ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>
          No transactions in this range yet.
        </Text>
      ) : (
        <>
          <Text style={[styles.subtitle, { color: colors.text }]}>
            Summary
          </Text>
          <View
            style={[
              styles.card,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}>
            <Text style={[styles.row, { color: colors.success }]}>
              Total income: {formatAmount(summary.totalIncome, selectedCurrencyCode)}
            </Text>
            <Text style={[styles.row, { color: colors.danger }]}>
              Total expenses:{' '}
              {formatAmount(summary.totalExpenses, selectedCurrencyCode)}
            </Text>
            <Text
              style={[
                styles.rowNet,
                { color: summary.net >= 0 ? colors.success : colors.danger },
              ]}>
              Net: {formatAmount(summary.net, selectedCurrencyCode)}
            </Text>
          </View>

          <Text style={[styles.subtitle, { color: colors.text }]}>
            Spending by Category
          </Text>
          {categoryBreakdown.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              No expenses in this range.
            </Text>
          ) : (
            categoryBreakdown.map(row => (
              <View
                key={row.categoryId ?? 'uncategorized'}
                style={[styles.listRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.listRowName, { color: colors.text }]}>
                  {row.categoryName}
                </Text>
                <View style={styles.listRowValues}>
                  <Text style={{ color: colors.text }}>
                    {formatAmount(row.total, selectedCurrencyCode)}
                  </Text>
                  <Text style={{ color: colors.textSecondary }}>
                    {row.percentage.toFixed(1)}%
                  </Text>
                </View>
              </View>
            ))
          )}

          <Text style={[styles.subtitle, { color: colors.text }]}>
            Spending by Account Type
          </Text>
          {accountTypeBreakdown.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              No expenses in this range.
            </Text>
          ) : (
            accountTypeBreakdown.map(row => (
              <View
                key={row.accountType}
                style={[styles.listRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.listRowName, { color: colors.text }]}>
                  {row.accountType}
                </Text>
                <Text style={{ color: colors.text }}>
                  {formatAmount(row.total, selectedCurrencyCode)}
                </Text>
              </View>
            ))
          )}

          <Text style={[styles.subtitle, { color: colors.text }]}>
            Monthly Trend
          </Text>
          {trend.map(row => (
            <View
              key={row.month}
              style={[styles.listRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.listRowName, { color: colors.text }]}>
                {formatMonthLabel(row.month)}
              </Text>
              <View style={styles.listRowValues}>
                <Text style={{ color: colors.success }}>
                  +{formatAmount(row.totalIncome, selectedCurrencyCode)}
                </Text>
                <Text style={{ color: colors.danger }}>
                  -{formatAmount(row.totalExpenses, selectedCurrencyCode)}
                </Text>
              </View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleButton: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  toggleButtonText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  rangeLabel: {
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 10,
    marginBottom: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 10,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxMark: {
    fontSize: 14,
    fontWeight: '700',
  },
  checkboxLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  empty: {
    fontSize: 14,
    marginTop: 12,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 8,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 12,
  },
  row: {
    fontSize: 15,
    marginBottom: 6,
  },
  rowNet: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listRowName: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  listRowValues: {
    alignItems: 'flex-end',
    gap: 2,
  },
});

export default ReportsScreen;
