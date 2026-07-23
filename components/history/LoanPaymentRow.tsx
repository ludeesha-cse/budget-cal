import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Wallet } from 'lucide-react-native';
import HistoryRowDateBlock from './HistoryRowDateBlock';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, scaleFont } from '../../theme/typography';
import { formatAmount } from '../../utils/formatAmount';
import type { LoanPaymentRow as LoanPaymentRowData } from '../../hooks/useTransactionHistoryData';

type Props = {
  loanPayment: LoanPaymentRowData;
};

// A repayment or a collection — the money-flowing-BACK half of the loan
// ledger, whose other half is LoanOriginationRow.
//
// Read-only — unlike transfers and transactions, a loan payment row has
// no edit or delete action of its own here (settling/undoing a payment
// is done from LiabilitiesReceivablesScreen).
function LoanPaymentRow({ loanPayment }: Props): React.JSX.Element {
  const { colors } = useTheme();

  // Money flows from the real account into the loan account when paying
  // down a Liability, and from the loan account into the real account
  // when a Receivable pays you back — same direction logic settleLoan
  // itself uses.
  const isLiability = loanPayment.loanAccountType === 'Liability';
  const fromName = isLiability
    ? loanPayment.counterpartAccountName
    : loanPayment.loanAccountName;
  const toName = isLiability
    ? loanPayment.loanAccountName
    : loanPayment.counterpartAccountName;

  return (
    <View style={styles.row}>
      <HistoryRowDateBlock date={loanPayment.date} />
      <View style={styles.rowDetails}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>
          {isLiability ? 'Loan repayment' : 'Loan collection'}
        </Text>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { borderColor: colors.border }]}>
            <Text style={[typography.eyebrow, styles.badgeText, { color: colors.textSecondary }]}>
              {isLiability ? 'LIABILITY' : 'RECEIVABLE'}
            </Text>
          </View>
        </View>
        <View style={styles.accountRow}>
          <Wallet size={11} color={colors.textSecondary} />
          <Text style={[styles.accountRowText, { color: colors.textSecondary }]}>
            {fromName} → {toName}
          </Text>
        </View>
      </View>
      {/* Paired with LoanOriginationRow's colouring, and for the same
          reason: paying a liability down is money leaving (red, −),
          collecting on a receivable is money arriving (green, +). This
          used to be brand-teal in both directions, which read as
          "something loan-ish happened" and left the direction to be
          worked out from the account arrow. */}
      <Text
        style={[
          typography.amountMono,
          styles.amount,
          { color: isLiability ? colors.danger : colors.success },
        ]}>
        {isLiability ? '-' : '+'}
        {formatAmount(loanPayment.amount, loanPayment.currencyCode)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
  },
  rowDetails: {
    flex: 1,
    paddingRight: 8,
  },
  rowTitle: {
    fontSize: scaleFont(15),
    fontWeight: '600',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  accountRowText: {
    fontSize: scaleFont(12),
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  badge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: scaleFont(9.5),
  },
  amount: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
});

export default LoanPaymentRow;
