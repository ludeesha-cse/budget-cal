import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Card from '../Card';
import ChartLegend from './ChartLegend';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';
import { formatAmount } from '../../utils/formatAmount';
import type { BreakdownComparisonRow } from '../../utils/reportComparison';

type Props = {
  // Already trimmed to the top categories + "Other" (topWithOther).
  rows: BreakdownComparisonRow[];
  currencyCode: string;
  currentLabel: string;
  previousLabel: string;
};

// Per category, a pair of horizontal bars: this period on top, the last
// one under it, both on one shared scale. Plain views, so a bar's width
// is always a share of the card and the category name always gets a full
// line of its own (same approach as AccountTypeBars).
function CategoryComparisonChart({
  rows,
  currencyCode,
  currentLabel,
  previousLabel,
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  const max = Math.max(1, ...rows.flatMap(row => [row.current, row.previous]));

  const renderBar = (value: number, color: string) => {
    const fillWidth =
      value > 0 ? (`${Math.max(2, (value / max) * 100)}%` as const) : 0;
    return (
      <View style={styles.barRow}>
        <View style={[styles.track, { backgroundColor: colors.neutralSoft }]}>
          <View
            style={[
              styles.fill,
              {
                backgroundColor: color,
                width: fillWidth,
              },
            ]}
          />
        </View>
        <Text
          style={[styles.amount, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {formatAmount(value, currencyCode, { decimals: 0, hideCode: true })}
        </Text>
      </View>
    );
  };

  return (
    <Card colors={colors} style={styles.card}>
      {rows.map((row, index) => (
        <View key={row.key} style={index > 0 && styles.rowSpacing}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {row.label}
          </Text>
          {renderBar(row.current, colors.primary)}
          {renderBar(row.previous, colors.textSecondary)}
        </View>
      ))}
      <ChartLegend
        items={[
          { label: `${currentLabel} (${currencyCode})`, color: colors.primary },
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
  rowSpacing: {
    marginTop: 14,
  },
  name: {
    fontSize: scaleFont(14),
    fontWeight: '600',
    marginBottom: 4,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3,
  },
  track: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
  amount: {
    width: 76,
    textAlign: 'right',
    fontSize: scaleFont(12),
  },
});

export default CategoryComparisonChart;
