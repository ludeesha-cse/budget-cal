import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import ScreenBackground from '../components/ScreenBackground';
import EmptyState from '../components/common/EmptyState';
import SegmentedToggle from '../components/common/SegmentedToggle';
import CurrencyTabs from '../components/common/CurrencyTabs';
import DateField from '../components/common/DateField';
import MonthYearPicker from '../components/MonthYearPicker';
import ReportOverview from '../components/reports/ReportOverview';
import ReportComparison from '../components/reports/ReportComparison';
import { useReportData } from '../hooks/useReportData';
import type { ReportPeriod } from '../utils/dateUtils';
import {
  countDaysInclusive,
  formatDateRangeLabel,
  formatRangeHeader,
  getPreviousPeriod,
  lastNDaysRange,
  resolveReportPeriod,
  validateCustomRange,
} from '../utils/dateUtils';
import { getCurrentDateString } from '../utils/date';
import { labelForId } from '../utils/pickerLabels';
import { fieldErrorStyle } from '../utils/formFieldStyle';
import { useTheme } from '../contexts/ThemeContext';
import { typography, scaleFont } from '../theme/typography';
import { SCREEN_BOTTOM_CLEARANCE } from '../theme/layout';
import { useContentWidth } from '../hooks/useContentWidth';

type ReportTab = 'overview' | 'compare';
type PeriodKind = ReportPeriod['kind'];

const TAB_OPTIONS: { key: ReportTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'compare', label: 'Compare' },
];

const PERIOD_OPTIONS: { key: PeriodKind; label: string }[] = [
  { key: 'month', label: 'Month' },
  { key: 'last3Months', label: '3 Months' },
  { key: 'lastYear', label: 'Year' },
  { key: 'custom', label: 'Custom' },
];

const QUICK_RANGES = [7, 30, 90];

// "1 Aug 2026"
function formatDay(date: string): string {
  return formatDateRangeLabel(date, date);
}

// A custom-range date button: "Start" over "1 Aug 2026", outlined in
// danger when the range is invalid (same highlight as every form field).
function DateTrigger({
  caption,
  date,
  invalid,
  onPress,
}: {
  caption: string;
  date: string;
  invalid: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Pressable
      style={[
        styles.dateButton,
        { backgroundColor: colors.surface, borderColor: colors.border },
        fieldErrorStyle(colors, invalid),
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${caption} date: ${formatDay(date)}`}
    >
      <Text style={[styles.dateCaption, { color: colors.textSecondary }]}>
        {caption}
      </Text>
      <Text style={[styles.dateValue, { color: colors.text }]}>
        {formatDay(date)}
      </Text>
    </Pressable>
  );
}

function ReportsScreen(): React.JSX.Element {
  const { colors } = useTheme();
  // Resolved once per mount, same as useReportData's own `today`.
  const today = useMemo(() => getCurrentDateString(), []);

  const [tab, setTab] = useState<ReportTab>('overview');
  const [includeExcluded, setIncludeExcluded] = useState(false);
  const [periodKind, setPeriodKind] = useState<PeriodKind>('month');
  const [pickerYear, setPickerYear] = useState(today.slice(0, 4));
  const [pickerMonth, setPickerMonth] = useState(today.slice(5, 7));

  // Custom range: the two fields as typed, and the last valid pair —
  // which is what the report shows. An invalid pair highlights the
  // fields but leaves the report on the last range that made sense.
  const defaultCustom = useMemo(() => lastNDaysRange(30, today), [today]);
  const [customStart, setCustomStart] = useState(defaultCustom.startDate);
  const [customEnd, setCustomEnd] = useState(defaultCustom.endDate);
  const [appliedCustom, setAppliedCustom] = useState(defaultCustom);
  const validation = validateCustomRange(customStart, customEnd, today);

  const setCustomRange = (startDate: string, endDate: string) => {
    setCustomStart(startDate);
    setCustomEnd(endDate);
    if (validateCustomRange(startDate, endDate, today).message == null) {
      setAppliedCustom({ startDate, endDate });
    }
  };

  const period = useMemo<ReportPeriod>(() => {
    switch (periodKind) {
      case 'month':
        return { kind: 'month', month: `${pickerYear}-${pickerMonth}` };
      case 'custom':
        return { kind: 'custom', ...appliedCustom };
      default:
        return { kind: periodKind };
    }
  }, [periodKind, pickerYear, pickerMonth, appliedCustom]);

  // Pure, so cheap to work out here as well as inside useReportData —
  // the screen needs the previous period before the hook runs, to let a
  // currency with activity only in that period be picked on Compare.
  const comparisonPeriods = useMemo(
    () => getPreviousPeriod(resolveReportPeriod(period, today), today),
    [period, today],
  );

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
  } = useReportData(
    period,
    includeExcluded,
    tab === 'compare' ? comparisonPeriods.previous : null,
  );

  const selectedCurrencyCode = labelForId(
    currencies,
    currencyId,
    'code',
    'Select currency',
  );
  const currencyCode =
    selectedCurrencyCode !== 'Select currency' ? selectedCurrencyCode : '';
  // The screen's column width, not the window's — on a tablet or in
  // landscape the column is capped (see hooks/useContentWidth.ts) and a
  // window-wide chart would run past its card.
  const contentWidth = useContentWidth().width;
  const chartWidth = Math.max(240, contentWidth - 32);

  return (
    <ScreenBackground colors={colors} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
      >
        <View style={styles.header}>
          <Text
            style={[
              typography.eyebrow,
              styles.eyebrow,
              { color: colors.primary },
            ]}
          >
            Statistics
          </Text>
          <Text style={[typography.screenTitle, { color: colors.text }]}>
            Reports
          </Text>
        </View>

        <SegmentedToggle options={TAB_OPTIONS} value={tab} onChange={setTab} />

        <SegmentedToggle
          options={PERIOD_OPTIONS}
          value={periodKind}
          onChange={setPeriodKind}
          style={styles.periodToggle}
        />

        {periodKind === 'month' && (
          <MonthYearPicker
            month={pickerMonth}
            year={pickerYear}
            onMonthChange={setPickerMonth}
            onYearChange={setPickerYear}
            disableFutureMonths
            style={styles.periodControl}
          />
        )}

        {periodKind === 'custom' && (
          <View style={styles.periodControl}>
            <View style={styles.dateRow}>
              <View style={styles.dateField}>
                <DateField
                  value={customStart}
                  onChange={date => setCustomRange(date, customEnd)}
                  maxDate={today}
                  renderTrigger={(label, onPress) => (
                    <DateTrigger
                      caption="Start"
                      date={label}
                      invalid={validation.startInvalid}
                      onPress={onPress}
                    />
                  )}
                />
              </View>
              <View style={styles.dateField}>
                <DateField
                  value={customEnd}
                  onChange={date => setCustomRange(customStart, date)}
                  maxDate={today}
                  renderTrigger={(label, onPress) => (
                    <DateTrigger
                      caption="End"
                      date={label}
                      invalid={validation.endInvalid}
                      onPress={onPress}
                    />
                  )}
                />
              </View>
            </View>
            {validation.message ? (
              <Text style={[styles.customHint, { color: colors.danger }]}>
                {validation.message}
              </Text>
            ) : (
              <Text
                style={[styles.customHint, { color: colors.textSecondary }]}
              >
                {countDaysInclusive(customStart, customEnd) === 1
                  ? '1 day'
                  : `${countDaysInclusive(customStart, customEnd)} days`}
              </Text>
            )}
            <View style={styles.quickRow}>
              {QUICK_RANGES.map(days => {
                const quick = lastNDaysRange(days, today);
                const active =
                  quick.startDate === customStart &&
                  quick.endDate === customEnd;
                return (
                  <Pressable
                    key={days}
                    hitSlop={4}
                    style={[
                      styles.quickChip,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                      active && {
                        backgroundColor: colors.primary,
                        borderColor: colors.primary,
                      },
                    ]}
                    onPress={() =>
                      setCustomRange(quick.startDate, quick.endDate)
                    }
                  >
                    <Text
                      style={[
                        styles.quickChipText,
                        { color: active ? colors.primaryText : colors.text },
                      ]}
                    >
                      Last {days} days
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <Text
          style={[
            typography.amountMono,
            styles.rangeLabel,
            { color: colors.textSecondary },
          ]}
        >
          {formatRangeHeader(range)}
          {currencyCode ? ` · ${currencyCode}` : ''}
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

        {tab === 'compare' ? (
          loading ? (
            <EmptyState message="Loading..." />
          ) : (
            <ReportComparison
              periods={comparisonPeriods}
              currencyId={currencyId}
              currencyCode={currencyCode}
              includeExcluded={includeExcluded}
            />
          )
        ) : loading ? (
          <EmptyState message="Loading..." />
        ) : currencyId == null || !summary ? (
          <EmptyState message="No transactions in this range yet." />
        ) : (
          <ReportOverview
            summary={summary}
            categoryBreakdown={categoryBreakdown}
            accountTypeBreakdown={accountTypeBreakdown}
            trend={trend}
            range={range}
            currencyCode={currencyCode}
            chartWidth={chartWidth}
          />
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
    paddingBottom: SCREEN_BOTTOM_CLEARANCE,
  },
  header: {
    marginBottom: 16,
  },
  eyebrow: {
    marginBottom: 4,
  },
  periodToggle: {
    marginTop: 10,
  },
  periodControl: {
    marginTop: 12,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dateField: {
    flex: 1,
  },
  dateButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
  },
  dateCaption: {
    fontSize: scaleFont(11),
    fontWeight: '600',
  },
  dateValue: {
    fontSize: scaleFont(15),
    fontWeight: '700',
    marginTop: 2,
  },
  customHint: {
    fontSize: scaleFont(13),
    marginTop: 8,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  quickChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 14,
    minHeight: 40,
    justifyContent: 'center',
  },
  quickChipText: {
    fontSize: scaleFont(13),
    fontWeight: '600',
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
});

export default ReportsScreen;
