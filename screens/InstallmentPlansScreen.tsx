import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Plus } from 'lucide-react-native';
import BottomSheetModal from '../components/BottomSheetModal';
import NumericInputAccessory from '../components/NumericInputAccessory';
import EmptyState from '../components/common/EmptyState';
import InstallmentPlanCard from '../components/installments/InstallmentPlanCard';
import InstallmentFormFields from '../components/installments/InstallmentFormFields';
import InstallmentPayModal from '../components/installments/InstallmentPayModal';

import { useEntitlement } from '../hooks/useEntitlement';
import { usePaywall } from '../contexts/PaywallContext';
import { useTheme } from '../contexts/ThemeContext';
import { scaleFont } from '../theme/typography';
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useInstallmentPlansData } from '../hooks/useInstallmentPlansData';
import type { InstallmentPlanRow } from '../hooks/useInstallmentPlansData';
import { useInstallmentForm } from '../hooks/useInstallmentForm';
import { useInstallmentPay, usePayPlanDeepLink } from '../hooks/useInstallmentPay';
import type { SettingsStackParamList } from '../navigation/types';
import { useDeleteInstallmentPlan as useDeleteInstallmentPlanMutation } from '../hooks/queries';
import { FAB_CLEARANCE } from '../theme/layout';

type Props = NativeStackScreenProps<SettingsStackParamList, 'InstallmentPlans'>;

// Orchestrator: wires the three Installment Plans hooks (data, the
// add/edit form, and the pay-next-installment flow) to their matching
// components. Field-level concerns all live in one of those hooks or
// components now — this file only ever decides which one to call.
function InstallmentPlansScreen({ route, navigation }: Props): React.JSX.Element {
  // Write paths go through the caching layer's mutation hooks: each
  // one runs the same db/queries function as before and then
  // invalidates every query its write can affect (see
  // hooks/queries/invalidation.ts). The call sites below are
  // unchanged — these hooks take the wrapped function's own arguments.
  const deleteInstallmentPlan = useDeleteInstallmentPlanMutation();
  const { colors } = useTheme();
  const confirmDelete = useConfirmDelete();
  const runAction = useAsyncAction();
  const { tier } = useEntitlement();
  const { openPaywall } = usePaywall();

  const data = useInstallmentPlansData();
  const {
    plans,
    categories,
    currencies,
    activeAccounts,
    paymentsByPlan,
    paidCountFor,
    remainingFor,
    nextAmountDueFor,
  } = data;

  const form = useInstallmentForm({ categories, currencies, tier, openPaywall });
  const pay = useInstallmentPay(activeAccounts);
  // The Dashboard reminder's "Pay" button always means the scheduled
  // amount — it is answering a specific month's reminder, not opening a
  // free-form payment.
  usePayPlanDeepLink(route, navigation, plans, pay.openScheduled);

  const handleDelete = (id: number) => {
    confirmDelete(
      'Delete plan',
      'Delete this installment plan? This cannot be undone.',
      'Delete',
      () =>
        runAction(async () => {
          await deleteInstallmentPlan(id);
          // No load() here any more: the mutation above already
          // invalidated every query this write affects, and awaiting it
          // waits for those refetches — a second read would be redundant.
        }, 'Cannot delete plan'),
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Pressable style={[styles.addButton, { borderColor: colors.primary }]} onPress={form.openAdd}>
        <Plus size={16} color={colors.primary} strokeWidth={2.5} />
        <Text style={[styles.addButtonText, { color: colors.primary }]}>Add Plan</Text>
      </Pressable>

      <FlatList
        data={plans}
        keyExtractor={item => String(item.id)}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }: { item: InstallmentPlanRow }) => (
          <InstallmentPlanCard
            item={item}
            paidCountFor={paidCountFor}
            nextAmountDueFor={nextAmountDueFor}
            remainingFor={remainingFor}
            payments={paymentsByPlan[item.id] ?? []}
            onPay={() => pay.openScheduled(item)}
            onPayCustom={() => pay.openCustom(item)}
            onEdit={() => form.openEdit(item)}
            onDelete={() => handleDelete(item.id)}
            onOpenDetails={() =>
              navigation.navigate('InstallmentPlanDetails', { planId: item.id })
            }
          />
        )}
        ListEmptyComponent={<EmptyState message="No installment plans yet." />}
      />

      <BottomSheetModal
        visible={form.visible}
        onClose={form.close}
        onSave={form.submit}
        canSave={form.canSave}
        title={form.editingId ? 'Edit Plan' : 'New Installment Plan'}
        saveLabel={form.editingId ? 'Save' : 'Create'}
        onFullyClosed={form.notifyFullyClosed}>
        <InstallmentFormFields form={form} categories={categories} currencies={currencies} />
        <NumericInputAccessory />
      </BottomSheetModal>

      <InstallmentPayModal
        pay={pay}
        activeAccounts={activeAccounts}
        paidCountFor={paidCountFor}
        nextAmountDueFor={nextAmountDueFor}
      />

      <NumericInputAccessory />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  list: {
    marginTop: 4,
  },
  // Lets the last row scroll out from under the FAB.
  listContent: {
    paddingBottom: FAB_CLEARANCE,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 14,
  },
  addButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
});

export default InstallmentPlansScreen;
