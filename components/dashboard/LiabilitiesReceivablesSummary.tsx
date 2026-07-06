import React from 'react';
import { StyleSheet } from 'react-native';
import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react-native';
import Card from '../Card';
import SummaryRow from './SummaryRow';
import { useTheme } from '../../contexts/ThemeContext';
import { formatCurrencyTotals } from '../../utils/currencyTotals';

type Props = {
  liabilityTotals: Record<string, number>;
  receivableTotals: Record<string, number>;
};

function LiabilitiesReceivablesSummary({
  liabilityTotals,
  receivableTotals,
}: Props): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <Card colors={colors} style={styles.card}>
      <SummaryRow
        icon={ArrowDownCircle}
        iconColor={colors.danger}
        iconBackground={colors.dangerSoft}
        label="Total owed"
        value={formatCurrencyTotals(liabilityTotals)}
        valueColor={colors.danger}
      />
      <SummaryRow
        icon={ArrowUpCircle}
        iconColor={colors.success}
        iconBackground={colors.successSoft}
        label="Total owed to you"
        value={formatCurrencyTotals(receivableTotals)}
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

export default LiabilitiesReceivablesSummary;
