import React from 'react';
import { StyleSheet, Text } from 'react-native';
import Card from '../Card';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';
import { formatAmount } from '../../utils/formatAmount';

type Props = {
  cashInHandByCurrency: Record<string, number>;
  creditCardDebt: number;
  totalIncome: number;
};

// "Cash & Debt" card body — the section header stays in the screen
// orchestrator. The "Liabilities & Receivables" card just below this one
// on the dashboard is small enough (and wasn't named in the component
// list) to stay inline in the orchestrator alongside its own header.
function CashDebtSummary({
  cashInHandByCurrency,
  creditCardDebt,
  totalIncome,
}: Props): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <Card colors={colors} style={styles.card}>
      <Text style={[styles.row, { color: colors.text }]}>
        Total cash in hand:{' '}
        {Object.keys(cashInHandByCurrency).length > 0
          ? Object.entries(cashInHandByCurrency)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([code, amount]) => formatAmount(amount, code))
              .join(' · ')
          : 'None'}
      </Text>
      <Text style={[styles.row, { color: colors.danger }]}>
        Credit card debt: {formatAmount(creditCardDebt, '', { hideCode: true })}
      </Text>
      <Text style={[styles.row, { color: colors.success }]}>
        Total income this month: {formatAmount(totalIncome, '', { hideCode: true })}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    marginBottom: 10,
  },
  row: {
    fontSize: scaleFont(15),
    marginBottom: 6,
  },
});

export default CashDebtSummary;
