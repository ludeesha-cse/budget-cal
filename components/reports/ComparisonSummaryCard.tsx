import React from 'react';
import { StyleSheet, Text } from 'react-native';
import Card from '../Card';
import DeltaBadge from './DeltaBadge';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, scaleFont } from '../../theme/typography';
import { formatAmount } from '../../utils/formatAmount';
import type { MetricDelta } from '../../utils/reportComparison';

type Props = {
  title: string;
  delta: MetricDelta;
  currencyCode: string;
  // Decimals for the two figures — 0 for daily averages, which would
  // otherwise read as false precision.
  decimals?: number;
};

// One metric (Income, Expenses, Net, Avg daily spend): this period's
// figure, last period's in smaller text, and the change between them.
function ComparisonSummaryCard({
  title,
  delta,
  currencyCode,
  decimals = 2,
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Card colors={colors} style={styles.card}>
      <Text
        style={[
          typography.eyebrow,
          styles.title,
          { color: colors.textSecondary },
        ]}
      >
        {title}
      </Text>
      <Text
        style={[typography.amountMono, styles.current, { color: colors.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {formatAmount(delta.current, currencyCode, { decimals })}
      </Text>
      <Text
        style={[styles.previous, { color: colors.textSecondary }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        was {formatAmount(delta.previous, currencyCode, { decimals })}
      </Text>
      <DeltaBadge delta={delta} currencyCode={currencyCode} />
    </Card>
  );
}

const styles = StyleSheet.create({
  // Two per row (see ReportComparison's grid).
  card: {
    flexBasis: '48%',
    flexGrow: 1,
    padding: 14,
  },
  title: {
    marginBottom: 6,
  },
  current: {
    fontSize: scaleFont(17),
  },
  previous: {
    fontSize: scaleFont(12),
    marginTop: 2,
    marginBottom: 8,
  },
});

export default ComparisonSummaryCard;
