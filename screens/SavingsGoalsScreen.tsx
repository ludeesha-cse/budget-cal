import React from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Info, Plus } from 'lucide-react-native';
import BottomSheetModal from '../components/BottomSheetModal';
import NumericInputAccessory from '../components/NumericInputAccessory';
import EmptyState from '../components/common/EmptyState';
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
import { useContributionForm } from '../hooks/useContributionForm';
import {
  deleteSavingsGoal,
  getContributions,
  setSavingsGoalStatus,
} from '../db/queries';
import { getCurrentDateString } from '../utils/date';

const FILTER_OPTIONS: SegmentedToggleOption<SavingsGoalFilter>[] = [
  { key: 'active', label: 'Active' },
  { key: 'history', label: 'Achieved / Abandoned' },
];

function SavingsGoalsScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const confirmDelete = useConfirmDelete();
  const runAction = useAsyncAction();

  const { currencies, loading, filter, setFilter, visibleGoals, reload } =
    useSavingsGoalsData();

  // Contribution history is fetched lazily on first expand — most goals
  // will never be expanded in a given session. `refresh` re-fetches one
  // goal's contributions without collapsing it, needed because the
  // add/edit/delete contribution controls live inside the expanded
  // section itself.
  const contributionsDetail = useLazyExpandableDetail(getContributions);

  const goalForm = useSavingsGoalForm(currencies, reload);

  const contributionForm = useContributionForm(async (goalId: number) => {
    await Promise.all([reload(), contributionsDetail.refresh(goalId)]);
  });

  // Doesn't cleanly fit useSavingsGoalsData/useSavingsGoalForm/
  // useContributionForm, so — mirroring AccountsScreen's and
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
              await reload();
            }, 'Could not update goal'),
        },
      ],
    );
  };

  const handleDeleteGoal = (goal: SavingsGoalRow) => {
    // Steers toward Abandon first — deletion also removes every
    // contribution ever logged against this goal, with no undo.
    confirmDelete(
      'Delete goal',
      `Delete "${goal.name}"? This permanently removes it and its entire contribution history. If you just want to stop tracking it, abandon it instead. This cannot be undone.`,
      'Delete',
      () =>
        runAction(async () => {
          await deleteSavingsGoal(goal.id);
          await reload();
        }, 'Could not delete goal'),
    );
  };

  const today = getCurrentDateString();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.infoBanner, { backgroundColor: colors.primarySoft }]}>
        <Info size={14} color={colors.primary} />
        <Text style={[styles.infoBannerText, { color: colors.text }]}>
          Contributions track progress toward a goal — they don't move
          money. Your money stays in your real accounts until you actually
          spend it.
        </Text>
      </View>

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
              contributionForm={contributionForm}
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
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  infoBannerText: {
    flex: 1,
    fontSize: scaleFont(12.5),
    lineHeight: scaleFont(18),
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
