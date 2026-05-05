import React, { useCallback, useState } from 'react';
import {
  Alert,
  Button,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import CollapsiblePicker from '../components/CollapsiblePicker';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from '../components/NumericInputAccessory';
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

type GoalRow = Awaited<ReturnType<typeof getSavingsGoals>>[number];
type CurrencyRow = Awaited<ReturnType<typeof getCurrencies>>[number];
type ContributionRow = Awaited<ReturnType<typeof getContributions>>[number];

// Which "date field" a picker modal is currently open for — either the
// goal form's optional target date, or one specific contribution's date
// (add or edit), keyed by a string so both cases fit in one piece of
// state without a second Modal.
type DatePickerTarget =
  | { kind: 'goalForm' }
  | { kind: 'newContribution'; goalId: number }
  | { kind: 'editContribution'; contributionId: number };

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

  const [datePickerTarget, setDatePickerTarget] =
    useState<DatePickerTarget | null>(null);

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

  const handleDateChange = (
    _event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (selectedDate && datePickerTarget) {
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      if (datePickerTarget.kind === 'goalForm') {
        setGoalTargetDate(dateStr);
      } else if (datePickerTarget.kind === 'newContribution') {
        setContributionDate(dateStr);
      } else {
        setEditDate(dateStr);
      }
    }
    if (Platform.OS === 'android') {
      setDatePickerTarget(null);
    }
  };

  const datePickerValue = (): Date => {
    if (!datePickerTarget) {
      return new Date();
    }
    if (datePickerTarget.kind === 'goalForm') {
      return new Date(goalTargetDate ?? getCurrentDateString());
    }
    if (datePickerTarget.kind === 'newContribution') {
      return new Date(contributionDate);
    }
    return new Date(editDate || getCurrentDateString());
  };

  const visibleGoals = goals.filter(g =>
    filter === 'active' ? g.status === 'active' : g.status !== 'active',
  );
  const today = getCurrentDateString();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.explainer, { color: colors.textSecondary }]}>
        Contributions track progress toward a goal — they don't move money.
        Your money stays in your real accounts until you actually spend it.
      </Text>

      <View style={styles.toggleRow}>
        {(
          [
            { key: 'active', label: 'Active' },
            { key: 'history', label: 'Achieved / Abandoned' },
          ] as const
        ).map(option => (
          <Pressable
            key={option.key}
            style={[
              styles.toggleButton,
              { backgroundColor: colors.surface, borderColor: colors.primary },
              filter === option.key && { backgroundColor: colors.primary },
            ]}
            onPress={() => setFilter(option.key)}>
            <Text
              style={[
                styles.toggleButtonText,
                { color: colors.primary },
                filter === option.key && { color: colors.primaryText },
              ]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>
          Loading...
        </Text>
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

            return (
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}>
                <Text style={[styles.goalName, { color: colors.text }]}>
                  {goal.name}
                  {goal.status !== 'active' && (
                    <Text style={{ color: colors.textSecondary }}>
                      {' '}
                      ({goal.status})
                    </Text>
                  )}
                </Text>
                <Text style={{ color: colors.textSecondary }}>
                  {goal.currencyCode} {goal.totalContributed.toFixed(2)} of{' '}
                  {goal.targetAmount.toFixed(2)}
                </Text>

                <View
                  style={[
                    styles.progressBarBg,
                    { backgroundColor: colors.border },
                  ]}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${Math.min(Math.max(progressPct, 0), 100)}%`,
                        backgroundColor:
                          progressPct >= 100 ? colors.success : colors.primary,
                      },
                    ]}
                  />
                </View>
                <Text style={{ color: colors.textSecondary }}>
                  {progressPct.toFixed(0)}% funded
                </Text>

                {goal.targetDate ? (
                  requiredPerMonth === null ? (
                    <Text style={[styles.overdueText, { color: colors.danger }]}>
                      Overdue — target date {goal.targetDate} has passed
                    </Text>
                  ) : (
                    <Text style={{ color: colors.textSecondary }}>
                      Target {goal.targetDate} — {goal.currencyCode}{' '}
                      {(requiredPerMonth ?? 0).toFixed(2)}/month needed
                    </Text>
                  )
                ) : (
                  <Text style={{ color: colors.textSecondary }}>
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
                            <Button
                              title={editDate}
                              color={colors.primary}
                              onPress={() => {
                                Keyboard.dismiss();
                                setDatePickerTarget({
                                  kind: 'editContribution',
                                  contributionId: contribution.id,
                                });
                              }}
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
                              <Button
                                title="Cancel"
                                color={colors.primary}
                                onPress={() => setEditingContributionId(null)}
                              />
                              <Button
                                title="Save"
                                color={colors.primary}
                                onPress={() => handleSaveEditContribution(goal.id)}
                              />
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
                              <Button
                                title="Edit"
                                color={colors.primary}
                                onPress={() => handleStartEditContribution(contribution)}
                              />
                              <Button
                                title="Delete"
                                color={colors.danger}
                                onPress={() => handleDeleteContribution(goal.id, contribution)}
                              />
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
                          <Button
                            title={contributionDate}
                            color={colors.primary}
                            onPress={() => {
                              Keyboard.dismiss();
                              setDatePickerTarget({
                                kind: 'newContribution',
                                goalId: goal.id,
                              });
                            }}
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
                            <Button
                              title="Cancel"
                              color={colors.primary}
                              onPress={() => setAddingContributionFor(null)}
                            />
                            <Button
                              title="Add"
                              color={colors.primary}
                              onPress={() => handleSubmitContribution(goal)}
                            />
                          </View>
                          <NumericInputAccessory />
                        </View>
                      ) : (
                        <View style={styles.addContributionButton}>
                          <Button
                            title="Add Contribution"
                            color={colors.primary}
                            onPress={() => handleOpenAddContribution(goal)}
                          />
                        </View>
                      ))}

                    <View style={styles.goalActions}>
                      <Button
                        title="Edit Goal"
                        color={colors.primary}
                        onPress={() => handleEditGoalPress(goal)}
                      />
                      {goal.status === 'active' ? (
                        <>
                          <Button
                            title="Mark Achieved"
                            color={colors.success}
                            onPress={() => handleSetStatus(goal, 'achieved')}
                          />
                          <Button
                            title="Abandon"
                            color={colors.warning}
                            onPress={() => handleSetStatus(goal, 'abandoned')}
                          />
                        </>
                      ) : (
                        <Button
                          title="Reactivate"
                          color={colors.primary}
                          onPress={() => handleSetStatus(goal, 'active')}
                        />
                      )}
                      <Button
                        title="Delete"
                        color={colors.danger}
                        onPress={() => handleDeleteGoal(goal)}
                      />
                    </View>
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              {filter === 'active'
                ? 'No active savings goals yet.'
                : 'No achieved or abandoned goals yet.'}
            </Text>
          }
        />
      )}

      <View style={styles.addGoalButton}>
        <Button title="Add Goal" color={colors.primary} onPress={handleAddGoalPress} />
      </View>

      <Modal
        visible={formVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCancelGoalForm}>
        <Pressable style={styles.modalBackdrop} onPress={() => Keyboard.dismiss()}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <FlatList
              data={[0]}
              keyExtractor={() => 'form'}
              renderItem={() => (
                <View>
                  <Text style={[styles.label, { color: colors.text }]}>
                    {editingGoalId ? 'Edit Goal' : 'New Savings Goal'}
                  </Text>

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
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>
                      No currencies available.
                    </Text>
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
                    <Button
                      title={goalTargetDate ?? 'No target date'}
                      color={colors.primary}
                      onPress={() => {
                        Keyboard.dismiss();
                        setDatePickerTarget({ kind: 'goalForm' });
                      }}
                    />
                    {goalTargetDate && (
                      <Button
                        title="Clear"
                        color={colors.danger}
                        onPress={() => setGoalTargetDate(null)}
                      />
                    )}
                  </View>

                  {goalError && (
                    <Text style={[styles.error, { color: colors.danger }]}>
                      {goalError}
                    </Text>
                  )}

                  <View style={styles.formActions}>
                    <Button
                      title="Cancel"
                      color={colors.primary}
                      onPress={handleCancelGoalForm}
                    />
                    <Button
                      title={editingGoalId ? 'Save' : 'Create'}
                      color={colors.primary}
                      onPress={handleSubmitGoal}
                    />
                  </View>
                  <NumericInputAccessory />
                </View>
              )}
            />
          </View>
        </Pressable>
      </Modal>

      {Platform.OS === 'android' ? (
        datePickerTarget && (
          <DateTimePicker
            value={datePickerValue()}
            mode="date"
            display="default"
            onChange={handleDateChange}
          />
        )
      ) : (
        <Modal
          visible={datePickerTarget != null}
          transparent
          animationType="slide"
          onRequestClose={() => setDatePickerTarget(null)}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setDatePickerTarget(null)}>
            <Pressable
              style={[styles.modalCard, { backgroundColor: colors.surface }]}
              onPress={() => {}}>
              <DateTimePicker
                value={datePickerValue()}
                mode="date"
                display="spinner"
                onChange={handleDateChange}
              />
              <Button
                title="Done"
                color={colors.primary}
                onPress={() => setDatePickerTarget(null)}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  explainer: {
    fontSize: 13,
    marginBottom: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleButton: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    marginTop: 12,
  },
  empty: {
    fontSize: 14,
    marginTop: 8,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  goalName: {
    fontSize: 16,
    fontWeight: '600',
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 8,
    borderRadius: 4,
  },
  detailsLink: {
    marginTop: 8,
    fontWeight: '600',
  },
  overdueText: {
    fontWeight: '600',
  },
  detailsSection: {
    marginTop: 8,
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
    marginTop: 12,
  },
  goalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 16,
  },
  rowActions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 8,
    marginTop: 4,
  },
  addGoalButton: {
    marginTop: 12,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32,
    maxHeight: '90%',
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
  formActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
});

export default SavingsGoalsScreen;
