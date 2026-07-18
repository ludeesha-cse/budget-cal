import React from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import BottomSheetModal from '../components/BottomSheetModal';
import NumericInputAccessory from '../components/NumericInputAccessory';
import EmptyState from '../components/common/EmptyState';
import InfoBanner from '../components/common/InfoBanner';
import SegmentedToggle, {
  type SegmentedToggleOption,
} from '../components/common/SegmentedToggle';
import GoalCard from '../components/savingsGoals/GoalCard';
import GoalFormFields from '../components/savingsGoals/GoalFormFields';
import { scaleFont } from '../theme/typography';
import { useTheme } from '../contexts/ThemeContext';
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useLazyExpandableDetail } from '../hooks/useLazyExpandableDetail';
import {
  useSavingsGoalsData,
  type SavingsGoalFilter,
  type SavingsGoalRow,
} from '../hooks/useSavingsGoalsData';
import { useSavingsGoalForm } from '../hooks/useSavingsGoalForm';
import { useSavingsTransferForm } from '../hooks/useSavingsTransferForm';
import {
  getContributions,
} from '../db/queries';
import { getCurrentDateString } from '../utils/date';
import {
  useDeleteSavingsGoal as useDeleteSavingsGoalMutation,
  useSetSavingsGoalStatus as useSetSavingsGoalStatusMutation,
} from '../hooks/queries';

const FILTER_OPTIONS: SegmentedToggleOption<SavingsGoalFilter>[] = [
  { key: 'active', label: 'Active' },
  { key: 'history', label: 'Achieved / Abandoned' },
];

function SavingsGoalsScreen(): React.JSX.Element {
  // Write paths go through the caching layer's mutation hooks: each
  // one runs the same db/queries function as before and then
  // invalidates every query its write can affect (see
  // hooks/queries/invalidation.ts). The call sites below are
  // unchanged — these hooks take the wrapped function's own arguments.
  const deleteSavingsGoal = useDeleteSavingsGoalMutation();
  const setSavingsGoalStatus = useSetSavingsGoalStatusMutation();
  const { colors } = useTheme();
  const confirmDelete = useConfirmDelete();
  const runAction = useAsyncAction();

  const {
    currencies,
    accountOptions,
    loading,
    filter,
    setFilter,
    visibleGoals,
  } = useSavingsGoalsData();

  const contributionsDetail = useLazyExpandableDetail(getContributions);

  const goalForm = useSavingsGoalForm(currencies, accountOptions);

  // The goal list and the account balances are refreshed by the savings
  // transfer mutation's own invalidation; the only thing left for this
  // callback is the expanded row's lazily-fetched funding history, which
  // sits outside the query cache (see useLazyExpandableDetail).
  const transferForm = useSavingsTransferForm(
    accountOptions,
    async (goalId: number) => {
      await contributionsDetail.refresh(goalId);
    },
  );

  // Doesn't cleanly fit useSavingsGoalsData/useSavingsGoalForm/
  // useSavingsTransferForm, so — mirroring AccountsScreen's and
  // InstallmentPlansScreen's own orchestrator-level delete handlers —
  // this stays here rather than being forced into an unrelated hook.
  const handleSetStatus = (
    goal: SavingsGoalRow,
    status: 'active' | 'achieved' | 'abandoned',
  ) => {
    Alert.alert(
      status === 'achieved'
        ? 'Mark as achieved?'
        : status === 'abandoned'
          ? 'Abandon this goal?'
          : 'Reactivate this goal?',
      `"${goal.name}" will move to ${
        status === 'active' ? 'your active goals' : status
      }. Its contribution history is kept either way.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () =>
            runAction(async () => {
              await setSavingsGoalStatus(goal.id, status);
              // No reload() here any more: the mutation above already
              // invalidated every query this write affects, and awaiting it
              // waits for those refetches — a second read would be redundant.
            }, 'Could not update goal'),
        },
      ],
    );
  };

  const handleDeleteGoal = (goal: SavingsGoalRow) => {
    confirmDelete(
      'Delete goal',
      `Delete "${goal.name}"? This removes the goal and its funding history.\n\nThe money itself stays exactly where it is — in ${
        goal.accountName ?? 'its account'
      } — and the transfers stay in History. Deleting a goal removes the earmark, not the money. If you just want to stop tracking it, abandon it instead.`,
      'Delete',
      () =>
        runAction(async () => {
          await deleteSavingsGoal(goal.id);
        // No reload() here any more: the mutation above already
        // invalidated every query this write affects, and awaiting it
        // waits for those refetches — a second read would be redundant.
        }, 'Could not delete goal'),
    );
  };

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

      {loading ? (
        <EmptyState message="Loading..." />
      ) : (
        <FlatList
          data={visibleGoals}
          keyExtractor={item => String(item.id)}
          style={styles.list}
          renderItem={({ item: goal }) => (
            <GoalCard
              goal={goal}
              today={today}
              expanded={contributionsDetail.expandedId === goal.id}
              contributions={contributionsDetail.dataById[goal.id]}
              onToggleExpand={() => contributionsDetail.toggle(goal.id)}
              transferForm={transferForm}
              onEditGoal={() => goalForm.openEdit(goal)}
              onSetStatus={status => handleSetStatus(goal, status)}
              onDeleteGoal={() => handleDeleteGoal(goal)}
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
});

export default SavingsGoalsScreen;
