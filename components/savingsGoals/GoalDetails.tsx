import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowRightLeft } from 'lucide-react-native';
import ContributionRow from './ContributionRow';
import TransferToGoalForm from './TransferToGoalForm';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';
import type {
  SavingsContributionRow,
  UseSavingsTransferFormResult,
} from '../../hooks/useSavingsTransferForm';
import type { SavingsGoalRow } from '../../hooks/useSavingsGoalsData';

type Props = {
  goal: SavingsGoalRow;
  contributions: SavingsContributionRow[] | undefined;
  transferForm: UseSavingsTransferFormResult;
  onEditGoal: () => void;
  onSetStatus: (status: 'active' | 'achieved' | 'abandoned') => void;
  onDeleteGoal: () => void;
};

// The expanded details section of a goal card — funding history, the
// Transfer & Save form, and the goal-level action pills (Edit Goal /
// Mark Achieved / Abandon / Reactivate / Delete).
function GoalDetails({
  goal,
  contributions,
  transferForm,
  onEditGoal,
  onSetStatus,
  onDeleteGoal,
}: Props): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <View style={styles.detailsSection}>
      <Text style={[styles.subheading, { color: colors.text }]}>
        Money moved into this goal
      </Text>
      {!contributions ? (
        <Text style={{ color: colors.textSecondary }}>Loading...</Text>
      ) : contributions.length === 0 ? (
        <Text style={{ color: colors.textSecondary }}>
          Nothing transferred in yet.
        </Text>
      ) : (
        contributions.map(contribution => (
          <ContributionRow
            key={contribution.id}
            contribution={contribution}
            currencyCode={goal.currencyCode}
            onDelete={() => transferForm.handleDeleteContribution(goal, contribution)}
          />
        ))
      )}

      {/* A goal with no usable account can't receive money — the card
          above already tells the user to pick one, so the button that
          would fail is simply not offered. */}
      {goal.status === 'active' &&
        !goal.needsAccount &&
        (transferForm.openForGoalId === goal.id ? (
          <TransferToGoalForm goal={goal} form={transferForm} />
        ) : (
          <Pressable
            style={[styles.addContributionButton, { borderColor: colors.primary }]}
            onPress={() => transferForm.open(goal)}>
            <ArrowRightLeft size={14} color={colors.primary} strokeWidth={2.5} />
            <Text style={[styles.addContributionButtonText, { color: colors.primary }]}>
              Transfer &amp; Save
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
