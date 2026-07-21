import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CircleDollarSign, Pencil, Trash2 } from 'lucide-react-native';
import Card from '../Card';
import ProgressRing from '../common/ProgressRing';
import ProgressBar from '../common/ProgressBar';
import ActionButtons, { type ActionButtonItem } from '../common/ActionButtons';
import InstallmentHistoryList from './InstallmentHistoryList';
import InstallmentOccurrenceHistoryList from './InstallmentOccurrenceHistoryList';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont, typography } from '../../theme/typography';
import { formatAmount } from '../../utils/formatAmount';
import { ordinalSuffix } from '../../utils/dateUtils';
import type {
  InstallmentOccurrenceRow,
  InstallmentPaymentRow,
  InstallmentPlanRow,
} from '../../hooks/useInstallmentPlansData';

type Props = {
  item: InstallmentPlanRow;
  paidCountFor: (planId: number) => number;
  nextAmountDueFor: (plan: InstallmentPlanRow) => number | null;
  remainingFor: (plan: InstallmentPlanRow) => number;
  payments: InstallmentPaymentRow[];
  // Undefined until this plan's schedule query resolves, and only ever
  // passed for the plan that is actually expanded.
  occurrences: InstallmentOccurrenceRow[] | undefined;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onPay: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onUndo: (payment: InstallmentPaymentRow) => void;
};

function InstallmentPlanCard({
  item,
  paidCountFor,
  nextAmountDueFor,
  remainingFor,
  payments,
  occurrences,
  isExpanded,
  onToggleExpand,
  onPay,
  onEdit,
  onDelete,
  onUndo,
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
  }
  actionItems.push(
    { key: 'edit', icon: Pencil, label: 'Edit', onPress: onEdit },
    { key: 'delete', icon: Trash2, label: 'Delete', tone: 'danger', onPress: onDelete },
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

      <Pressable onPress={onToggleExpand}>
        <Text style={[styles.historyLink, { color: colors.primary }]}>
          {isExpanded ? 'Hide history' : `History (${payments.length})`}
        </Text>
      </Pressable>

      {isExpanded && (
        <>
          <InstallmentHistoryList
            payments={payments}
            currencyCode={item.currencyCode}
            onUndo={onUndo}
          />
          <InstallmentOccurrenceHistoryList
            occurrences={occurrences}
            currencyCode={item.currencyCode}
          />
        </>
      )}
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
