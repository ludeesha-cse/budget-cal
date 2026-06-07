import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import AddContributionForm from './AddContributionForm';
import ContributionRow from './ContributionRow';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';
import type { UseContributionFormResult, SavingsContributionRow } from '../../hooks/useContributionForm';
import type { SavingsGoalRow } from '../../hooks/useSavingsGoalsData';

type Props = {
  goal: SavingsGoalRow;
  contributions: SavingsContributionRow[] | undefined;
  contributionForm: UseContributionFormResult;
  onEditGoal: () => void;
  onSetStatus: (status: 'active' | 'achieved' | 'abandoned') => void;
  onDeleteGoal: () => void;
};

// The expanded details section of a goal card — contribution history,
// add/edit contribution forms, and the goal-level action pills (Edit
// Goal / Mark Achieved / Abandon / Reactivate / Delete).
function GoalDetails({
  goal,
  contributions,
  contributionForm,
  onEditGoal,
  onSetStatus,
  onDeleteGoal,
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  const {
    addingContributionFor,
    contributionAmount,
    setContributionAmount,
    contributionDate,
    setContributionDate,
    contributionNote,
    setContributionNote,
    openAddContribution,
    closeAddContribution,
    submitAddContribution,
    editingContributionId,
    editAmount,
    setEditAmount,
    editDate,
    setEditDate,
    editNote,
    setEditNote,
    startEditContribution,
    cancelEditContribution,
    submitEditContribution,
    handleDeleteContribution,
  } = contributionForm;

  return (
    <View style={styles.detailsSection}>
      <Text style={[styles.subheading, { color: colors.text }]}>Contributions</Text>
      {!contributions ? (
        <Text style={{ color: colors.textSecondary }}>Loading...</Text>
      ) : contributions.length === 0 ? (
        <Text style={{ color: colors.textSecondary }}>No contributions logged yet.</Text>
      ) : (
        contributions.map(contribution => (
          <ContributionRow
            key={contribution.id}
            contribution={contribution}
            currencyCode={goal.currencyCode}
            isEditing={editingContributionId === contribution.id}
            editAmount={editAmount}
            onEditAmountChange={setEditAmount}
            editDate={editDate}
            onEditDateChange={setEditDate}
            editNote={editNote}
            onEditNoteChange={setEditNote}
            onCancelEdit={cancelEditContribution}
            onSaveEdit={() => submitEditContribution(goal.id)}
            onStartEdit={() => startEditContribution(contribution)}
            onDelete={() => handleDeleteContribution(goal.id, contribution)}
          />
        ))
      )}

      {goal.status === 'active' &&
        (addingContributionFor === goal.id ? (
          <AddContributionForm
            amount={contributionAmount}
            onAmountChange={setContributionAmount}
            date={contributionDate}
            onDateChange={setContributionDate}
            note={contributionNote}
            onNoteChange={setContributionNote}
            onCancel={closeAddContribution}
            onSubmit={() => submitAddContribution(goal.id)}
          />
        ) : (
          <Pressable
            style={[styles.addContributionButton, { borderColor: colors.primary }]}
            onPress={() => openAddContribution(goal.id)}>
            <Plus size={14} color={colors.primary} strokeWidth={2.5} />
            <Text style={[styles.addContributionButtonText, { color: colors.primary }]}>
              Add Contribution
            </Text>
          </Pressable>
        ))}

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.goalActions}>
        <Pressable style={[styles.actionPill, { borderColor: colors.border }]} onPress={onEditGoal}>
          <Text style={[styles.actionPillText, { color: colors.text }]}>Edit Goal</Text>
        </Pressable>
        {goal.status === 'active' ? (
          <>
            <Pressable
              style={[styles.actionPill, { borderColor: colors.success }]}
              onPress={() => onSetStatus('achieved')}>
              <Text style={[styles.actionPillText, { color: colors.success }]}>Mark Achieved</Text>
            </Pressable>
            <Pressable
              style={[styles.actionPill, { borderColor: colors.warning }]}
              onPress={() => onSetStatus('abandoned')}>
              <Text style={[styles.actionPillText, { color: colors.warning }]}>Abandon</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            style={[styles.actionPill, { borderColor: colors.primary }]}
            onPress={() => onSetStatus('active')}>
            <Text style={[styles.actionPillText, { color: colors.primary }]}>Reactivate</Text>
          </Pressable>
        )}
        <Pressable style={[styles.actionPill, { borderColor: colors.dangerSoft }]} onPress={onDeleteGoal}>
          <Text style={[styles.actionPillText, { color: colors.danger }]}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  detailsSection: {
    marginTop: 8,
  },
  subheading: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  addContributionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 12,
  },
  addContributionButtonText: {
    fontSize: scaleFont(13),
    fontWeight: '700',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 10,
  },
  goalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionPill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionPillText: {
    fontSize: scaleFont(12.5),
    fontWeight: '600',
  },
});

export default GoalDetails;
