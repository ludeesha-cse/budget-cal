import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';
import { formatAmount } from '../../utils/formatAmount';
import { formatPercentChange } from '../../utils/reportComparison';
import type { DeltaTone, MetricDelta } from '../../utils/reportComparison';

type Props = {
  delta: MetricDelta;
  currencyCode: string;
};

export function toneColors(
  colors: ThemeColors,
  tone: DeltaTone,
): { text: string; background: string } {
  if (tone === 'good') {
    return { text: colors.success, background: colors.successSoft };
  }
  if (tone === 'bad') {
    return { text: colors.danger, background: colors.dangerSoft };
  }
  return { text: colors.textSecondary, background: colors.neutralSoft };
}

// "▲ LKR 12,500 (+18.4%)". The arrow says which way the figure moved; the
// color says whether that is good news (see compareMetric's `tone`), so
// spending going UP is red and income going up is green.
function DeltaBadge({ delta, currencyCode }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const tint = toneColors(colors, delta.tone);
  const text =
    delta.direction === 'flat'
      ? 'No change'
      : `${delta.direction === 'up' ? '▲' : '▼'} ${formatAmount(
          Math.abs(delta.delta),
          currencyCode,
          { decimals: 0 },
        )} (${formatPercentChange(delta.percent)})`;
  return (
    <View style={[styles.badge, { backgroundColor: tint.background }]}>
      <Text
        style={[styles.text, { color: tint.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: '100%',
  },
  text: {
    fontSize: scaleFont(12),
    fontWeight: '700',
  },
});

export default DeltaBadge;
