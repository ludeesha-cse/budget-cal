import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PiggyBank } from 'lucide-react-native';
import Card from '../Card';
import ProgressBar from '../common/ProgressBar';
import GoalDetails from './GoalDetails';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont, typography } from '../../theme/typography';
import { formatAmount, formatPercent } from '../../utils/formatAmount';
import { getProgress, getRequiredPerMonth } from '../../utils/savingsMath';
import type { UseContributionFormResult, SavingsContributionRow } from '../../hooks/useContributionForm';
import type { SavingsGoalRow } from '../../hooks/useSavingsGoalsData';

type Props = {
  goal: SavingsGoalRow;
  today: string;
  expanded: boolean;
  contributions: SavingsContributionRow[] | undefined;
  onToggleExpand: () => void;
  contributionForm: UseContributionFormResult;
  onEditGoal: () => void;
  onSetStatus: (status: 'active' | 'achieved' | 'abandoned') => void;
  onDeleteGoal: () => void;
};

// The single largest JSX block in the codebase before this refactor —
// card header (icon/name/status/amount/percent-funded pill), progress
// bar, target-date meta line, the Details toggle, and (when expanded)
// GoalDetails.
function GoalCard({
  goal,
  today,
  expanded,
  contributions,
  onToggleExpand,
  contributionForm,
  onEditGoal,
  onSetStatus,
  onDeleteGoal,
}: Props): React.JSX.Element {
  const { colors } = useTheme();

  const progress = getProgress(goal.totalContributed, goal.targetAmount);
  const progressPct = progress * 100;
  const remaining = goal.targetAmount - goal.totalContributed;
  const requiredPerMonth = goal.targetDate
    ? getRequiredPerMonth(remaining, goal.targetDate, today)
    : undefined;
  const funded = progressPct >= 100;

  return (
    <Card colors={colors} style={styles.card}>
      <View style={styles.goalHeader}>
        <View style={[styles.goalIcon, { backgroundColor: colors.primarySoft }]}>
          <PiggyBank size={16} color={colors.primary} />
        </View>
        <View style={styles.goalHeaderText}>
          <Text style={[styles.goalName, { color: colors.text }]} numberOfLines={1}>
            {goal.name}
            {goal.status !== 'active' && (
              <Text style={[styles.goalStatusTag, { color: colors.textSecondary }]}>
                {' '}
                ({goal.status})
              </Text>
            )}
          </Text>
          <Text style={[typography.amountMono, styles.goalAmount, { color: colors.text }]}>
            {formatAmount(goal.totalContributed, goal.currencyCode)}{' '}
            <Text style={[styles.goalAmountOf, { color: colors.textSecondary }]}>
              of {formatAmount(goal.targetAmount, goal.currencyCode, { hideCode: true })}
            </Text>
          </Text>
        </View>
        <View
          style={[
            styles.fundedPill,
            { backgroundColor: funded ? colors.successSoft : colors.neutralSoft },
          ]}>
          <Text
            style={[
              typography.amountMono,
              styles.fundedPillText,
              { color: funded ? colors.success : colors.text },
            ]}>
            {formatPercent(progressPct)}
          </Text>
        </View>
      </View>

      <ProgressBar
        percent={progressPct}
        color={funded ? colors.success : colors.primary}
        height={8}
        style={styles.progressBarBg}
      />

      {goal.targetDate ? (
        requiredPerMonth === null ? (
          <Text style={[styles.overdueText, { color: colors.danger }]}>
            Overdue — target date {goal.targetDate} has passed
          </Text>
        ) : (
          <Text style={[styles.goalMeta, { color: colors.textSecondary }]}>
            Target {goal.targetDate} — {formatAmount(requiredPerMonth ?? 0, goal.currencyCode)}/month needed
          </Text>
        )
      ) : (
        <Text style={[styles.goalMeta, { color: colors.textSecondary }]}>No target date set</Text>
      )}

      <Pressable onPress={onToggleExpand}>
        <Text style={[styles.detailsLink, { color: colors.primary }]}>
          {expanded ? 'Hide details' : 'Details'}
        </Text>
      </Pressable>

      {expanded && (
        <GoalDetails
          goal={goal}
          contributions={contributions}
          contributionForm={contributionForm}
          onEditGoal={onEditGoal}
          onSetStatus={onSetStatus}
          onDeleteGoal={onDeleteGoal}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    marginBottom: 12,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  goalIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  goalHeaderText: {
    flex: 1,
  },
  goalName: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  goalStatusTag: {
    fontWeight: '400',
    fontSize: scaleFont(13),
  },
  goalAmount: {
    fontSize: scaleFont(14),
    marginTop: 2,
  },
  goalAmountOf: {
    fontWeight: '400',
  },
  fundedPill: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginLeft: 8,
  },
  fundedPillText: {
    fontSize: scaleFont(13),
  },
  goalMeta: {
    fontSize: scaleFont(12.5),
    marginTop: 8,
  },
  progressBarBg: {
    marginTop: 10,
  },
  detailsLink: {
    marginTop: 10,
    fontWeight: '600',
    fontSize: scaleFont(13),
  },
  overdueText: {
    fontWeight: '600',
    fontSize: scaleFont(12.5),
    marginTop: 8,
  },
});

export default GoalCard;
