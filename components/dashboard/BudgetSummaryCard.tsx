import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Card from '../Card';
import ProgressBar from '../common/ProgressBar';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont, typography } from '../../theme/typography';
import { formatAmount } from '../../utils/formatAmount';
import { formatMonthTitle } from '../../utils/dateUtils';
import type { getBudgetForMonth } from '../../db/queries';

type BudgetRow = Awaited<ReturnType<typeof getBudgetForMonth>>;

type Props = {
  month: string;
  total: number;
  budget: BudgetRow;
  amountLeft: number | null;
  averageLeftPerDay: number | null;
  percentUsed: number;
  statusColor: string;
};

// "This Month's Budget" card body — the section label above it stays in
// the screen orchestrator, same as every other section header on this
// screen.
function BudgetSummaryCard({
  month,
  total,
  budget,
  amountLeft,
  averageLeftPerDay,
  percentUsed,
  statusColor,
}: Props): React.JSX.Element {
  const { colors } = useTheme();

  if (!budget || amountLeft === null) {
    return (
      <Card colors={colors} style={styles.card}>
        <Text style={{ color: colors.textSecondary }}>
          No budget set for this month yet.
        </Text>
      </Card>
    );
  }

  return (
    <Card colors={colors} style={styles.card}>
      <View style={styles.budgetHeaderRow}>
        <Text
          style={[typography.cardTitle, styles.budgetCardTitle, { color: colors.text }]}
          numberOfLines={1}>
          Overall — {formatMonthTitle(month)}
        </Text>
        <View style={[styles.percentPill, { backgroundColor: colors.successSoft }]}>
          <Text style={[styles.percentPillText, typography.amountMono, { color: colors.success }]}>
            {percentUsed}% used
          </Text>
        </View>
      </View>
      <View style={styles.budgetAmountRow}>
        <Text
          style={[typography.amountLarge, styles.budgetAmountFigure, { color: colors.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}>
          Rs. {formatAmount(total, '', { decimals: 0, hideCode: true })}
        </Text>
        <Text style={[typography.amountMono, styles.budgetAmountOf, { color: colors.textSecondary }]}>
          {' '}
          of {formatAmount(budget.limitAmount, '', { decimals: 0, hideCode: true })}
        </Text>
      </View>
      <ProgressBar
        percent={percentUsed}
        color={statusColor}
        height={8}
        style={styles.progressTrack}
      />
      <View style={styles.budgetFooterRow}>
        <Text style={[typography.amountMono, { color: colors.textSecondary }]}>
          Rs. {formatAmount(Math.max(0, amountLeft), '', { decimals: 0, hideCode: true })} left
        </Text>
        {averageLeftPerDay !== null && (
          <Text style={[typography.amountMono, { color: colors.textSecondary }]}>
            Rs. {formatAmount(Math.round(averageLeftPerDay), '', { decimals: 0, hideCode: true })} / day
            remaining
          </Text>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    marginBottom: 10,
  },
  budgetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    rowGap: 6,
  },
  budgetCardTitle: {
    flexShrink: 1,
    marginRight: 8,
  },
  percentPill: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexShrink: 0,
  },
  percentPillText: {
    fontSize: scaleFont(12),
    fontWeight: '700',
  },
  budgetAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 10,
    flexWrap: 'wrap',
  },
  budgetAmountFigure: {
    flexShrink: 1,
  },
  budgetAmountOf: {
    fontSize: scaleFont(15),
  },
  progressTrack: {
    marginTop: 14,
  },
  budgetFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
});

export default BudgetSummaryCard;
