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
          Transfer — {transfer.fromAccountName} → {transfer.toAccountName}
        </Text>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { borderColor: colors.border }]}>
            <Text style={[typography.eyebrow, styles.badgeText, { color: colors.textSecondary }]}>
              TRANSFER
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.rowActions}>
        <Text style={[typography.amountMono, styles.amount, { color: colors.text }]}>
          {formatAmount(transfer.amount, transfer.currencyCode)}
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
  deleteButton: {
    padding: 2,
  },
});

export default TransferRow;
