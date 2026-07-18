import React from 'react';
import { StyleSheet } from 'react-native';
import { CreditCard, TrendingUp } from 'lucide-react-native';
import Card from '../Card';
import SummaryRow from './SummaryRow';
import { useTheme } from '../../contexts/ThemeContext';
import { formatAmount } from '../../utils/formatAmount';

type Props = {
  creditCardDebt: number;
  totalIncome: number;
};

// "Cash in hand" used to head this card: every Bank/Cash/CryptoWallet/
// Receivable balance summed per currency, rendered as one strip of
// figures. It was removed rather than reworked, because a single line
// mixing several currencies side by side ("1,200.00 USD · 45,000.00
// LKR") is not a number anyone can act on — currencies are never summed
// in this app, so it was really several unrelated totals wearing one
// label. Anyone who wants that view has a better one already: the
// Accounts screen lists each account's real balance, and Net Worth
// aggregates them properly, on demand. This card is now what its
// remaining two rows always were — this month's debt and income.
function CashDebtSummary({
  creditCardDebt,
  totalIncome,
}: Props): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <Card colors={colors} style={styles.card}>
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
