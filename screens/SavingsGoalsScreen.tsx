import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Plus } from 'lucide-react-native';
import type { SettingsStackParamList } from '../navigation/types';
import BottomSheetModal from '../components/BottomSheetModal';
import NumericInputAccessory from '../components/NumericInputAccessory';
import EmptyState from '../components/common/EmptyState';
import LoadErrorState from '../components/common/LoadErrorState';
import InfoBanner from '../components/common/InfoBanner';
import SegmentedToggle, {
  type SegmentedToggleOption,
} from '../components/common/SegmentedToggle';
import GoalCard from '../components/savingsGoals/GoalCard';
import GoalFormFields from '../components/savingsGoals/GoalFormFields';
import TransferToGoalForm from '../components/savingsGoals/TransferToGoalForm';
import { scaleFont } from '../theme/typography';
import { useTheme } from '../contexts/ThemeContext';
import {
  useSavingsGoalsData,
  type SavingsGoalFilter,
} from '../hooks/useSavingsGoalsData';
import { useSavingsGoalForm } from '../hooks/useSavingsGoalForm';
import { useSavingsTransferForm } from '../hooks/useSavingsTransferForm';
import { getCurrentDateString } from '../utils/date';
import { FAB_CLEARANCE } from '../theme/layout';

const FILTER_OPTIONS: SegmentedToggleOption<SavingsGoalFilter>[] = [
  { key: 'active', label: 'Active' },
  { key: 'history', label: 'Achieved / Abandoned' },
];

type Props = NativeStackScreenProps<SettingsStackParamList, 'SavingsGoals'>;

function SavingsGoalsScreen({ navigation }: Props): React.JSX.Element {
  // Write paths go through the caching layer's mutation hooks: each
  // one runs the same db/queries function as before and then
  // invalidates every query its write can affect (see
  // hooks/queries/invalidation.ts). The call sites below are
  // unchanged — these hooks take the wrapped function's own arguments.
  const { colors } = useTheme();

  const {
    currencies,
    accountOptions,
    loading,
    loadFailed,
    retry,
    filter,
    setFilter,
    visibleGoals,
  } = useSavingsGoalsData();

  const goalForm = useSavingsGoalForm(currencies, accountOptions);

  // No onSaved callback any more: the funding history now lives on the
  // goal's own screen behind a cached query, which the savings transfer
  // mutation already invalidates. The old lazily-fetched per-card list
  // sat outside the query cache and was the only reason this needed a
  // manual refresh.
  const transferForm = useSavingsTransferForm(accountOptions);
  const transferGoal =
    visibleGoals.find(goal => goal.id === transferForm.openForGoalId) ?? null;

  const today = getCurrentDateString();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* This note used to say the opposite — that contributions never
          move money. Goals are now backed by a real account and funded by
          real transfers, so it has to say so; leaving the old wording
          would have been the single most misleading sentence in the app. */}
      <InfoBanner>
        Each goal saves into a real account. Transfer money in to build it up —
        and if you spend from that account, the goal drops to what's actually
        left, then recovers when you put money back.
      </InfoBanner>

      <SegmentedToggle
        options={FILTER_OPTIONS}
        value={filter}
        onChange={setFilter}
      />

      <Pressable
        style={[styles.addGoalButton, { borderColor: colors.primary }]}
        onPress={goalForm.openAdd}>
        <Plus size={16} color={colors.primary} strokeWidth={2.5} />
        <Text style={[styles.addGoalButtonText, { color: colors.primary }]}>
          Add Goal
        </Text>
      </Pressable>

      {loadFailed ? (
        <LoadErrorState what="your savings goals" onRetry={retry} />
      ) : loading ? (
        <EmptyState message="Loading..." />
      ) : (
        <FlatList
          data={visibleGoals}
          keyExtractor={item => String(item.id)}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          renderItem={({ item: goal }) => (
            <GoalCard
              goal={goal}
              today={today}
              onAddMoney={() => transferForm.open(goal)}
              onEditGoal={() => goalForm.openEdit(goal)}
              onOpenDetails={() =>
                navigation.navigate('SavingsGoalDetails', { goalId: goal.id })
              }
            />
          )}
          ListEmptyComponent={
            <EmptyState
              message={
                filter === 'active'
                  ? 'No active savings goals yet.'
                  : 'No achieved or abandoned goals yet.'
              }
            />
          }
        />
      )}

      <BottomSheetModal
        visible={goalForm.visible}
        onClose={goalForm.close}
        onSave={goalForm.submit}
        canSave={goalForm.canSave}
        title={goalForm.editingId ? 'Edit Goal' : 'New Savings Goal'}
        saveLabel={goalForm.editingId ? 'Save' : 'Create'}>
        <GoalFormFields form={goalForm} currencies={currencies} />
        <NumericInputAccessory />
      </BottomSheetModal>

      {/* "Add money", hosted here rather than inside the card it is
          pressed from: a bottom sheet belongs at the top of the screen's
          tree, and one sheet serves every card in the list. The form
          itself only ever had one host, so it no longer carries its own
          buttons — the sheet's footer is the only Cancel/Save. */}
      <BottomSheetModal
        visible={transferForm.openForGoalId != null}
        onClose={transferForm.close}
        onSave={transferForm.submit}
        canSave={transferForm.canSave}
        saving={transferForm.submitting}
        title={transferGoal ? `Add money — ${transferGoal.name}` : undefined}
        saveLabel="Add money">
        {transferGoal && (
          <TransferToGoalForm goal={transferGoal} form={transferForm} />
        )}
        <NumericInputAccessory />
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  addGoalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 12,
  },
  addGoalButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  list: {
    marginTop: 12,
  },
  // Lets the last row scroll out from under the FAB.
  listContent: {
    paddingBottom: FAB_CLEARANCE,
  },
});

export default SavingsGoalsScreen;
