import React, { useCallback, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import ScreenBackground from '../components/ScreenBackground';
import Card from '../components/Card';
import CollapsiblePicker from '../components/CollapsiblePicker';
import EmptyState from '../components/common/EmptyState';
import SegmentedToggle from '../components/common/SegmentedToggle';
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
  buildCategoryPieSlices,
  buildTrendChartData,
} from '../utils/chartHelpers';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../contexts/ThemeContext';
import { typography, scaleFont } from '../theme/typography';

type CurrencyRow = Awaited<ReturnType<typeof getCurrencies>>[number];
type ReportSummaryResult = Awaited<ReturnType<typeof getReportSummary>>;
type CategoryRow = Awaited<ReturnType<typeof getSpendingByCategory>>[number];
type AccountTypeRow = Awaited<
  ReturnType<typeof getSpendingByAccountType>
>[number];
type TrendRow = Awaited<ReturnType<typeof getMonthlyTrend>>[number];

const PRESET_OPTIONS: { key: ReportRangePreset; label: string }[] = [
  { key: 'currentMonth', label: 'Month' },
  { key: 'last3Months', label: '3 Months' },
  { key: 'lastYear', label: 'Year' },
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

// "1 – 31 August 2026" for a single-month range, or falls back to
// "August 2026 – October 2026" for a multi-month one — day-level
// granularity only reads as meaningful within one calendar month.
function formatRangeHeader(range: { startDate: string; endDate: string; months: string[] }): string {
  if (range.months.length === 1) {
    const [, monthNumber, endDay] = range.endDate.split('-').map(Number);
    const startDay = Number(range.startDate.split('-')[2]);
    const year = Number(range.startDate.split('-')[0]);
    return `${startDay} – ${endDay} ${MONTH_NAMES[monthNumber - 1]} ${year}`;
  }
  return `${formatMonthLabel(range.months[0])} – ${formatMonthLabel(range.months[range.months.length - 1])}`;
}

// Short 3-letter form of the same month names used above, for chart axis
// labels where formatMonthLabel's "August 2026" would be far too wide —
// sliced from the same MONTH_NAMES array rather than a second hardcoded
// list, so the two labelings can never drift out of sync.
function formatMonthAxisLabel(month: string): string {
  const [, monthNumber] = month.split('-').map(Number);
  return MONTH_NAMES[monthNumber - 1].slice(0, 3);
}

// "45.0K" / "1.2M" — the summary card's big figures follow the mockup's
// compact style rather than a full formatAmount() figure, since three of
// these need to sit side by side without wrapping.
function formatAbbreviated(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1000) {
    return `${sign}${(abs / 1000).toFixed(1)}K`;
  }
  return `${sign}${abs.toFixed(0)}`;
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
  // Denominator for each account type's proportional bar width below — at
  // least 1 so a lone $0 row can't divide by zero, though `.length === 0`
  // already short-circuits before this is ever read in that case.
  const maxAccountTypeTotal = useMemo(
    () => Math.max(1, ...accountTypeBreakdown.map(row => row.total)),
    [accountTypeBreakdown],
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

  const pieRadius = Math.min(chartWidth * 0.32, 70);

  return (
    // Reports' own Tab.Screen now sets headerShown:false (see App.tsx) so
    // this screen's custom "Statistics/Reports" header — previously
    // stacked underneath React Navigation's own default native header,
    // since nothing had opted this tab out of it — is the only header, and
    // needs its own top safe-area inset the native header used to provide
    // for free. ScreenBackground (not a plain SafeAreaView) so a gradient
    // palette like Platinum paints its sweep behind this content.
    <ScreenBackground colors={colors} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text
          style={[typography.eyebrow, styles.eyebrow, { color: colors.primary }]}>
          Statistics
        </Text>
        <Text style={[typography.screenTitle, { color: colors.text }]}>
          Reports
        </Text>
      </View>

      <SegmentedToggle options={PRESET_OPTIONS} value={preset} onChange={setPreset} />

      <Text
        style={[
          typography.amountMono,
          styles.rangeLabel,
          { color: colors.textSecondary },
        ]}>
        {formatRangeHeader(range)}
        {selectedCurrencyCode !== 'Select currency' ? ` · ${selectedCurrencyCode}` : ''}
      </Text>

      {availableCurrencies.length > 1 && (
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
          <Card colors={colors} style={[styles.card, styles.summaryCard]}>
            <View style={styles.summaryColumn}>
              <Text
                style={[
                  typography.eyebrow,
                  styles.summaryLabel,
                  { color: colors.textSecondary },
                ]}>
                Income
              </Text>
              <Text
                style={[
                  typography.amountMono,
                  styles.summaryValue,
                  { color: colors.success },
                ]}>
                {formatAbbreviated(summary.totalIncome)}
              </Text>
            </View>
            <View style={styles.summaryColumn}>
              <Text
                style={[
                  typography.eyebrow,
                  styles.summaryLabel,
                  { color: colors.textSecondary },
                ]}>
                Expense
              </Text>
              <Text
                style={[
                  typography.amountMono,
                  styles.summaryValue,
                  { color: colors.danger },
                ]}>
                {formatAbbreviated(summary.totalExpenses)}
              </Text>
            </View>
            <View style={styles.summaryColumn}>
              <Text
                style={[
                  typography.eyebrow,
                  styles.summaryLabel,
                  { color: colors.textSecondary },
                ]}>
                Net
              </Text>
              <Text
                style={[
                  typography.amountMono,
                  styles.summaryValue,
                  { color: colors.text },
                ]}>
                {formatAbbreviated(summary.net)}
              </Text>
            </View>
          </Card>

          <Text
            style={[
              typography.eyebrow,
              styles.sectionLabel,
              { color: colors.textSecondary },
            ]}>
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
              <Card colors={colors} style={[styles.card, styles.categoryCard]}>
                <PieChart
                  data={pieSlices}
                  donut
                  radius={pieRadius}
                  innerRadius={pieRadius * 0.6}
                  innerCircleColor={colors.surface}
                  // No in-slice text and no onPress/focus config — the
                  // exact figures already live in the legend right next
                  // to it, and skipping the library's own label/touch
                  // handling avoids the iOS/Android rendering
                  // inconsistencies that feature is prone to.
                  showText={false}
                  centerLabelComponent={renderPieCenterLabel}
                />
                <View style={styles.legendColumn}>
                  {pieSlices.map(slice => (
                    <View key={slice.label} style={styles.legendItem}>
                      <View
                        style={[
                          styles.legendSwatch,
                          { backgroundColor: slice.color },
                        ]}
                      />
                      <Text
                        style={[styles.legendLabel, { color: colors.text }]}
                        numberOfLines={1}>
                        {slice.label}
                      </Text>
                      <Text
                        style={[
                          typography.amountMono,
                          styles.legendPercent,
                          { color: colors.textSecondary },
                        ]}>
                        {(
                          (slice.value /
                            Math.max(
                              1,
                              pieSlices.reduce((sum, s) => sum + s.value, 0),
                            )) *
                          100
                        ).toFixed(0)}
                        %
                      </Text>
                    </View>
                  ))}
                </View>
              </Card>
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

          <Text
            style={[
              typography.eyebrow,
              styles.sectionLabel,
              { color: colors.textSecondary },
            ]}>
            Spending by Account Type
          </Text>
          {accountTypeBreakdown.length === 0 ? (
            <Card colors={colors} style={styles.card}>
              <Text style={{ color: colors.textSecondary }}>
                No expenses in this range.
              </Text>
            </Card>
          ) : (
            // gifted-charts' horizontal BarChart used to render here, but its
            // auto-computed x-axis scale (0, 251, 502, ...) routinely ran
            // wider than the card and got clipped/illegible — especially
            // with just one or two account types, which is the common case.
            // A plain proportional bar per row (same track/fill language as
            // the budget progress bars elsewhere on this screen and on
            // Dashboard) can't overflow, since its width is always a
            // percentage of the card, and reads just as clearly with a
            // single row as with five.
            <Card colors={colors} style={styles.card}>
              {accountTypeBreakdown.map((row, index) => (
                <View
                  key={row.accountType}
                  style={
                    index === accountTypeBreakdown.length - 1
                      ? styles.accountTypeRowLast
                      : styles.accountTypeRow
                  }>
                  <View style={styles.accountTypeHeaderRow}>
                    <Text style={[styles.listRowName, { color: colors.text }]}>
                      {row.accountType}
                    </Text>
                    <Text style={{ color: colors.text }}>
                      {formatAmount(row.total, selectedCurrencyCode)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.accountTypeTrack,
                      { backgroundColor: colors.border },
                    ]}>
                    <View
                      style={[
                        styles.accountTypeFill,
                        {
                          width: `${Math.max(
                            4,
                            (row.total / maxAccountTypeTotal) * 100,
                          )}%`,
                          backgroundColor: colors.primary,
                        },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </Card>
          )}

          <Text
            style={[
              typography.eyebrow,
              styles.sectionLabel,
              { color: colors.textSecondary },
            ]}>
            Monthly Trend
          </Text>
          <Card colors={colors} style={[styles.card, styles.trendCard]}>
            {trend.length === 0 ? (
              <Text style={{ color: colors.textSecondary }}>
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
                width={chartWidth - 72}
                height={160}
                barWidth={48}
                spacing={40}
                barBorderRadius={4}
                hideYAxisText
                yAxisColor="transparent"
                xAxisColor={colors.border}
                hideRules
                xAxisLabelTextStyle={[
                  styles.chartAxisLabel,
                  { color: colors.textSecondary },
                ]}
                disablePress
                isAnimated={false}
              />
            ) : (
              <BarChart
                data={trendChartData.flatMap(point => [
                  { value: point.income, frontColor: colors.success, spacing: 2, label: point.label },
                  { value: point.expenses, frontColor: colors.danger },
                ])}
                width={chartWidth - 72}
                height={160}
                barWidth={10}
                barBorderRadius={3}
                spacing={18}
                hideYAxisText
                yAxisColor="transparent"
                xAxisColor={colors.border}
                hideRules
                xAxisLabelTextStyle={[
                  styles.chartAxisLabelSmall,
                  { color: colors.textSecondary },
                ]}
                disablePress
                isAnimated={false}
              />
            )}
          </Card>
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
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
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
  label: {
    fontSize: scaleFont(14),
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
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
  // border/borderRadius/backgroundColor are NOT here — Card (see
  // components/Card.tsx) owns those so it can swap in a gradient fill for
  // palettes that define one. This only carries layout.
  card: {
    padding: 16,
  },
  summaryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryColumn: {
    alignItems: 'flex-start',
  },
  summaryLabel: {
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: scaleFont(20),
    fontWeight: '700',
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendColumn: {
    flex: 1,
    marginLeft: 16,
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendSwatch: {
    width: 9,
    height: 9,
    borderRadius: 2,
  },
  legendLabel: {
    fontSize: scaleFont(13),
    fontWeight: '600',
    flex: 1,
  },
  legendPercent: {
    fontSize: scaleFont(13),
  },
  trendCard: {
    alignItems: 'center',
  },
  row: {
    fontSize: scaleFont(15),
    marginBottom: 6,
  },
  rowNet: {
    fontSize: scaleFont(16),
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
    fontSize: scaleFont(15),
    fontWeight: '600',
    flex: 1,
  },
  listRowValues: {
    alignItems: 'flex-end',
    gap: 2,
  },
  accountTypeRow: {
    marginBottom: 16,
  },
  accountTypeRowLast: {
    marginBottom: 0,
  },
  accountTypeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  accountTypeTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  accountTypeFill: {
    height: '100%',
    borderRadius: 4,
  },
  pieCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pieCenterValue: {
    fontSize: scaleFont(13),
    fontWeight: '700',
  },
  pieCenterLabel: {
    fontSize: scaleFont(10),
    marginTop: 2,
  },
  chartAxisLabel: {
    fontSize: scaleFont(12),
  },
  chartAxisLabelSmall: {
    fontSize: scaleFont(10),
  },
});

export default ReportsScreen;
