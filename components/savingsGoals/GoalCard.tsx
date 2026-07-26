import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  AlertTriangle,
  ChevronRight,
  PiggyBank,
  Plus,
  Wallet,
} from 'lucide-react-native';
import Card from '../Card';
import ProgressBar from '../common/ProgressBar';
import ActionButtons, { type ActionButtonItem } from '../common/ActionButtons';
import { Pencil } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont, typography } from '../../theme/typography';
import { formatAmount, formatPercent } from '../../utils/formatAmount';
import { getProgress, getRequiredPerMonth } from '../../utils/savingsMath';
import type { SavingsGoalRow } from '../../hooks/useSavingsGoalsData';

type Props = {
  goal: SavingsGoalRow;
  today: string;
  onAddMoney: () => void;
  onEditGoal: () => void;
  onOpenDetails: () => void;
};

// Card header (icon/name/status/amount/percent-funded pill), progress
// bar, target-date meta line, and the two actions worth reaching for
// every time.
//
// WHAT MOVED, AND WHY. "Add money" used to be buried two taps deep,
// inside an expanded Details section — the single most common thing
// anyone does with a savings goal, hidden behind the least common.
// It is now the card's primary button. Everything rare (mark achieved,
// abandon, delete) and everything long (the funding history) moved the
// other way, onto the goal's own screen, where a history row has room to
// carry its own edit and remove controls.
function GoalCard({
  goal,
  today,
  onAddMoney,
  onEditGoal,
  onOpenDetails,
}: Props): React.JSX.Element {
  const { colors } = useTheme();

  // goal.totalContributed is ALREADY the capped figure — what the
  // backing account can actually cover, after sharing it with any older
  // goals on the same account (see allocateGoalSavings). goal.rawContributed
  // is what was transferred in. Everything on this card reads the capped
  // number, because that is the money that is genuinely still there.
  const progress = getProgress(goal.totalContributed, goal.targetAmount);
  const progressPct = progress * 100;
  const remaining = goal.targetAmount - goal.totalContributed;
  const requiredPerMonth = goal.targetDate
    ? getRequiredPerMonth(remaining, goal.targetDate, today)
    : undefined;
  const funded = progressPct >= 100;
  const canAddMoney = goal.status === 'active' && !goal.needsAccount;

  const actionItems: ActionButtonItem[] = [];
  if (canAddMoney) {
    actionItems.push({
      key: 'add',
      icon: Plus,
      label: 'Add money',
      solid: true,
      grow: true,
      onPress: onAddMoney,
    });
  }
  actionItems.push({ key: 'edit', icon: Pencil, onPress: onEditGoal });

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

      {/* Where the money lives, and — when the account can no longer
          cover what was put in — why the number dropped. Saying it on
          the card is the difference between a goal that looks broken and
          one that is explaining itself. */}
      <View style={styles.accountLine}>
        {goal.needsAccount ? (
          <AlertTriangle size={12} color={colors.danger} />
        ) : (
          <Wallet size={12} color={colors.textSecondary} />
        )}
        <Text
          style={[
            styles.goalMetaInline,
            { color: goal.needsAccount ? colors.danger : colors.textSecondary },
          ]}
          numberOfLines={1}>
          {goal.needsAccount
            ? 'No open account holds this goal — edit it and choose one'
            : `Saved in ${goal.accountName}`}
        </Text>
      </View>

      {goal.isCapped && !goal.needsAccount && (
        <Text style={[styles.cappedText, { color: colors.warning }]}>
          {formatAmount(goal.rawContributed, goal.currencyCode)} was
          transferred in, but {goal.accountName} only holds{' '}
          {formatAmount(goal.accountBalance, goal.currencyCode)} now. Put money
          back in and this goes straight back up.
        </Text>
      )}

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

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* A goal with no usable account cannot receive money — the line
          above already says to pick one, so the button that would fail is
          simply not offered. Same for a goal that is no longer active. */}
      <ActionButtons style={styles.actionsRow} items={actionItems} />

      <Pressable style={styles.detailsRow} onPress={onOpenDetails}>
        <Text style={[styles.detailsLink, { color: colors.primary }]}>
          History &amp; settings
        </Text>
        <ChevronRight size={15} color={colors.primary} />
      </Pressable>
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
  accountLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
  },
  goalMetaInline: {
    flex: 1,
    fontSize: scaleFont(12.5),
  },
  cappedText: {
    fontSize: scaleFont(12),
    lineHeight: scaleFont(17),
    marginTop: 6,
  },
  progressBarBg: {
    marginTop: 10,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
  },
  actionsRow: {
    marginBottom: 10,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  detailsLink: {
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
