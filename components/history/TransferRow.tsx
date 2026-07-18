import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import HistoryRowDateBlock from './HistoryRowDateBlock';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, scaleFont } from '../../theme/typography';
import { formatAmount } from '../../utils/formatAmount';
import type { TransferRow as TransferRowData } from '../../hooks/useTransactionHistoryData';

type Props = {
  transfer: TransferRowData;
  onPress: () => void;
  onDelete: () => void;
};

function TransferRow({ transfer, onPress, onDelete }: Props): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <Pressable style={styles.row} onPress={onPress}>
      <HistoryRowDateBlock date={transfer.date} />
      <View style={styles.rowDetails}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>
          {/* No "Transfer —" prefix: the TRANSFER badge below already
              says what this row is, and repeating it in the title costs
              the width that the account names actually need.

              A conversion inside one account reads as "BOC (USD → LKR)"
              rather than "BOC → BOC", which would look like a bug. */}
          {transfer.fromAccountId === transfer.toAccountId
            ? `${transfer.fromAccountName} (${transfer.currencyCode} → ${transfer.toCurrencyCode})`
            : `${transfer.fromAccountName} → ${transfer.toAccountName}`}
        </Text>
        {/* Set to the savings goal's name for a savings transfer, which
            is what makes the goal identifiable here without History
            knowing that savings goals exist. */}
        {transfer.description ? (
          <Text
            style={[styles.rowSubtitle, { color: colors.textSecondary }]}
            numberOfLines={1}>
            {transfer.description}
          </Text>
        ) : null}
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { borderColor: colors.border }]}>
            <Text style={[typography.eyebrow, styles.badgeText, { color: colors.textSecondary }]}>
              TRANSFER
            </Text>
          </View>
          {transfer.isCrossCurrency && (
            <View style={[styles.badge, { borderColor: colors.primary }]}>
              <Text style={[typography.eyebrow, styles.badgeText, { color: colors.primary }]}>
                CONVERTED
              </Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.rowActions}>
        {/* Both sides are shown for a conversion: one number could only
            ever be half the story, and which half would be arbitrary. */}
        <Text style={[typography.amountMono, styles.amount, { color: colors.text }]}>
          {formatAmount(transfer.amount, transfer.currencyCode)}
        </Text>
        {transfer.isCrossCurrency && (
          <Text
            style={[typography.amountMono, styles.convertedAmount, { color: colors.textSecondary }]}>
            → {formatAmount(transfer.toAmount, transfer.toCurrencyCode)}
          </Text>
        )}
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
  rowSubtitle: {
    fontSize: scaleFont(12.5),
    marginTop: 2,
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
  rowActions: {
    alignItems: 'flex-end',
    gap: 6,
  },
  amount: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  convertedAmount: {
    fontSize: scaleFont(12.5),
    fontWeight: '600',
    marginTop: -2,
  },
  deleteButton: {
    padding: 2,
  },
});

export default TransferRow;
