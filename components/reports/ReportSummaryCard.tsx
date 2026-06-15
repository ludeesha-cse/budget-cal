import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Card from '../Card';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, scaleFont } from '../../theme/typography';
import { formatAbbreviated } from '../../utils/formatAmount';
import type { ReportSummaryResult } from '../../hooks/useReportData';

type Props = {
  summary: ReportSummaryResult;
};

// Income / Expense / Net three-column card at the top of the report.
function ReportSummaryCard({ summary }: Props): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <Card colors={colors} style={[styles.card, styles.summaryCard]}>
      <View style={styles.summaryColumn}>
        <Text style={[typography.eyebrow, styles.summaryLabel, { color: colors.textSecondary }]}>
          Income
        </Text>
        <Text style={[typography.amountMono, styles.summaryValue, { color: colors.success }]}>
          {formatAbbreviated(summary.totalIncome)}
        </Text>
      </View>
      <View style={styles.summaryColumn}>
        <Text style={[typography.eyebrow, styles.summaryLabel, { color: colors.textSecondary }]}>
          Expense
        </Text>
        <Text style={[typography.amountMono, styles.summaryValue, { color: colors.danger }]}>
          {formatAbbreviated(summary.totalExpenses)}
        </Text>
      </View>
      <View style={styles.summaryColumn}>
        <Text style={[typography.eyebrow, styles.summaryLabel, { color: colors.textSecondary }]}>
          Net
        </Text>
        <Text style={[typography.amountMono, styles.summaryValue, { color: colors.text }]}>
          {formatAbbreviated(summary.net)}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
  },
  summaryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryColumn: {
    alignItems: 'flex-start',
  },
  summaryLabel: {
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: scaleFont(20),
    fontWeight: '700',
  },
});

export default ReportSummaryCard;
