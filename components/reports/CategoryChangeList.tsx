import React from 'react';
import { StyleSheet, Text } from 'react-native';
import AmountListRow from './AmountListRow';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { formatAmount } from '../../utils/formatAmount';
import { formatPercentChange } from '../../utils/reportComparison';
import type { BreakdownComparisonRow } from '../../utils/reportComparison';

type Props = {
  title: string;
  // From biggestIncreases / biggestDecreases.
  rows: BreakdownComparisonRow[];
  currencyCode: string;
  emptyMessage: string;
};

// "Biggest increases" / "Biggest decreases": a category's change in
// spending, then what it was and what it is now. Spending going up is
// shown in danger and going down in success — the color is what the
// change means, not just which way it went.
function CategoryChangeList({
  title,
  rows,
  currencyCode,
  emptyMessage,
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  const amount = (value: number) =>
    formatAmount(value, currencyCode, { decimals: 0 });

  return (
    <>
      <Text
        style={[
          typography.eyebrow,
          styles.title,
          { color: colors.textSecondary },
        ]}
      >
        {title}
      </Text>
      {rows.length === 0 ? (
        <Text style={{ color: colors.textSecondary }}>{emptyMessage}</Text>
      ) : (
        rows.map(row => {
          const up = row.delta > 0;
          const marker =
            row.status === 'new'
              ? ' · New'
              : row.status === 'gone'
              ? ' · None this period'
              : '';
          return (
            <AmountListRow
              key={row.key}
              label={`${row.label}${marker}`}
              primaryText={`${up ? '▲' : '▼'} ${amount(
                Math.abs(row.delta),
              )} (${formatPercentChange(row.percent)})`}
              primaryColor={up ? colors.danger : colors.success}
              secondaryText={`${amount(row.previous)} → ${amount(row.current)}`}
              secondaryColor={colors.textSecondary}
            />
          );
        })
      )}
    </>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: 22,
    marginBottom: 6,
  },
});

export default CategoryChangeList;
