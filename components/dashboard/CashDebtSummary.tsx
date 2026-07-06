import React from 'react';
import { StyleSheet } from 'react-native';
import { CreditCard, TrendingUp, Wallet } from 'lucide-react-native';
import Card from '../Card';
import SummaryRow from './SummaryRow';
import { useTheme } from '../../contexts/ThemeContext';
import { formatAmount } from '../../utils/formatAmount';

type Props = {
  cashInHandByCurrency: Record<string, number>;
  creditCardDebt: number;
  totalIncome: number;
};

function CashDebtSummary({
  cashInHandByCurrency,
  creditCardDebt,
  totalIncome,
}: Props): React.JSX.Element {
  const { colors } = useTheme();

  const cashInHandLabel =
    Object.keys(cashInHandByCurrency).length > 0
      ? Object.entries(cashInHandByCurrency)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([code, amount]) => formatAmount(amount, code))
          .join(' · ')
      : 'None';

  return (
    <Card colors={colors} style={styles.card}>
      <SummaryRow
        icon={Wallet}
        iconColor={colors.primary}
        iconBackground={colors.primarySoft}
        label="Cash in hand"
        value={cashInHandLabel}
        valueColor={colors.text}
      />
      <SummaryRow
        icon={CreditCard}
        iconColor={colors.danger}
        iconBackground={colors.dangerSoft}
        label="Credit card debt"
        value={formatAmount(creditCardDebt, '', { hideCode: true })}
        valueColor={colors.danger}
      />
      <SummaryRow
        icon={TrendingUp}
        iconColor={colors.success}
        iconBackground={colors.successSoft}
        label="Income this month"
        value={formatAmount(totalIncome, '', { hideCode: true })}
        valueColor={colors.success}
        isLast
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 10,
  },
});

export default CashDebtSummary;
