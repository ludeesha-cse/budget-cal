import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Trash2, Wallet } from 'lucide-react-native';
import HistoryRowDateBlock from './HistoryRowDateBlock';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, scaleFont } from '../../theme/typography';
import { formatAmount } from '../../utils/formatAmount';
import type { TagRow } from '../../hooks/useTransactionHistoryFilters';
import type { TransactionRow as TransactionRowData } from '../../hooks/useTransactionHistoryData';

type Props = {
  transaction: TransactionRowData;
  tags: TagRow[];
  // null while the default currency hasn't loaded yet, or if none is set
  // at all — the currency tag below is simply not shown in either case,
  // same as "no tag" rather than guessing.
  defaultCurrencyId: number | null;
  onPress: () => void;
  onDelete: () => void;
};

// Whether tapping this row should open the editor.
//
// A scheduled payment is a real transactions row, but it is also a step
// in a plan: an installment slot, or a month of a recurring rule. Its
// amount belongs to that plan, not to this row, so editing it here would
// let the payments quietly stop summing to what the plan says is owed —
// and there would be nothing on the plan's own screen to explain the
// discrepancy. Those rows are therefore delete-only, and deleting one
// unwinds the plan step with it (see deleteHistoryTransaction).
//
// The exception is a "Pay custom" installment payment: that amount was
// always the user's own number rather than the plan's, so correcting it
// is correcting a typo, exactly like any ordinary expense.
function isEditable(transaction: TransactionRowData): boolean {
  if (transaction.recurringOccurrenceId != null) {
    return false;
  }
  if (transaction.installmentPaymentId != null) {
    return transaction.installmentIsCustomAmount === true;
  }
  return true;
}

function lockedLabel(transaction: TransactionRowData): string | null {
  if (transaction.recurringOccurrenceId != null) {
    return 'RECURRING';
  }
  if (
    transaction.installmentPaymentId != null &&
    transaction.installmentIsCustomAmount !== true
  ) {
    return 'INSTALLMENT';
  }
  return null;
}

// Said on the press rather than left to be inferred from a tap that does
// nothing — and it names the way forward, because there always is one.
function explainLocked(transaction: TransactionRowData): void {
  if (transaction.recurringOccurrenceId != null) {
    Alert.alert(
      'Recurring payment',
      'This came from a recurring rule, so its amount belongs to that rule rather than to this entry. Delete it here to send the month back to pending, then confirm it again with the right figure — or change the rule itself under Recurring Rules.',
    );
    return;
  }
  Alert.alert(
    'Scheduled installment',
    'This paid a fixed installment, so its amount is the plan\u2019s rather than yours to change here. Delete it to free that installment up again, then use Pay custom on the plan if you meant to pay a different amount.',
  );
}

function TransactionRow({
  transaction,
  tags,
  defaultCurrencyId,
  onPress,
  onDelete,
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  const isIncome = transaction.entryType === 'Income';
  const editable = isEditable(transaction);
  const scheduledBadge = lockedLabel(transaction);
  // Highlights any transaction recorded in a currency other than the
  // app's current default — this is the fix for the "an expense in a
  // different currency silently deducted from the wrong budget" report:
  // even once budgets are correctly currency-scoped, History itself gave
  // no visual indication a row was in a non-default currency at all.
  const isNonDefaultCurrency =
    defaultCurrencyId != null && transaction.currencyId !== defaultCurrencyId;

  return (
    // A locked row is deliberately still a Pressable rather than a plain
    // View: pressing it says why it cannot be edited, which is more
    // useful than a tap that does nothing at all.
    <Pressable
      style={styles.row}
      onPress={editable ? onPress : () => explainLocked(transaction)}>
      <HistoryRowDateBlock date={transaction.date} />
      <View style={styles.rowDetails}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>
          {transaction.description ||
            transaction.categoryName ||
            (isIncome ? 'Income' : 'Expense')}
        </Text>
        {(transaction.categoryName ||
          tags.length > 0 ||
          isNonDefaultCurrency ||
          scheduledBadge) && (
          <View style={styles.badgeRow}>
            {scheduledBadge && (
              <View style={[styles.badge, { borderColor: colors.textSecondary }]}>
                <Text
                  style={[typography.eyebrow, styles.badgeText, { color: colors.textSecondary }]}>
                  {scheduledBadge}
                </Text>
              </View>
            )}
            {isNonDefaultCurrency && (
              <View style={[styles.badge, styles.currencyBadge, { borderColor: colors.primary }]}>
                <Text style={[typography.eyebrow, styles.badgeText, { color: colors.primary }]}>
                  {transaction.currencyCode}
                </Text>
              </View>
            )}
            {transaction.categoryName && (
              <View style={[styles.badge, { borderColor: colors.border }]}>
                <Text style={[typography.eyebrow, styles.badgeText, { color: colors.textSecondary }]}>
                  {transaction.categoryName}
                </Text>
              </View>
            )}
            {tags.map(tag => (
              <View key={tag.id} style={[styles.badge, { borderColor: colors.border }]}>
                <Text style={[typography.eyebrow, styles.badgeText, { color: colors.textSecondary }]}>
                  {tag.name}
                </Text>
              </View>
            ))}
          </View>
        )}
        {transaction.accountName && (
          <View style={styles.accountRow}>
            <Wallet size={11} color={colors.textSecondary} />
            <Text style={[styles.accountRowText, { color: colors.textSecondary }]}>
              {transaction.accountName}
            </Text>
          </View>
        )}
        {transaction.excludeFromBudget && (
          <Text style={[styles.excludedText, { color: colors.textSecondary }]}>
            excluded from budget
          </Text>
        )}
      </View>
      <View style={styles.rowActions}>
        <Text
          style={[
            typography.amountMono,
            styles.amount,
            { color: isIncome ? colors.success : colors.danger },
          ]}>
          {isIncome ? '+' : ''}
          {formatAmount(isIncome ? transaction.amount : -transaction.amount, '', {
            hideCode: true,
          })}
        </Text>
        <Pressable hitSlop={8} style={styles.deleteButton} onPress={onDelete}>
          <Trash2 size={15} color={colors.danger} />
        </Pressable>
      </View>
    </Pressable>
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
  // Slightly heavier border than the plain category/tag badge (which uses
  // colors.border) so a non-default-currency row reads as a genuine
  // callout rather than just another neutral label — it's flagging
  // something the user should notice, not just categorizing the row.
  currencyBadge: {
    borderWidth: 1,
  },
  badgeText: {
    fontSize: scaleFont(9.5),
  },
  excludedText: {
    fontSize: scaleFont(11),
    fontStyle: 'italic',
    marginTop: 4,
  },
  rowActions: {
    alignItems: 'flex-end',
    gap: 6,
  },
  amount: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  deleteButton: {
    padding: 2,
  },
});

export default TransactionRow;
