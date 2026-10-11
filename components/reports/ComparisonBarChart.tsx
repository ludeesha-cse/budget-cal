import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Card from '../Card';
import ChartLegend from './ChartLegend';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';
import { formatAbbreviated } from '../../utils/formatAmount';

export type ComparisonBarGroup = {
  label: string;
  current: number;
  previous: number;
};

type Props = {
  groups: ComparisonBarGroup[];
  currentLabel: string;
  previousLabel: string;
};

const PLOT_HEIGHT = 160;
const BAR_WIDTH = 22;
// Kept clear above and below the bars for their value labels, so the
// tallest bar's label never sits on top of the bar itself.
const LABEL_SPACE = 16;
const DRAWABLE_HEIGHT = PLOT_HEIGHT - LABEL_SPACE * 2;

// Income / Expenses / Net, this period beside the last, as grouped
// vertical bars. Drawn with plain views rather than gifted-charts: Net
// can be negative, and these bars need a zero line part-way up the plot
// with readable labels under each group — which is simpler and more
// predictable to lay out directly (same reasoning as AccountTypeBars).
function ComparisonBarChart({
  groups,
  currentLabel,
  previousLabel,
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  const values = groups.flatMap(group => [group.current, group.previous]);
  const positiveMax = Math.max(0, ...values);
  const negativeMax = Math.max(0, ...values.map(value => -value));
  const span = positiveMax + negativeMax || 1;
  // Distance from the top of the plot to the zero line.
  const zeroY = LABEL_SPACE + (positiveMax / span) * DRAWABLE_HEIGHT;

  const renderBar = (value: number, color: string) => {
    const height = Math.max(
      value === 0 ? 0 : 2,
      (Math.abs(value) / span) * DRAWABLE_HEIGHT,
    );
    return (
      <View style={styles.barColumn}>
        <Text
          style={[
            styles.barValue,
            { color: colors.textSecondary },
            value >= 0
              ? { top: zeroY - height - LABEL_SPACE }
              : { top: zeroY + height + 2 },
          ]}
          numberOfLines={1}
        >
          {formatAbbreviated(value)}
        </Text>
        <View
          style={[
            styles.bar,
            {
              backgroundColor: color,
              height,
              top: value >= 0 ? zeroY - height : zeroY,
            },
          ]}
        />
      </View>
    );
  };

  return (
    <Card colors={colors} style={styles.card}>
      <View style={styles.plot}>
        <View
          style={[
            styles.zeroLine,
            { top: zeroY, backgroundColor: colors.border },
          ]}
        />
        {groups.map(group => (
          <View key={group.label} style={styles.group}>
            <View style={styles.bars}>
              {renderBar(group.current, colors.primary)}
              {renderBar(group.previous, colors.textSecondary)}
            </View>
          </View>
        ))}
      </View>
      <View style={styles.labels}>
        {groups.map(group => (
          <Text
            key={group.label}
            style={[styles.groupLabel, { color: colors.text }]}
            numberOfLines={1}
          >
            {group.label}
          </Text>
        ))}
      </View>
      <ChartLegend
        items={[
          { label: currentLabel, color: colors.primary },
          { label: previousLabel, color: colors.textSecondary },
        ]}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
  },
  plot: {
    flexDirection: 'row',
    height: PLOT_HEIGHT,
    marginTop: 8,
  },
  zeroLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth * 2,
  },
  group: {
    flex: 1,
    alignItems: 'center',
  },
  bars: {
    flexDirection: 'row',
    gap: 6,
    height: '100%',
  },
  barColumn: {
    width: BAR_WIDTH + 18,
    height: '100%',
    alignItems: 'center',
  },
  bar: {
    position: 'absolute',
    width: BAR_WIDTH,
    borderRadius: 4,
  },
  barValue: {
    position: 'absolute',
    fontSize: scaleFont(10),
    fontWeight: '600',
    textAlign: 'center',
    width: BAR_WIDTH + 18,
  },
  labels: {
    flexDirection: 'row',
    marginTop: 8,
  },
  // Each label is the full width of its group — never squeezed to a
  // bar's width (the lesson from the trend chart's "…" labels).
  groupLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: scaleFont(12),
    fontWeight: '700',
  },
});

export default ComparisonBarChart;
