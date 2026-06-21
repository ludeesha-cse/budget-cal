import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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

function TransactionRow({
  transaction,
  tags,
  defaultCurrencyId,
  onPress,
  onDelete,
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  const isIncome = transaction.entryType === 'Income';
  // Highlights any transaction recorded in a currency other than the
  // app's current default — this is the fix for the "an expense in a
  // different currency silently deducted from the wrong budget" report:
  // even once budgets are correctly currency-scoped, History itself gave
  // no visual indication a row was in a non-default currency at all.
  const isNonDefaultCurrency =
    defaultCurrencyId != null && transaction.currencyId !== defaultCurrencyId;

  return (
    <Pressable style={styles.row} onPress={onPress}>
      <HistoryRowDateBlock date={transaction.date} />
      <View style={styles.rowDetails}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>
          {transaction.description ||
            transaction.categoryName ||
            (isIncome ? 'Income' : 'Expense')}
        </Text>
        {(transaction.categoryName || tags.length > 0 || isNonDefaultCurrency) && (
          <View style={styles.badgeRow}>
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
