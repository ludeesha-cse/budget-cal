import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Info, PiggyBank, Plus } from 'lucide-react-native';
import Card from '../components/Card';
import CollapsiblePicker from '../components/CollapsiblePicker';
import BottomSheetModal from '../components/BottomSheetModal';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from '../components/NumericInputAccessory';
import EmptyState from '../components/common/EmptyState';
import SegmentedToggle, {
  type SegmentedToggleOption,
} from '../components/common/SegmentedToggle';
import DateField from '../components/common/DateField';
import ProgressBar from '../components/common/ProgressBar';
import { scaleFont, typography } from '../theme/typography';
import {
  addContribution,
  createSavingsGoal,
  deleteContribution,
  deleteSavingsGoal,
  getContributions,
  getCurrencies,
  getSavingsGoals,
  setSavingsGoalStatus,
  updateContribution,
  updateSavingsGoal,
  type NewSavingsGoalParams,
} from '../db/queries';
import { getProgress, getRequiredPerMonth } from '../utils/savingsMath';
import { getCurrentDateString } from '../utils/date';
import { useTheme } from '../contexts/ThemeContext';

const FILTER_OPTIONS: SegmentedToggleOption<'active' | 'history'>[] = [
  { key: 'active', label: 'Active' },
  { key: 'history', label: 'Achieved / Abandoned' },
];

type GoalRow = Awaited<ReturnType<typeof getSavingsGoals>>[number];
type CurrencyRow = Awaited<ReturnType<typeof getCurrencies>>[number];
type ContributionRow = Awaited<ReturnType<typeof getContributions>>[number];

function SavingsGoalsScreen(): React.JSX.Element {
  const { colors } = useTheme();

  const [filter, setFilter] = useState<'active' | 'history'>('active');
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Contribution history is fetched lazily on first expand, same pattern
  // RecurringRulesScreen uses for occurrence history — most goals will
  // never be expanded in a given session.
  const [expandedGoalId, setExpandedGoalId] = useState<number | null>(null);
  const [contributionsByGoal, setContributionsByGoal] = useState<
    Record<number, ContributionRow[]>
  >({});

  // Add Goal form
  const [formVisible, setFormVisible] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<number | null>(null);
  const [goalName, setGoalName] = useState('');
  const [goalTargetAmount, setGoalTargetAmount] = useState('');
  const [goalCurrencyId, setGoalCurrencyId] = useState<number | null>(null);
  const [goalTargetDate, setGoalTargetDate] = useState<string | null>(null);
  const [goalError, setGoalError] = useState<string | null>(null);

  // Add-contribution mini-form, one goal at a time.
  const [addingContributionFor, setAddingContributionFor] = useState<
    number | null
  >(null);
  const [contributionAmount, setContributionAmount] = useState('');
  const [contributionDate, setContributionDate] = useState(
    getCurrentDateString(),
  );
  const [contributionNote, setContributionNote] = useState('');

  // Edit-contribution inline form, one row at a time.
  const [editingContributionId, setEditingContributionId] = useState<
    number | null
  >(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editNote, setEditNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [goalRows, currencyRows] = await Promise.all([
      getSavingsGoals(),
      getCurrencies(),
    ]);
    setGoals(goalRows);
    setCurrencies(currencyRows);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const reloadContributionsFor = async (goalId: number) => {
    const rows = await getContributions(goalId);
    setContributionsByGoal(current => ({ ...current, [goalId]: rows }));
  };

  const handleToggleExpand = async (goal: GoalRow) => {
    if (expandedGoalId === goal.id) {
      setExpandedGoalId(null);
      return;
    }
    setExpandedGoalId(goal.id);
    if (!(goal.id in contributionsByGoal)) {
      await reloadContributionsFor(goal.id);
    }
  };

  const resetGoalForm = () => {
    setEditingGoalId(null);
    setGoalName('');
    setGoalTargetAmount('');
    setGoalCurrencyId(
      currencies.find(c => c.isDefault)?.id ?? currencies[0]?.id ?? null,
    );
    setGoalTargetDate(null);
    setGoalError(null);
  };

  const handleAddGoalPress = () => {
    resetGoalForm();
    setFormVisible(true);
  };

  const handleEditGoalPress = (goal: GoalRow) => {
    setEditingGoalId(goal.id);
    setGoalName(goal.name);
    setGoalTargetAmount(String(goal.targetAmount));
    setGoalCurrencyId(goal.currencyId);
    setGoalTargetDate(goal.targetDate);
    setGoalError(null);
    setFormVisible(true);
  };

  const handleCancelGoalForm = () => {
    setFormVisible(false);
    resetGoalForm();
  };

  const handleSubmitGoal = async () => {
    if (!goalName.trim()) {
      setGoalError('Enter a name');
      return;
    }
    const parsedTarget = Number(goalTargetAmount);
    if (
      !goalTargetAmount ||
      Number.isNaN(parsedTarget) ||
      parsedTarget <= 0
    ) {
      setGoalError('Enter a valid target amount');
      return;
    }
    if (goalCurrencyId == null) {
      setGoalError('Select a currency');
      return;
    }
    setGoalError(null);

    const params: NewSavingsGoalParams = {
      name: goalName.trim(),
      targetAmount: parsedTarget,
      currencyId: goalCurrencyId,
      targetDate: goalTargetDate ?? undefined,
    };

    try {
      if (editingGoalId != null) {
        await updateSavingsGoal(editingGoalId, params);
      } else {
        await createSavingsGoal(params);
      }
      setFormVisible(false);
      resetGoalForm();
      load();
    } catch (submitError) {
      Alert.alert(
        'Could not save',
        submitError instanceof Error
          ? submitError.message
          : String(submitError),
      );
    }
  };

  const handleSetStatus = (
    goal: GoalRow,
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
          onPress: async () => {
            try {
              await setSavingsGoalStatus(goal.id, status);
              load();
            } catch (statusError) {
              Alert.alert(
                'Could not update goal',
                statusError instanceof Error
                  ? statusError.message
                  : String(statusError),
              );
            }
          },
        },
      ],
    );
  };

  const handleDeleteGoal = (goal: GoalRow) => {
    Alert.alert(
      'Delete goal',
      // Steers toward Abandon first — deletion also removes every
      // contribution ever logged against this goal, with no undo.
      `Delete "${goal.name}"? This permanently removes it and its entire contribution history. If you just want to stop tracking it, abandon it instead. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSavingsGoal(goal.id);
              load();
            } catch (deleteError) {
              Alert.alert(
                'Could not delete goal',
                deleteError instanceof Error
                  ? deleteError.message
                  : String(deleteError),
              );
            }
          },
        },
      ],
    );
  };

  const handleOpenAddContribution = (goal: GoalRow) => {
    setAddingContributionFor(goal.id);
    setContributionAmount('');
    setContributionDate(getCurrentDateString());
    setContributionNote('');
  };

  const handleSubmitContribution = async (goal: GoalRow) => {
    const parsedAmount = Number(contributionAmount);
    if (
      !contributionAmount ||
      Number.isNaN(parsedAmount) ||
      parsedAmount <= 0
    ) {
      Alert.alert('Invalid amount', 'Enter a contribution amount greater than zero.');
      return;
    }
    try {
      await addContribution({
        savingsGoalId: goal.id,
        amount: parsedAmount,
        date: contributionDate,
        note: contributionNote.trim() || undefined,
      });
      setAddingContributionFor(null);
      await Promise.all([load(), reloadContributionsFor(goal.id)]);
    } catch (contributionError) {
      Alert.alert(
        'Could not add contribution',
        contributionError instanceof Error
          ? contributionError.message
          : String(contributionError),
      );
    }
  };

  const handleStartEditContribution = (contribution: ContributionRow) => {
    setEditingContributionId(contribution.id);
    setEditAmount(String(contribution.amount));
    setEditDate(contribution.date);
    setEditNote(contribution.note ?? '');
  };

  const handleSaveEditContribution = async (goalId: number) => {
    if (editingContributionId == null) {
      return;
    }
    const parsedAmount = Number(editAmount);
    if (!editAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid amount', 'Enter a contribution amount greater than zero.');
      return;
    }
    try {
      await updateContribution(editingContributionId, {
        amount: parsedAmount,
        date: editDate,
        note: editNote.trim() || undefined,
      });
      setEditingContributionId(null);
      await Promise.all([load(), reloadContributionsFor(goalId)]);
    } catch (editError) {
      Alert.alert(
        'Could not update contribution',
        editError instanceof Error ? editError.message : String(editError),
      );
    }
  };

  const handleDeleteContribution = (goalId: number, contribution: ContributionRow) => {
    Alert.alert(
      'Delete contribution',
      `Delete this ${contribution.date} contribution? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteContribution(contribution.id);
              await Promise.all([load(), reloadContributionsFor(goalId)]);
            } catch (deleteError) {
              Alert.alert(
                'Could not delete contribution',
                deleteError instanceof Error
                  ? deleteError.message
                  : String(deleteError),
              );
            }
          },
        },
      ],
    );
  };

  const visibleGoals = goals.filter(g =>
    filter === 'active' ? g.status === 'active' : g.status !== 'active',
  );
  const today = getCurrentDateString();

  // Mirrors handleSubmitGoal's own checks — target date is genuinely
  // optional (per its own "(optional)" label), so it's deliberately left
  // out of this gate.
  const goalFormCanSave =
    goalName.trim() !== '' &&
    goalTargetAmount !== '' &&
    !Number.isNaN(Number(goalTargetAmount)) &&
    Number(goalTargetAmount) > 0 &&
    goalCurrencyId != null;

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
        onPress={handleAddGoalPress}>
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
          renderItem={({ item: goal }) => {
            const progress = getProgress(goal.totalContributed, goal.targetAmount);
            const progressPct = progress * 100;
            const remaining = goal.targetAmount - goal.totalContributed;
            const requiredPerMonth = goal.targetDate
              ? getRequiredPerMonth(remaining, goal.targetDate, today)
              : undefined;
            const expanded = expandedGoalId === goal.id;
            const contributions = contributionsByGoal[goal.id];

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
                      {goal.currencyCode} {goal.totalContributed.toFixed(2)}{' '}
                      <Text style={[styles.goalAmountOf, { color: colors.textSecondary }]}>
                        of {goal.targetAmount.toFixed(2)}
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
                      {progressPct.toFixed(0)}%
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
                      Target {goal.targetDate} — {goal.currencyCode}{' '}
                      {(requiredPerMonth ?? 0).toFixed(2)}/month needed
                    </Text>
                  )
                ) : (
                  <Text style={[styles.goalMeta, { color: colors.textSecondary }]}>
                    No target date set
                  </Text>
                )}

                <Pressable onPress={() => handleToggleExpand(goal)}>
                  <Text style={[styles.detailsLink, { color: colors.primary }]}>
                    {expanded ? 'Hide details' : 'Details'}
                  </Text>
                </Pressable>

                {expanded && (
                  <View style={styles.detailsSection}>
                    <Text style={[styles.subheading, { color: colors.text }]}>
                      Contributions
                    </Text>
                    {!contributions ? (
                      <Text style={{ color: colors.textSecondary }}>
                        Loading...
                      </Text>
                    ) : contributions.length === 0 ? (
                      <Text style={{ color: colors.textSecondary }}>
                        No contributions logged yet.
                      </Text>
                    ) : (
                      contributions.map(contribution =>
                        editingContributionId === contribution.id ? (
                          <View
                            key={contribution.id}
                            style={[
                              styles.contributionRow,
                              { borderTopColor: colors.border },
                            ]}>
                            <TextInput
                              style={[
                                styles.input,
                                {
                                  borderColor: colors.border,
                                  color: colors.text,
                                  backgroundColor: colors.background,
                                },
                              ]}
                              value={editAmount}
                              onChangeText={setEditAmount}
                              keyboardType="numeric"
                              returnKeyType="done"
                              inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
                              placeholder="Amount"
                              placeholderTextColor={colors.textSecondary}
                            />
                            <DateField
                              value={editDate}
                              onChange={setEditDate}
                              renderTrigger={(label, onPress) => (
                                <Pressable
                                  style={[styles.smallPillButton, { borderColor: colors.border }]}
                                  onPress={onPress}>
                                  <Text style={[styles.smallPillButtonText, { color: colors.text }]}>
                                    {label}
                                  </Text>
                                </Pressable>
                              )}
                            />
                            <TextInput
                              style={[
                                styles.input,
                                {
                                  borderColor: colors.border,
                                  color: colors.text,
                                  backgroundColor: colors.background,
                                },
                              ]}
                              value={editNote}
                              onChangeText={setEditNote}
                              placeholder="Note (optional)"
                              placeholderTextColor={colors.textSecondary}
                            />
                            <View style={styles.rowActions}>
                              <Pressable
                                style={[styles.smallPillButton, { borderColor: colors.border }]}
                                onPress={() => setEditingContributionId(null)}>
                                <Text style={[styles.smallPillButtonText, { color: colors.text }]}>
                                  Cancel
                                </Text>
                              </Pressable>
                              <Pressable
                                style={[styles.smallPillButtonSolid, { backgroundColor: colors.primary }]}
                                onPress={() => handleSaveEditContribution(goal.id)}>
                                <Text style={[styles.smallPillButtonText, { color: colors.primaryText }]}>
                                  Save
                                </Text>
                              </Pressable>
                            </View>
                            <NumericInputAccessory />
                          </View>
                        ) : (
                          <View
                            key={contribution.id}
                            style={[
                              styles.contributionRow,
                              { borderTopColor: colors.border },
                            ]}>
                            <Text style={{ color: colors.text }}>
                              {contribution.date} — {goal.currencyCode}{' '}
                              {contribution.amount.toFixed(2)}
                              {contribution.note ? ` — ${contribution.note}` : ''}
                            </Text>
                            <View style={styles.rowActions}>
                              <Pressable
                                style={[styles.smallPillButton, { borderColor: colors.border }]}
                                onPress={() => handleStartEditContribution(contribution)}>
                                <Text style={[styles.smallPillButtonText, { color: colors.text }]}>
                                  Edit
                                </Text>
                              </Pressable>
                              <Pressable
                                style={[styles.smallPillButton, { borderColor: colors.dangerSoft }]}
                                onPress={() => handleDeleteContribution(goal.id, contribution)}>
                                <Text style={[styles.smallPillButtonText, { color: colors.danger }]}>
                                  Delete
                                </Text>
                              </Pressable>
                            </View>
                          </View>
                        ),
                      )
                    )}

                    {goal.status === 'active' &&
                      (addingContributionFor === goal.id ? (
                        <View style={styles.addContributionForm}>
                          <Text style={[styles.label, { color: colors.text }]}>
                            Amount
                          </Text>
                          <TextInput
                            style={[
                              styles.input,
                              {
                                borderColor: colors.border,
                                color: colors.text,
                                backgroundColor: colors.background,
                              },
                            ]}
                            value={contributionAmount}
                            onChangeText={setContributionAmount}
                            keyboardType="numeric"
                            returnKeyType="done"
                            inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
                            placeholder="0.00"
                            placeholderTextColor={colors.textSecondary}
                          />
                          <Text style={[styles.label, { color: colors.text }]}>
                            Date
                          </Text>
                          <DateField
                            value={contributionDate}
                            onChange={setContributionDate}
                            renderTrigger={(label, onPress) => (
                              <Pressable
                                style={[styles.smallPillButton, { borderColor: colors.border }]}
                                onPress={onPress}>
                                <Text style={[styles.smallPillButtonText, { color: colors.text }]}>
                                  {label}
                                </Text>
                              </Pressable>
                            )}
                          />
                          <Text style={[styles.label, { color: colors.text }]}>
                            Note (optional)
                          </Text>
                          <TextInput
                            style={[
                              styles.input,
                              {
                                borderColor: colors.border,
                                color: colors.text,
                                backgroundColor: colors.background,
                              },
                            ]}
                            value={contributionNote}
                            onChangeText={setContributionNote}
                            placeholder="e.g. Bonus"
                            placeholderTextColor={colors.textSecondary}
                          />
                          <View style={styles.rowActions}>
                            <Pressable
                              style={[styles.smallPillButton, { borderColor: colors.border }]}
                              onPress={() => setAddingContributionFor(null)}>
                              <Text style={[styles.smallPillButtonText, { color: colors.text }]}>
                                Cancel
                              </Text>
                            </Pressable>
                            <Pressable
                              style={[styles.smallPillButtonSolid, { backgroundColor: colors.primary }]}
                              onPress={() => handleSubmitContribution(goal)}>
                              <Text style={[styles.smallPillButtonText, { color: colors.primaryText }]}>
                                Add
                              </Text>
                            </Pressable>
                          </View>
                          <NumericInputAccessory />
                        </View>
                      ) : (
                        <Pressable
                          style={[styles.addContributionButton, { borderColor: colors.primary }]}
                          onPress={() => handleOpenAddContribution(goal)}>
                          <Plus size={14} color={colors.primary} strokeWidth={2.5} />
                          <Text style={[styles.addContributionButtonText, { color: colors.primary }]}>
                            Add Contribution
                          </Text>
                        </Pressable>
                      ))}

                    <View style={[styles.divider, { backgroundColor: colors.border }]} />

                    <View style={styles.goalActions}>
                      <Pressable
                        style={[styles.actionPill, { borderColor: colors.border }]}
                        onPress={() => handleEditGoalPress(goal)}>
                        <Text style={[styles.actionPillText, { color: colors.text }]}>
                          Edit Goal
                        </Text>
                      </Pressable>
                      {goal.status === 'active' ? (
                        <>
                          <Pressable
                            style={[styles.actionPill, { borderColor: colors.success }]}
                            onPress={() => handleSetStatus(goal, 'achieved')}>
                            <Text style={[styles.actionPillText, { color: colors.success }]}>
                              Mark Achieved
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[styles.actionPill, { borderColor: colors.warning }]}
                            onPress={() => handleSetStatus(goal, 'abandoned')}>
                            <Text style={[styles.actionPillText, { color: colors.warning }]}>
                              Abandon
                            </Text>
                          </Pressable>
                        </>
                      ) : (
                        <Pressable
                          style={[styles.actionPill, { borderColor: colors.primary }]}
                          onPress={() => handleSetStatus(goal, 'active')}>
                          <Text style={[styles.actionPillText, { color: colors.primary }]}>
                            Reactivate
                          </Text>
                        </Pressable>
                      )}
                      <Pressable
                        style={[styles.actionPill, { borderColor: colors.dangerSoft }]}
                        onPress={() => handleDeleteGoal(goal)}>
                        <Text style={[styles.actionPillText, { color: colors.danger }]}>
                          Delete
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </Card>
            );
          }}
          ListEmptyComponent={
            <EmptyState message={filter === 'active' ? 'No active savings goals yet.' : 'No achieved or abandoned goals yet.'} />
          }
        />
      )}

      <BottomSheetModal
        visible={formVisible}
        onClose={handleCancelGoalForm}
        onSave={handleSubmitGoal}
        canSave={goalFormCanSave}
        title={editingGoalId ? 'Edit Goal' : 'New Savings Goal'}
        saveLabel={editingGoalId ? 'Save' : 'Create'}>
                  <Text style={[styles.label, { color: colors.text }]}>Name</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        borderColor: colors.border,
                        color: colors.text,
                        backgroundColor: colors.surface,
                      },
                    ]}
                    value={goalName}
                    onChangeText={setGoalName}
                    placeholder="e.g. Emergency Fund"
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={[styles.label, { color: colors.text }]}>
                    Target amount
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        borderColor: colors.border,
                        color: colors.text,
                        backgroundColor: colors.surface,
                      },
                    ]}
                    value={goalTargetAmount}
                    onChangeText={setGoalTargetAmount}
                    keyboardType="numeric"
                    returnKeyType="done"
                    inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
                    placeholder="0.00"
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={[styles.label, { color: colors.text }]}>
                    Currency
                  </Text>
                  {currencies.length === 0 ? (
                    <EmptyState message="No currencies available." />
                  ) : (
                    <CollapsiblePicker
                      displayLabel={
                        currencies.find(c => c.id === goalCurrencyId)?.code ??
                        'Select currency'
                      }
                      selectedValue={
                        goalCurrencyId != null ? String(goalCurrencyId) : ''
                      }
                      onValueChange={value => setGoalCurrencyId(Number(value))}
                      items={currencies.map(c => ({
                        label: `${c.code} — ${c.name}`,
                        value: String(c.id),
                      }))}
                    />
                  )}

                  <Text style={[styles.label, { color: colors.text }]}>
                    Target date (optional)
                  </Text>
                  <View style={styles.rowActions}>
                    <DateField
                      value={goalTargetDate}
                      onChange={setGoalTargetDate}
                      placeholder="No target date"
                      renderTrigger={(label, onPress) => (
                        <Pressable
                          style={[styles.smallPillButton, { borderColor: colors.border }]}
                          onPress={onPress}>
                          <Text style={[styles.smallPillButtonText, { color: colors.text }]}>
                            {label}
                          </Text>
                        </Pressable>
                      )}
                    />
                    {goalTargetDate && (
                      <Pressable
                        style={[styles.smallPillButton, { borderColor: colors.dangerSoft }]}
                        onPress={() => setGoalTargetDate(null)}>
                        <Text style={[styles.smallPillButtonText, { color: colors.danger }]}>
                          Clear
                        </Text>
                      </Pressable>
                    )}
                  </View>

                  {goalError && (
                    <Text style={[styles.error, { color: colors.danger }]}>
                      {goalError}
                    </Text>
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
  detailsSection: {
    marginTop: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 10,
  },
  subheading: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  contributionRow: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  addContributionForm: {
    marginTop: 12,
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
  smallPillButton: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  smallPillButtonSolid: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  smallPillButtonText: {
    fontSize: scaleFont(12.5),
    fontWeight: '600',
  },
  rowActions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 8,
    marginTop: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
  },
  error: {
    marginTop: 12,
  },
});

export default SavingsGoalsScreen;
