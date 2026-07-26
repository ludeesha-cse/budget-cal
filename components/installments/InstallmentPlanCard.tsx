import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ChevronRight,
  CircleDollarSign,
  Pencil,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react-native';
import Card from '../Card';
import ProgressRing from '../common/ProgressRing';
import ProgressBar from '../common/ProgressBar';
import ActionButtons, { type ActionButtonItem } from '../common/ActionButtons';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont, typography } from '../../theme/typography';
import { formatAmount } from '../../utils/formatAmount';
import { ordinalSuffix } from '../../utils/dateUtils';
import type {
  InstallmentPaymentRow,
  InstallmentPlanRow,
} from '../../hooks/useInstallmentPlansData';

type Props = {
  item: InstallmentPlanRow;
  paidCountFor: (planId: number) => number;
  nextAmountDueFor: (plan: InstallmentPlanRow) => number | null;
  remainingFor: (plan: InstallmentPlanRow) => number;
  payments: InstallmentPaymentRow[];
  onPay: () => void;
  onPayCustom: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenDetails: () => void;
};

// One plan's summary and its everyday actions.
//
// The payment history and the schedule used to unfold inside this card;
// they now live on the plan's own screen. Twelve payments plus twelve
// scheduled months is two dozen rows, which pushed every other plan out
// of view and left each row too cramped to carry the undo control that
// makes a history useful in the first place.
function InstallmentPlanCard({
  item,
  paidCountFor,
  nextAmountDueFor,
  remainingFor,
  payments,
  onPay,
  onPayCustom,
  onEdit,
  onDelete,
  onOpenDetails,
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  const paidCount = paidCountFor(item.id);
  const isFullyPaid = paidCount >= item.numberOfMonths;
  const nextAmountDue = nextAmountDueFor(item);
  const remaining = remainingFor(item);
  const percent = (paidCount / item.numberOfMonths) * 100;
  const ringColor = isFullyPaid ? colors.success : colors.primary;

  const actionItems: ActionButtonItem[] = [];
  if (!isFullyPaid) {
    actionItems.push({
      key: 'pay',
      icon: CircleDollarSign,
      label: 'Pay Next',
      solid: true,
      grow: true,
      onPress: onPay,
    });
    // Paying early, rounding up to clear the plan sooner, or paying part
    // of a month now. It still answers the next installment — only the
    // amount differs — which is why it sits beside Pay Next rather than
    // pretending to be a different kind of payment.
    actionItems.push({
      key: 'payCustom',
      icon: SlidersHorizontal,
      label: 'Pay custom',
      onPress: onPayCustom,
    });
  }
  // Icons without labels: both actions are universally understood, and
  // the words were costing the row the space Pay custom now uses.
  actionItems.push(
    { key: 'edit', icon: Pencil, onPress: onEdit },
    { key: 'delete', icon: Trash2, tone: 'danger', onPress: onDelete },
  );

  return (
    <Card colors={colors} style={styles.planCard}>
      <View style={styles.planHeader}>
        <ProgressRing
          percent={percent}
          size={52}
          strokeWidth={5}
          trackColor={colors.border}
          fillColor={ringColor}
          label={`${Math.round(percent)}%`}
          labelColor={colors.text}
        />
        <View style={styles.planHeaderText}>
          <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
            {item.categoryName} · {item.currencyCode}
            {item.dueDayOfMonth != null &&
              ` · Due ${item.dueDayOfMonth}${ordinalSuffix(item.dueDayOfMonth)}`}
          </Text>
          {isFullyPaid ? (
            <Text style={[styles.fullyPaidText, { color: colors.success }]}>
              ✓ Fully paid
            </Text>
          ) : (
            <Text style={[typography.amountMono, styles.rowLine, { color: colors.text }]}>
              Paid {paidCount} of {item.numberOfMonths} · Next{' '}
              {formatAmount(nextAmountDue ?? 0, item.currencyCode)}
            </Text>
          )}
        </View>
      </View>

      <ProgressBar percent={percent} color={ringColor} style={styles.progressTrack} />
      <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
        Remaining: {formatAmount(remaining, item.currencyCode)} of{' '}
        {formatAmount(item.totalRepayable, item.currencyCode, { hideCode: true })}
      </Text>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <ActionButtons style={styles.planActionsRow} items={actionItems} />

      <Pressable style={styles.historyRow} onPress={onOpenDetails}>
        <Text style={[styles.historyLink, { color: colors.primary }]}>
          History &amp; schedule ({payments.length})
        </Text>
        <ChevronRight size={15} color={colors.primary} />
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  planCard: {
    padding: 14,
    marginBottom: 10,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  planHeaderText: {
    flex: 1,
    marginLeft: 12,
  },
  rowName: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  rowMeta: {
    fontSize: scaleFont(12.5),
    marginTop: 2,
  },
  rowLine: {
    fontSize: scaleFont(13),
    marginTop: 4,
  },
  progressTrack: {
    marginTop: 12,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
  },
  planActionsRow: {
    marginBottom: 10,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  historyLink: {
    fontWeight: '600',
    fontSize: scaleFont(13),
  },
  fullyPaidText: {
    fontWeight: '700',
    marginTop: 4,
  },
});

export default InstallmentPlanCard;
