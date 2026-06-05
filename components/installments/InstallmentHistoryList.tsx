import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';
import { formatAmount } from '../../utils/formatAmount';
import type { InstallmentPaymentRow } from '../../hooks/useInstallmentPlansData';

type Props = {
  payments: InstallmentPaymentRow[];
  currencyCode: string;
  onUndo: (payment: InstallmentPaymentRow) => void;
};

// Only ever rendered while its plan's history is expanded (see
// InstallmentPlanCard) — "Undo" only ever appears on the latest payment,
// since unpayInstallment only ever removes the highest-numbered one.
function InstallmentHistoryList({
  payments,
  currencyCode,
  onUndo,
}: Props): React.JSX.Element {
  const { colors } = useTheme();

  if (payments.length === 0) {
    return (
      <View style={styles.historyList}>
        <Text style={{ color: colors.textSecondary }}>No payments yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.historyList}>
      {payments.map((payment, index) => {
        const isLatest = index === payments.length - 1;
        return (
          <View
            key={payment.id}
            style={[styles.historyRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.historyRowText, { color: colors.text }]}>
              #{payment.installmentNumber} — {payment.paidDate} —{' '}
              {formatAmount(payment.amount, currencyCode)} ({payment.accountName})
            </Text>
            {isLatest && (
              <Pressable
                style={[styles.undoButton, { borderColor: colors.danger }]}
                onPress={() => onUndo(payment)}>
                <Text style={[styles.undoButtonText, { color: colors.danger }]}>
                  Undo
                </Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  historyList: {
    marginTop: 8,
    gap: 4,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyRowText: {
    flex: 1,
  },
  undoButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  undoButtonText: {
    fontSize: scaleFont(12),
    fontWeight: '700',
  },
});

export default InstallmentHistoryList;
