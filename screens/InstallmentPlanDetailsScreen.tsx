import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Card from '../components/Card';
import EmptyState from '../components/common/EmptyState';
import ProgressBar from '../components/common/ProgressBar';
import InstallmentHistoryList from '../components/installments/InstallmentHistoryList';
import InstallmentOccurrenceHistoryList from '../components/installments/InstallmentOccurrenceHistoryList';
import { useTheme } from '../contexts/ThemeContext';
import { scaleFont, typography } from '../theme/typography';
import { formatAmount } from '../utils/formatAmount';
import { ordinalSuffix } from '../utils/dateUtils';
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useInstallmentPlansData } from '../hooks/useInstallmentPlansData';
import type { InstallmentPaymentRow } from '../hooks/useInstallmentPlansData';
import type { SettingsStackParamList } from '../navigation/types';
import { useUnpayInstallment as useUnpayInstallmentMutation } from '../hooks/queries';
import { FAB_CLEARANCE } from '../theme/layout';

type Props = NativeStackScreenProps<
  SettingsStackParamList,
  'InstallmentPlanDetails'
>;

// One plan's own screen: what has been paid, what is still scheduled, and
// the per-payment corrections.
//
// WHY A SCREEN RATHER THAN THE CARD IT USED TO EXPAND INSIDE: a plan with
// twelve payments and twelve scheduled occurrences is two dozen rows, and
// unfolding that inside a list card pushed every other plan off screen
// while leaving each row too cramped to carry its own controls. Given
// its own screen the history can breathe, and each row can offer the
// action that actually fits it.
//
// UNDO vs EDIT, per row — the rule the whole feature turns on: a
// scheduled payment's amount belongs to the PLAN, so the only honest
// correction is to take the whole payment back and pay again (Undo). A
// "Pay custom" payment's amount was always the user's own number, so it
// can simply be corrected, and its edit lives in History where every
// other editable money row already is.
function InstallmentPlanDetailsScreen({
  route,
  navigation,
}: Props): React.JSX.Element {
  const { planId } = route.params;
  const { colors } = useTheme();
  const confirmDelete = useConfirmDelete();
  const runAction = useAsyncAction();
  const unpayInstallment = useUnpayInstallmentMutation();

  // Reuses the list screen's own data hook rather than a per-plan one:
  // every query behind it is cached and already warm from the screen the
  // user just came from, so this costs no extra reads.
  const {
    plans,
    paymentsByPlan,
    expandedOccurrences,
    paidCountFor,
    remainingFor,
    loading,
  } = useInstallmentPlansData(planId);
  const plan = plans.find(item => item.id === planId);
  const payments = paymentsByPlan[planId] ?? [];

  React.useEffect(() => {
    if (plan) {
      navigation.setOptions({ title: plan.name });
    }
  }, [navigation, plan]);

  const handleUndo = (payment: InstallmentPaymentRow) => {
    confirmDelete(
      'Undo payment',
      `Undo installment ${payment.installmentNumber}? This deletes its transaction and restores the account balance.`,
      'Undo',
      () =>
        runAction(async () => {
          await unpayInstallment(payment.id);
        }, 'Cannot undo payment'),
    );
  };

  if (loading && !plan) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <EmptyState message="Loading..." />
      </View>
    );
  }

  if (!plan) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <EmptyState message="This plan no longer exists." />
      </View>
    );
  }

  const paidCount = paidCountFor(plan.id);
  const percent = (paidCount / plan.numberOfMonths) * 100;
  const isFullyPaid = paidCount >= plan.numberOfMonths;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}>
      <Card colors={colors} style={styles.summaryCard}>
        <Text style={[typography.cardTitle, { color: colors.text }]}>
          {plan.name}
        </Text>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          {plan.categoryName} · {plan.currencyCode}
          {plan.dueDayOfMonth != null &&
            ` · Due ${plan.dueDayOfMonth}${ordinalSuffix(plan.dueDayOfMonth)}`}
        </Text>
        <ProgressBar
          percent={percent}
          color={isFullyPaid ? colors.success : colors.primary}
          style={styles.progress}
        />
        <Text style={[typography.amountMono, styles.summaryLine, { color: colors.text }]}>
          Paid {paidCount} of {plan.numberOfMonths}
        </Text>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          Remaining {formatAmount(remainingFor(plan), plan.currencyCode)} of{' '}
          {formatAmount(plan.totalRepayable, plan.currencyCode, { hideCode: true })}
        </Text>
      </Card>

      <Text style={[typography.cardTitle, styles.heading, { color: colors.text }]}>
        Payments
      </Text>
      <Card colors={colors} style={styles.listCard}>
        <InstallmentHistoryList
          payments={payments}
          currencyCode={plan.currencyCode}
          onUndo={handleUndo}
        />
      </Card>

      <Text style={[typography.cardTitle, styles.heading, { color: colors.text }]}>
        Schedule
      </Text>
      <Card colors={colors} style={styles.listCard}>
        <InstallmentOccurrenceHistoryList
          occurrences={expandedOccurrences}
          currencyCode={plan.currencyCode}
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: FAB_CLEARANCE,
  },
  summaryCard: {
    padding: 14,
  },
  listCard: {
    padding: 14,
  },
  heading: {
    marginTop: 20,
    marginBottom: 10,
  },
  meta: {
    fontSize: scaleFont(12.5),
    marginTop: 4,
  },
  summaryLine: {
    fontSize: scaleFont(14),
    marginTop: 10,
  },
  progress: {
    marginTop: 12,
  },
});

export default InstallmentPlanDetailsScreen;
