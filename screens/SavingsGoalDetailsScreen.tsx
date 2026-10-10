import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Card from '../components/Card';
import EmptyState from '../components/common/EmptyState';
import ProgressBar from '../components/common/ProgressBar';
import ContributionRow from '../components/savingsGoals/ContributionRow';
import EditContributionModal from '../components/savingsGoals/EditContributionModal';
import { useTheme } from '../contexts/ThemeContext';
import { scaleFont, typography } from '../theme/typography';
import { formatAmount, formatPercent } from '../utils/formatAmount';
import { getProgress } from '../utils/savingsMath';
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useSavingsGoalsData } from '../hooks/useSavingsGoalsData';
import { useSavingsTransferForm } from '../hooks/useSavingsTransferForm';
import { useEditContributionModal } from '../hooks/useEditContributionModal';
import type { SettingsStackParamList } from '../navigation/types';
import {
  useContributions,
  useDeleteSavingsGoal as useDeleteSavingsGoalMutation,
  useSetSavingsGoalStatus as useSetSavingsGoalStatusMutation,
} from '../hooks/queries';
import { FAB_CLEARANCE } from '../theme/layout';

type Props = NativeStackScreenProps<
  SettingsStackParamList,
  'SavingsGoalDetails'
>;

// One goal's own screen: what has gone in, and the decisions about the
// goal itself that are made once or twice in its lifetime.
//
// WHY THE SPLIT LANDS HERE. The card keeps what is used constantly —
// Add money, and a quick edit — while everything a user touches rarely
// (mark achieved, abandon, reactivate, delete) moved here. That is the
// same reason the funding history moved: expanded inside a card it
// crowded out every other goal and left no room for a row to carry its
// own controls, which is precisely what a correctable history needs.
function SavingsGoalDetailsScreen({
  route,
  navigation,
}: Props): React.JSX.Element {
  const { goalId } = route.params;
  const { colors } = useTheme();
  const confirmDelete = useConfirmDelete();
  const runAction = useAsyncAction();
  const deleteSavingsGoal = useDeleteSavingsGoalMutation();
  const setSavingsGoalStatus = useSetSavingsGoalStatusMutation();

  const { accountOptions, goals, loading } = useSavingsGoalsData();
  const goal = goals.find(item => item.id === goalId);
  const { data: contributions } = useContributions(goalId);

  const transferForm = useSavingsTransferForm(accountOptions);
  const editContribution = useEditContributionModal();

  React.useEffect(() => {
    if (goal) {
      navigation.setOptions({ title: goal.name });
    }
  }, [navigation, goal]);

  const handleSetStatus = (status: 'active' | 'achieved' | 'abandoned') => {
    if (!goal) {
      return;
    }
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
            }, 'Could not update goal'),
        },
      ],
    );
  };

  const handleDeleteGoal = () => {
    if (!goal) {
      return;
    }
    confirmDelete(
      'Delete goal',
      `Delete "${goal.name}"? This removes the goal and its funding history.\n\nThe money itself stays exactly where it is — in ${
        goal.accountName ?? 'its account'
      } — and the transfers stay in History. Deleting a goal removes the earmark, not the money. If you just want to stop tracking it, abandon it instead.`,
      'Delete',
      () =>
        runAction(async () => {
          await deleteSavingsGoal(goal.id);
          navigation.goBack();
        }, 'Could not delete goal'),
    );
  };

  if (!goal) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <EmptyState
          message={loading ? 'Loading...' : 'This goal no longer exists.'}
        />
      </View>
    );
  }

  const progressPct = getProgress(goal.totalContributed, goal.targetAmount) * 100;
  const funded = progressPct >= 100;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}>
      <Card colors={colors} style={styles.summaryCard}>
        <Text style={[typography.cardTitle, { color: colors.text }]}>
          {goal.name}
          {goal.status !== 'active' && (
            <Text style={[styles.statusTag, { color: colors.textSecondary }]}>
              {' '}
              ({goal.status})
            </Text>
          )}
        </Text>
        <Text style={[typography.amountMono, styles.amount, { color: colors.text }]}>
          {formatAmount(goal.totalContributed, goal.currencyCode)}{' '}
          <Text style={[styles.amountOf, { color: colors.textSecondary }]}>
            of {formatAmount(goal.targetAmount, goal.currencyCode, { hideCode: true })}{' '}
            ({formatPercent(progressPct)})
          </Text>
        </Text>
        <ProgressBar
          percent={progressPct}
          color={funded ? colors.success : colors.primary}
          height={8}
          style={styles.progress}
        />
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          {goal.needsAccount
            ? 'No open account holds this goal — edit it and choose one'
            : `Saved in ${goal.accountName}`}
          {goal.targetDate ? ` · target ${goal.targetDate}` : ''}
        </Text>
      </Card>

      <Text style={[typography.cardTitle, styles.heading, { color: colors.text }]}>
        Money moved into this goal
      </Text>
      <Card colors={colors} style={styles.listCard}>
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
              onEdit={() => editContribution.open({ contribution, goal })}
              onDelete={() =>
                transferForm.handleDeleteContribution(goal, contribution)
              }
            />
          ))
        )}
      </Card>

      <Text style={[typography.cardTitle, styles.heading, { color: colors.text }]}>
        Goal
      </Text>
      <View style={styles.actions}>
        {goal.status === 'active' ? (
          <>
            <Pressable
              style={[styles.actionPill, { borderColor: colors.success }]}
              onPress={() => handleSetStatus('achieved')}>
              <Text style={[styles.actionPillText, { color: colors.success }]}>
                Mark Achieved
              </Text>
            </Pressable>
            <Pressable
              style={[styles.actionPill, { borderColor: colors.warning }]}
              onPress={() => handleSetStatus('abandoned')}>
              <Text style={[styles.actionPillText, { color: colors.warning }]}>
                Abandon
              </Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            style={[styles.actionPill, { borderColor: colors.primary }]}
            onPress={() => handleSetStatus('active')}>
            <Text style={[styles.actionPillText, { color: colors.primary }]}>
              Reactivate
            </Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.actionPill, { borderColor: colors.dangerSoft }]}
          onPress={handleDeleteGoal}>
          <Text style={[styles.actionPillText, { color: colors.danger }]}>
            Delete
          </Text>
        </Pressable>
      </View>

      <EditContributionModal modal={editContribution} />
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
  statusTag: {
    fontWeight: '400',
  },
  amount: {
    fontSize: scaleFont(15),
    marginTop: 6,
  },
  amountOf: {
    fontWeight: '400',
  },
  progress: {
    marginTop: 10,
  },
  meta: {
    fontSize: scaleFont(12.5),
    marginTop: 8,
  },
  actions: {
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

export default SavingsGoalDetailsScreen;
