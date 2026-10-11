import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import Card from '../Card';
import ChartLegend from './ChartLegend';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';
import {
  TREND_INNER_GAP,
  buildTrendChartData,
  computeTrendBarLayout,
  trendMaxValue,
} from '../../utils/chartHelpers';
import { formatMonthAxisLabel } from '../../utils/dateUtils';
import { formatAmount } from '../../utils/formatAmount';
import type { ReportTrendRow } from '../../hooks/useReportData';

type Props = {
  trend: ReportTrendRow[];
  // The card's outer width.
  chartWidth: number;
  currencyCode: string;
  // Full name for a month in the tapped-bar readout ("September 2026",
  // or "15 – 31 Jul 2026" for a month the range only partly covers).
  formatMonth: (month: string) => string;
};

const CARD_PADDING = 16;
const EDGE_SPACING = 8;
const CHART_HEIGHT = 160;
const AXIS_LABEL_HEIGHT = 20;

function TrendChartCard({
  trend,
  chartWidth,
  currencyCode,
  formatMonth,
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  // Index of the tapped month, or null for the "tap a bar" hint.
  const [selected, setSelected] = useState<number | null>(null);

  // Pure and never touches the aggregate query results themselves — only
  // reshapes the already-verified rows for the chart library (see
  // utils/chartHelpers.ts).
  const trendChartData = useMemo(
    () => buildTrendChartData(trend, formatMonthAxisLabel),
    [trend],
  );

  // The drawable width inside the card, with no y-axis column (the
  // largest value is printed above the chart instead, which leaves the
  // width to the bars and their labels).
  const chartAreaWidth = chartWidth - CARD_PADDING * 2;
  const layout = computeTrendBarLayout(
    chartAreaWidth - EDGE_SPACING * 2,
    trendChartData.length,
  );
  const maxValue = trendMaxValue(trendChartData);
  const selectedPoint = selected != null ? trendChartData[selected] : undefined;

  const barData = useMemo(
    () =>
      trendChartData.flatMap((point, index) => {
        const isSelected = index === selected;
        return [
          {
            value: point.income,
            frontColor: colors.success,
            spacing: TREND_INNER_GAP,
            // gifted-charts draws a label in a box only as wide as its
            // bar by default, which is what truncated "Sep" to "…" under
            // 10px bars. The box is set to the whole income+expense pair
            // here, and the label inside it is a full month-slot wide and
            // shifted left by half the overhang, so it is centered under
            // the pair and never clipped.
            labelWidth: layout.groupWidth,
            // Called by gifted-charts as a plain function, never used as
            // a JSX element type, so there is no component to remount.
            // eslint-disable-next-line react/no-unstable-nested-components
            labelComponent: () => (
              <Text
                numberOfLines={1}
                style={[
                  styles.axisLabel,
                  {
                    width: layout.slotWidth,
                    marginLeft:
                      (layout.groupWidth + TREND_INNER_GAP - layout.slotWidth) /
                      2,
                    color: isSelected ? colors.text : colors.textSecondary,
                  },
                  isSelected && styles.axisLabelSelected,
                ]}
              >
                {point.label}
              </Text>
            ),
          },
          { value: point.expenses, frontColor: colors.danger },
        ];
      }),
    [trendChartData, layout.groupWidth, layout.slotWidth, selected, colors],
  );

  if (trend.length === 0 || maxValue === 0) {
    return (
      <Card colors={colors} style={styles.card}>
        <Text style={{ color: colors.textSecondary }}>
          No income or expenses in this range.
        </Text>
      </Card>
    );
  }

  if (trendChartData.length === 1) {
    // A one-point "trend" is a contradiction in terms — a line chart
    // would either render as a single dot or fail to draw any line
    // segment at all. Current Month always produces exactly one month,
    // so instead of a line chart this shows the same two figures as a
    // small two-bar comparison, which is the sensible reading of
    // "trend" when there's only one period.
    const point = trendChartData[0];
    return (
      <Card colors={colors} style={[styles.card, styles.centered]}>
        <BarChart
          data={[
            {
              label: 'Income',
              value: point.income,
              frontColor: colors.success,
            },
            {
              label: 'Expenses',
              value: point.expenses,
              frontColor: colors.danger,
            },
          ]}
          width={Math.min(chartAreaWidth, 240)}
          height={CHART_HEIGHT}
          barWidth={48}
          spacing={40}
          initialSpacing={EDGE_SPACING * 3}
          barBorderRadius={4}
          hideYAxisText
          yAxisLabelWidth={0}
          yAxisThickness={0}
          xAxisColor={colors.border}
          hideRules
          labelWidth={88}
          xAxisLabelsHeight={AXIS_LABEL_HEIGHT}
          xAxisLabelTextStyle={[
            styles.axisLabelLarge,
            { color: colors.textSecondary },
          ]}
          disablePress
          disableScroll
          isAnimated={false}
        />
        <Text style={[styles.valueLine, { color: colors.success }]}>
          Income {formatAmount(point.income, currencyCode)}
        </Text>
        <Text style={[styles.valueLine, { color: colors.danger }]}>
          Expenses {formatAmount(point.expenses, currencyCode)}
        </Text>
      </Card>
    );
  }

  return (
    <Card colors={colors} style={styles.card}>
      {/* The readout above the chart: the tapped month's two figures, or
          the scale (what the tallest bar stands for) until one is tapped. */}
      <View style={styles.readout}>
        {selectedPoint ? (
          <>
            <Text style={[styles.readoutTitle, { color: colors.text }]}>
              {formatMonth(selectedPoint.month)}
            </Text>
            <Text style={[styles.readoutValue, { color: colors.success }]}>
              Income {formatAmount(selectedPoint.income, currencyCode)}
            </Text>
            <Text style={[styles.readoutValue, { color: colors.danger }]}>
              Expenses {formatAmount(selectedPoint.expenses, currencyCode)}
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.readoutTitle, { color: colors.text }]}>
              Top bar = {formatAmount(maxValue, currencyCode)}
            </Text>
            <Text style={[styles.readoutHint, { color: colors.textSecondary }]}>
              Tap a month's bars to see its totals
            </Text>
          </>
        )}
      </View>

      <BarChart
        data={barData}
        width={chartAreaWidth}
        height={CHART_HEIGHT}
        maxValue={maxValue}
        noOfSections={4}
        barWidth={layout.barWidth}
        spacing={layout.groupSpacing}
        initialSpacing={EDGE_SPACING}
        endSpacing={EDGE_SPACING}
        barBorderRadius={3}
        hideYAxisText
        yAxisLabelWidth={0}
        yAxisThickness={0}
        xAxisColor={colors.border}
        rulesColor={colors.border}
        rulesType="solid"
        xAxisLabelsHeight={AXIS_LABEL_HEIGHT}
        // Scrolls sideways only when the months can't all fit at a
        // readable label size (see computeTrendBarLayout).
        disableScroll={!layout.scrollable}
        showScrollIndicator={layout.scrollable}
        onPress={(_item: unknown, index: number) => {
          const month = Math.floor(index / 2);
          setSelected(current => (current === month ? null : month));
        }}
        isAnimated={false}
      />

      <ChartLegend
        items={[
          { label: 'Income', color: colors.success },
          { label: 'Expenses', color: colors.danger },
        ]}
      />
      {layout.scrollable && (
        <Text
          style={[
            styles.readoutHint,
            styles.scrollHint,
            { color: colors.textSecondary },
          ]}
        >
          Swipe the chart to see every month
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: CARD_PADDING,
  },
  centered: {
    alignItems: 'center',
  },
  readout: {
    minHeight: 58,
    marginBottom: 8,
  },
  readoutTitle: {
    fontSize: scaleFont(14),
    fontWeight: '700',
    marginBottom: 2,
  },
  readoutValue: {
    fontSize: scaleFont(13),
    fontWeight: '600',
  },
  readoutHint: {
    fontSize: scaleFont(12),
  },
  scrollHint: {
    textAlign: 'center',
    marginTop: 6,
  },
  valueLine: {
    fontSize: scaleFont(13),
    fontWeight: '600',
    marginTop: 4,
  },
  axisLabel: {
    fontSize: scaleFont(10),
    textAlign: 'center',
  },
  axisLabelSelected: {
    fontWeight: '700',
  },
  axisLabelLarge: {
    fontSize: scaleFont(12),
  },
});

export default TrendChartCard;
