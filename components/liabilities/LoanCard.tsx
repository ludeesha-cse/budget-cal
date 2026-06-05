import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Card from '../Card';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont, typography } from '../../theme/typography';
import { formatAmount } from '../../utils/formatAmount';
import { formatInterestRatePercent } from '../../utils/interestCalculations';
import { avatarColorsFor } from '../../utils/avatarColor';
import type { LoanAccountType } from '../../db/queries';
import type { ActiveLoan } from '../../hooks/useLoanAccountsData';

type Props = {
  loan: ActiveLoan;
  index: number;
  type: LoanAccountType;
  totalOwed: number;
  onSettle: () => void;
};

// One active loan card — the caller is responsible for the `key` prop on
// each instance (accountId+currencyId, matching the original).
function LoanCard({ loan, index, type, totalOwed, onSettle }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { bg, fg } = avatarColorsFor(index, colors.chart);

  return (
    <Card colors={colors} style={styles.loanCard}>
      <View style={styles.loanHeader}>
        <View style={[styles.avatar, { backgroundColor: bg }]}>
          <Text style={[styles.avatarText, { color: fg }]}>
            {loan.counterpartyName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.loanHeaderText}>
          <Text style={[styles.loanName, { color: colors.text }]} numberOfLines={1}>
            {loan.counterpartyName}
          </Text>
          <Text style={[styles.loanDetail, { color: colors.textSecondary }]}>
            Principal: {formatAmount(loan.principal, loan.currencyCode)}
          </Text>
        </View>
      </View>

      {/* Live figure — principal plus interest accrued since
          lastAccrualAnchorDate, recomputed on every load rather than
          trusted from a stored column. */}
      <Text
        style={[
          typography.amountMono,
          styles.loanTotalOwed,
          { color: type === 'Liability' ? colors.danger : colors.success },
        ]}>
        {formatAmount(totalOwed, loan.currencyCode)}
      </Text>
      <Text style={[styles.loanDetail, { color: colors.textSecondary }]}>
        Started {loan.dateCreated}
        {loan.dueDate ? ` · due ${loan.dueDate}` : ''}
      </Text>
      {loan.interestRate != null && (
        <Text style={[styles.loanDetail, { color: colors.textSecondary }]}>
          Interest: {formatInterestRatePercent(loan.interestRate, 2)} {loan.interestPeriod ?? ''}
        </Text>
      )}

      <Pressable
        style={[styles.settlePillButton, { backgroundColor: colors.primary }]}
        onPress={onSettle}>
        <Text style={[styles.settlePillButtonText, { color: colors.primaryText }]}>
          Settle / Pay Off
        </Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  loanCard: {
    padding: 14,
    marginBottom: 10,
  },
  loanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  loanHeaderText: {
    flex: 1,
  },
  loanName: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  loanDetail: {
    fontSize: scaleFont(12.5),
    marginTop: 2,
  },
  loanTotalOwed: {
    fontSize: scaleFont(20),
    marginTop: 10,
  },
  settlePillButton: {
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  settlePillButtonText: {
    fontSize: scaleFont(13.5),
    fontWeight: '700',
  },
});

export default LoanCard;
