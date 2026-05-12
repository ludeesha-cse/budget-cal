import React, { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts';
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
import {
  buildAccountTypeBarData,
  buildCategoryPieSlices,
  buildTrendChartData,
} from '../utils/chartHelpers';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../contexts/ThemeContext';

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

// Short 3-letter form of the same month names used above, for chart axis
// labels where formatMonthLabel's "August 2026" would be far too wide —
// sliced from the same MONTH_NAMES array rather than a second hardcoded
// list, so the two labelings can never drift out of sync.
function formatMonthAxisLabel(month: string): string {
  const [, monthNumber] = month.split('-').map(Number);
  return MONTH_NAMES[monthNumber - 1].slice(0, 3);
}

// Defined at module scope (not inline in ReportsScreen's JSX) so it isn't
// recreated as a new component type on every render — react-hooks/eslint
// flags inline component definitions passed to centerLabelComponent
// since gifted-charts would otherwise remount this subtree every time
// ReportsScreen re-renders.
function PieCenterLabel({
  totalLabel,
  colors,
}: {
  totalLabel: string;
  colors: ThemeColors;
}): React.JSX.Element {
  return (
    <View style={styles.pieCenter}>
      <Text
        style={[styles.pieCenterValue, { color: colors.text }]}
        numberOfLines={1}>
        {totalLabel}
      </Text>
      <Text style={[styles.pieCenterLabel, { color: colors.textSecondary }]}>
        Total
      </Text>
    </View>
  );
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

  // Fixed chart width derived from the window rather than letting each
  // chart component size itself — gifted-charts' own auto-sizing behaves
  // inconsistently between iOS and Android, so pinning an explicit width
  // (window width minus the screen's 16+16 horizontal padding) keeps
  // layout predictable on both platforms.
  const windowWidth = useWindowDimensions().width;
  const chartWidth = Math.max(240, windowWidth - 32);

  // All three chart-data builders are pure (see utils/chartHelpers.ts) and
  // never touch the Stage 16a aggregate query results themselves — they
  // only reshape the already-verified rows for the chart library.
  const pieSlices = useMemo(
    () => buildCategoryPieSlices(categoryBreakdown, colors),
    [categoryBreakdown, colors],
  );
  const accountTypeBars = useMemo(
    () => buildAccountTypeBarData(accountTypeBreakdown, colors),
    [accountTypeBreakdown, colors],
  );
  const trendChartData = useMemo(
    () => buildTrendChartData(trend, formatMonthAxisLabel),
    [trend],
  );

  // Stable function reference (not an inline arrow defined in the JSX
  // below) so PieChart's centerLabelComponent slot never sees a "new
  // component type" from one render to the next.
  const renderPieCenterLabel = useCallback(
    () => (
      <PieCenterLabel
        totalLabel={formatAmount(summary?.totalExpenses ?? 0, selectedCurrencyCode)}
        colors={colors}
      />
    ),
    [summary, selectedCurrencyCode, colors],
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
            <>
              <View style={styles.chartWrap}>
                <PieChart
                  data={pieSlices}
                  donut
                  radius={Math.min(chartWidth, 260) / 2}
                  innerRadius={Math.min(chartWidth, 260) / 2 * 0.6}
                  innerCircleColor={colors.surface}
                  // No in-slice text and no onPress/focus config — the
                  // exact figures already live in the numeric list right
                  // below, and skipping the library's own label/touch
                  // handling avoids the iOS/Android rendering
                  // inconsistencies that feature is prone to. A pie with
                  // a single slice (e.g. Current Month with one category)
                  // still renders as a full circle with no special-casing
                  // needed here.
                  showText={false}
                  centerLabelComponent={renderPieCenterLabel}
                />
              </View>
              <View style={styles.legendRow}>
                {pieSlices.map(slice => (
                  <View key={slice.label} style={styles.legendItem}>
                    <View
                      style={[styles.legendSwatch, { backgroundColor: slice.color }]}
                    />
                    <Text
                      style={[styles.legendLabel, { color: colors.textSecondary }]}
                      numberOfLines={1}>
                      {slice.label}
                    </Text>
                  </View>
                ))}
              </View>
              {categoryBreakdown.map(row => (
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
              ))}
            </>
          )}

          <Text style={[styles.subtitle, { color: colors.text }]}>
            Spending by Account Type
          </Text>
          {accountTypeBreakdown.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              No expenses in this range.
            </Text>
          ) : (
            <>
              <View style={[styles.chartWrap, { width: chartWidth }]}>
                <BarChart
                  data={accountTypeBars}
                  horizontal
                  width={chartWidth - 90}
                  height={Math.max(90, accountTypeBars.length * 46)}
                  barWidth={22}
                  spacing={24}
                  barBorderRadius={4}
                  yAxisLabelWidth={80}
                  yAxisTextStyle={[styles.chartAxisLabel, { color: colors.textSecondary }]}
                  xAxisLabelTextStyle={[
                    styles.chartAxisLabelSmall,
                    { color: colors.textSecondary },
                  ]}
                  xAxisColor={colors.border}
                  yAxisColor={colors.border}
                  rulesColor={colors.border}
                  hideRules={false}
                  // No onPress supplied and touch-driven focus explicitly
                  // disabled — same reasoning as the pie chart above:
                  // fewer library-owned touch code paths means fewer
                  // places for iOS/Android to disagree. A single account
                  // type still renders as one readable bar with no
                  // special-casing needed.
                  disablePress
                  isAnimated={false}
                />
              </View>
              {accountTypeBreakdown.map(row => (
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
              ))}
            </>
          )}

          <Text style={[styles.subtitle, { color: colors.text }]}>
            Monthly Trend
          </Text>
          {trend.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              No trend data for this range.
            </Text>
          ) : trendChartData.length === 1 ? (
            // A one-point "trend" is a contradiction in terms — a line
            // chart would either render as a single dot or fail to draw
            // any line segment at all. Current Month always produces
            // exactly one month, so instead of a line chart this shows
            // the same two figures as a small two-bar comparison, which
            // is the sensible reading of "trend" when there's only one
            // period.
            <View style={styles.chartWrap}>
              <BarChart
                data={[
                  {
                    label: 'Income',
                    value: trendChartData[0].income,
                    frontColor: colors.success,
                  },
                  {
                    label: 'Expenses',
                    value: trendChartData[0].expenses,
                    frontColor: colors.danger,
                  },
                ]}
                width={chartWidth - 40}
                height={180}
                barWidth={48}
                spacing={40}
                barBorderRadius={4}
                yAxisTextStyle={[styles.chartAxisLabel, { color: colors.textSecondary }]}
                xAxisLabelTextStyle={[
                  styles.chartAxisLabel,
                  { color: colors.textSecondary },
                ]}
                xAxisColor={colors.border}
                yAxisColor={colors.border}
                rulesColor={colors.border}
                disablePress
                isAnimated={false}
              />
            </View>
          ) : (
            <View style={styles.chartWrap}>
              <LineChart
                data={trendChartData.map(point => ({ value: point.income }))}
                data2={trendChartData.map(point => ({ value: point.expenses }))}
                xAxisLabelTexts={trendChartData.map(point => point.label)}
                width={chartWidth - 40}
                height={200}
                color1={colors.success}
                color2={colors.danger}
                dataPointsColor1={colors.success}
                dataPointsColor2={colors.danger}
                thickness1={2}
                thickness2={2}
                yAxisTextStyle={[styles.chartAxisLabel, { color: colors.textSecondary }]}
                xAxisLabelTextStyle={[
                  styles.chartAxisLabelSmall,
                  { color: colors.textSecondary },
                ]}
                xAxisColor={colors.border}
                yAxisColor={colors.border}
                rulesColor={colors.border}
                initialSpacing={16}
                endSpacing={16}
                spacing={Math.max(
                  36,
                  (chartWidth - 80) / Math.max(1, trendChartData.length - 1),
                )}
                // Deliberately no pointerConfig/onPress/focusEnabled —
                // same touch-avoidance reasoning as the other two charts.
                // Every month in range is zero-filled by getMonthlyTrend
                // (Stage 16a), so a month with no activity still draws as
                // a real point at zero rather than a gap in the line.
              />
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View
                    style={[styles.legendSwatch, { backgroundColor: colors.success }]}
                  />
                  <Text style={[styles.legendLabel, { color: colors.textSecondary }]}>
                    Income
                  </Text>
                </View>
                <View style={styles.legendItem}>
                  <View
                    style={[styles.legendSwatch, { backgroundColor: colors.danger }]}
                  />
                  <Text style={[styles.legendLabel, { color: colors.textSecondary }]}>
                    Expenses
                  </Text>
                </View>
              </View>
            </View>
          )}
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
  chartWrap: {
    alignItems: 'center',
    marginTop: 8,
  },
  pieCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pieCenterValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  pieCenterLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 140,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendLabel: {
    fontSize: 12,
  },
  chartAxisLabel: {
    fontSize: 12,
  },
  chartAxisLabelSmall: {
    fontSize: 11,
  },
});

export default ReportsScreen;
