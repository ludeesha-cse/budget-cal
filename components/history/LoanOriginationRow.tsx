import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Wallet } from 'lucide-react-native';
import HistoryRowDateBlock from './HistoryRowDateBlock';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, scaleFont } from '../../theme/typography';
import { formatAmount } from '../../utils/formatAmount';
import type { LoanOriginationRow as LoanOriginationRowData } from '../../hooks/useTransactionHistoryData';

type Props = {
  origination: LoanOriginationRowData;
};

// The moment money crossed the loan edge — "Borrowed" when a liability
// was opened or topped up, "Lent" when a receivable was.
//
// WHY IT IS COLOURED LIKE INCOME AND SPENDING RATHER THAN LIKE A
// TRANSFER: from where the user is standing, borrowing put money in
// their pocket and lending took money out, and History is the list they
// scan to answer "what happened to my money". A neutral transfer colour
// would be technically defensible (net worth is unchanged either way,
// which is exactly why this is NOT a transactions row and never reaches
// a budget or a category report) but it hides the thing they are
// actually looking for. So: green with a +, red with a −, matching
// TransactionRow's income/expense convention exactly, while the
// RECEIVABLE / LIABILITY badge keeps it honest about what kind of event
// it really is.
//
// Read-only, like LoanPaymentRow — the amount is corrected by editing
// the loan on the Liabilities & Receivables screen, which rewrites this
// row and both account balances together.
function LoanOriginationRow({ origination }: Props): React.JSX.Element {
  const { colors } = useTheme();

  const isLiability = origination.loanAccountType === 'Liability';
  // Borrowing moves money from the counterparty's loan account into a
  // real account; lending is the same edge crossed the other way.
  const fromName = isLiability
    ? origination.loanAccountName
    : origination.counterpartAccountName;
  const toName = isLiability
    ? origination.counterpartAccountName
    : origination.loanAccountName;

  return (
    <View style={styles.row}>
      <HistoryRowDateBlock date={origination.date} />
      <View style={styles.rowDetails}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>
          {isLiability ? 'Borrowed' : 'Lent'}
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
          {/* counterpart_account_name is null only for loans backfilled
              by migration 0027, where which real account the money
              crossed was never recorded. Naming the counterparty alone
              is honest; inventing an account would not be. */}
          <Text style={[styles.accountRowText, { color: colors.textSecondary }]}>
            {origination.counterpartAccountName
              ? `${fromName} → ${toName}`
              : origination.counterpartyName}
          </Text>
        </View>
      </View>
      <Text
        style={[
          typography.amountMono,
          styles.amount,
          { color: isLiability ? colors.success : colors.danger },
        ]}>
        {isLiability ? '+' : '-'}
        {formatAmount(origination.amount, origination.currencyCode)}
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
    flexShrink: 1,
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

export default LoanOriginationRow;
