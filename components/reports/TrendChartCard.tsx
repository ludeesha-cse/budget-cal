import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import Card from '../Card';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';
import { buildTrendChartData } from '../../utils/chartHelpers';
import { formatMonthAxisLabel } from '../../utils/dateUtils';
import type { ReportTrendRow } from '../../hooks/useReportData';

type Props = {
  trend: ReportTrendRow[];
  chartWidth: number;
};

function TrendChartCard({ trend, chartWidth }: Props): React.JSX.Element {
  const { colors } = useTheme();

  // Pure and never touches the aggregate query results themselves — only
  // reshapes the already-verified rows for the chart library (see
  // utils/chartHelpers.ts).
  const trendChartData = useMemo(
    () => buildTrendChartData(trend, formatMonthAxisLabel),
    [trend],
  );

  return (
    <Card colors={colors} style={[styles.card, styles.trendCard]}>
      {trend.length === 0 ? (
        <Text style={{ color: colors.textSecondary }}>No trend data for this range.</Text>
      ) : trendChartData.length === 1 ? (
        // A one-point "trend" is a contradiction in terms — a line chart
        // would either render as a single dot or fail to draw any line
        // segment at all. Current Month always produces exactly one
        // month, so instead of a line chart this shows the same two
        // figures as a small two-bar comparison, which is the sensible
        // reading of "trend" when there's only one period.
        <BarChart
          data={[
            { label: 'Income', value: trendChartData[0].income, frontColor: colors.success },
            { label: 'Expenses', value: trendChartData[0].expenses, frontColor: colors.danger },
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
          xAxisLabelTextStyle={[styles.chartAxisLabel, { color: colors.textSecondary }]}
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
          xAxisLabelTextStyle={[styles.chartAxisLabelSmall, { color: colors.textSecondary }]}
          disablePress
          isAnimated={false}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
  },
  trendCard: {
    alignItems: 'center',
  },
  chartAxisLabel: {
    fontSize: scaleFont(12),
  },
  chartAxisLabelSmall: {
    fontSize: scaleFont(10),
  },
});

export default TrendChartCard;
