import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import Card from '../Card';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../contexts/ThemeContext';
import { typography, scaleFont } from '../../theme/typography';
import { formatAmount, formatPercent } from '../../utils/formatAmount';
import { buildCategoryPieSlices } from '../../utils/chartHelpers';
import type { ReportCategoryRow } from '../../hooks/useReportData';

// Defined at module scope (not inline in CategoryPieCard's JSX) so it
// isn't recreated as a new component type on every render —
// react-hooks/eslint flags inline component definitions passed to
// centerLabelComponent since gifted-charts would otherwise remount this
// subtree every time CategoryPieCard re-renders.
function PieCenterLabel({
  totalLabel,
  colors,
}: {
  totalLabel: string;
  colors: ThemeColors;
}): React.JSX.Element {
  return (
    <View style={styles.pieCenter}>
      <Text style={[styles.pieCenterValue, { color: colors.text }]} numberOfLines={1}>
        {totalLabel}
      </Text>
      <Text style={[styles.pieCenterLabel, { color: colors.textSecondary }]}>Total</Text>
    </View>
  );
}

type Props = {
  categoryBreakdown: ReportCategoryRow[];
  chartWidth: number;
  totalExpenses: number;
  currencyCode: string;
};

// Assumes categoryBreakdown is non-empty — the orchestrator only renders
// this when there's something to show, same as before extraction.
function CategoryPieCard({
  categoryBreakdown,
  chartWidth,
  totalExpenses,
  currencyCode,
}: Props): React.JSX.Element {
  const { colors } = useTheme();

  // Pure and never touches the aggregate query results themselves — only
  // reshapes the already-verified rows for the chart library (see
  // utils/chartHelpers.ts).
  const pieSlices = useMemo(
    () => buildCategoryPieSlices(categoryBreakdown, colors),
    [categoryBreakdown, colors],
  );
  const pieRadius = Math.min(chartWidth * 0.32, 70);

  // Stable function reference (not an inline arrow defined in the JSX
  // below) so PieChart's centerLabelComponent slot never sees a "new
  // component type" from one render to the next.
  const renderPieCenterLabel = useCallback(
    () => <PieCenterLabel totalLabel={formatAmount(totalExpenses, currencyCode)} colors={colors} />,
    [totalExpenses, currencyCode, colors],
  );

  return (
    <Card colors={colors} style={[styles.card, styles.categoryCard]}>
      <PieChart
        data={pieSlices}
        donut
        radius={pieRadius}
        innerRadius={pieRadius * 0.6}
        innerCircleColor={colors.surface}
        // No in-slice text and no onPress/focus config — the exact
        // figures already live in the legend right next to it, and
        // skipping the library's own label/touch handling avoids the
        // iOS/Android rendering inconsistencies that feature is prone to.
        showText={false}
        centerLabelComponent={renderPieCenterLabel}
      />
      <View style={styles.legendColumn}>
        {pieSlices.map(slice => (
          <View key={slice.label} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: slice.color }]} />
            <Text style={[styles.legendLabel, { color: colors.text }]} numberOfLines={1}>
              {slice.label}
            </Text>
            <Text style={[typography.amountMono, styles.legendPercent, { color: colors.textSecondary }]}>
              {formatPercent(slice.percent)}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
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
});

export default CategoryPieCard;
