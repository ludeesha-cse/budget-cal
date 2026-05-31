import React, { useCallback, useEffect, useState } from 'react';
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
import { Ban, CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react-native';
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
import ActionButtons from '../components/common/ActionButtons';
import {
  createRecurringRule,
  deleteRecurringRule,
  getAccountBalances,
  getAccounts,
  getCategories,
  getOccurrenceHistory,
  getRecurringRules,
  setRecurringRuleActive,
  updateRecurringRule,
  type NewRecurringRuleParams,
} from '../db/queries';
import { avatarColorsFor } from '../utils/avatarColor';
import { formatAmount } from '../utils/formatAmount';
import { labelForId } from '../utils/pickerLabels';
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { useTheme } from '../contexts/ThemeContext';
import { scaleFont, typography } from '../theme/typography';

// List-filter labels ("Income rules"/"Expense rules") and the form's own
// type toggle ("Income"/"Expense") show the same two keys with different
// wording, so they need their own option arrays even though both drive a
// SegmentedToggle.
const LIST_TYPE_OPTIONS: SegmentedToggleOption<'Income' | 'Expense'>[] = [
  { key: 'Income', label: 'Income rules' },
  { key: 'Expense', label: 'Expense rules' },
];
const RULE_TYPE_OPTIONS: SegmentedToggleOption<'Income' | 'Expense'>[] = [
  { key: 'Income', label: 'Income' },
  { key: 'Expense', label: 'Expense' },
];

// Same exclusion as TransactionForm/IncomeForm — a Liability/Receivable
// account only ever moves through the loan flows, never an ordinary
// Expense/Income posting, so a recurring rule can't point at one either.
const NON_TRANSACTABLE_ACCOUNT_TYPES = ['Liability', 'Receivable'];

const DAY_OF_MONTH_OPTIONS = Array.from({ length: 31 }, (_, i) => ({
  label: String(i + 1),
  value: String(i + 1),
}));

type RuleRow = Awaited<ReturnType<typeof getRecurringRules>>[number];
type AccountRow = Awaited<ReturnType<typeof getAccounts>>[number];
type CategoryRow = Awaited<ReturnType<typeof getCategories>>[number];
type HistoryRow = Awaited<ReturnType<typeof getOccurrenceHistory>>[number];

function RecurringRulesScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const confirmDelete = useConfirmDelete();

  // Which section of the list is showing — independent of the form's own
  // type toggle below, so switching tabs never disturbs an open form.
  const [listType, setListType] = useState<'Income' | 'Expense'>('Income');
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Fetched lazily (on first expand) rather than up front for every rule
  // — a personal tracker might accumulate a lot of resolved occurrences
  // over time, and most of them are never looked at again.
  const [historyByRule, setHistoryByRule] = useState<Record<number, HistoryRow[]>>(
    {},
  );
  const [expandedRuleId, setExpandedRuleId] = useState<number | null>(null);

  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [ruleType, setRuleType] = useState<'Income' | 'Expense'>('Expense');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [accountBalances, setAccountBalances] = useState<
    Awaited<ReturnType<typeof getAccountBalances>>
  >([]);
  const [currencyId, setCurrencyId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [ruleRows, accountRows, categoryRows] = await Promise.all([
      getRecurringRules(false),
      getAccounts(),
      getCategories(),
    ]);
    setRules(ruleRows);
    setAccounts(
      accountRows.filter(
        a => a.active && !NON_TRANSACTABLE_ACCOUNT_TYPES.includes(a.type),
      ),
    );
    setCategories(categoryRows);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Reloads whichever account's currencies are on offer whenever the
  // selected account changes. Unlike IncomeForm's version of this same
  // effect, a valid current selection is preserved rather than always
  // reset to null — that's what lets handleEditPress prefill an existing
  // rule's currency correctly once these balances resolve, instead of
  // wiping it back to "Select currency" every time an edit is opened.
  useEffect(() => {
    if (accountId == null) {
      setAccountBalances([]);
      setCurrencyId(null);
      return;
    }
    let cancelled = false;
    getAccountBalances(accountId).then(balances => {
      if (cancelled) {
        return;
      }
      setAccountBalances(balances);
      setCurrencyId(current =>
        current != null && balances.some(b => b.currencyId === current)
          ? current
          : balances.length === 1
            ? balances[0].currencyId
            : null,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const resetForm = () => {
    setEditingId(null);
    setRuleType('Expense');
    setName('');
    setAmount('');
    setDayOfMonth('1');
    setAccountId(accounts[0]?.id ?? null);
    setCategoryId(categories[0]?.id ?? null);
    setError(null);
  };

  const handleAddPress = () => {
    resetForm();
    setFormVisible(true);
  };

  const handleRuleTypeChange = (option: 'Income' | 'Expense') => {
    setRuleType(option);
    // Selecting Income hides the category picker entirely (see the render
    // below) rather than leaving it present-but-unused — clearing it here
    // means an Income rule never silently carries a category picked
    // before the switch.
    if (option === 'Income') {
      setCategoryId(null);
    } else if (categoryId == null) {
      setCategoryId(categories[0]?.id ?? null);
    }
  };

  const handleEditPress = (rule: RuleRow) => {
    setEditingId(rule.id);
    setRuleType(rule.ruleType);
    setName(rule.name);
    setAmount(String(rule.amount));
    setDayOfMonth(String(rule.dayOfMonth));
    setAccountId(rule.accountId);
    // Set immediately so the picker doesn't flash "Select currency"
    // before the accountId effect's async getAccountBalances resolves —
    // that effect then confirms/keeps this same value once it loads.
    setCurrencyId(rule.currencyId);
    setCategoryId(rule.categoryId ?? categories[0]?.id ?? null);
    setError(null);
    setFormVisible(true);
  };

  const handleCancel = () => {
    setFormVisible(false);
    resetForm();
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Enter a name');
      return;
    }
    const parsedAmount = Number(amount);
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a valid amount');
      return;
    }
    const parsedDay = Number(dayOfMonth);
    if (!Number.isInteger(parsedDay) || parsedDay < 1 || parsedDay > 31) {
      setError('Select a day of month between 1 and 31');
      return;
    }
    if (accountId == null) {
      setError('Select an account');
      return;
    }
    if (currencyId == null) {
      setError('Select a currency');
      return;
    }
    if (ruleType === 'Expense' && categoryId == null) {
      setError('Select a category');
      return;
    }
    setError(null);

    const params: NewRecurringRuleParams = {
      name: name.trim(),
      ruleType,
      amount: parsedAmount,
      dayOfMonth: parsedDay,
      categoryId: ruleType === 'Expense' ? (categoryId ?? undefined) : undefined,
      accountId,
      currencyId,
    };

    try {
      if (editingId != null) {
        await updateRecurringRule(editingId, params);
      } else {
        await createRecurringRule(params);
      }
      setFormVisible(false);
      resetForm();
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

  const handleToggleActive = async (rule: RuleRow) => {
    try {
      await setRecurringRuleActive(rule.id, !rule.active);
      load();
    } catch (toggleError) {
      Alert.alert(
        'Could not update rule',
        toggleError instanceof Error
          ? toggleError.message
          : String(toggleError),
      );
    }
  };

  const handleDelete = (rule: RuleRow) => {
    // Steers toward deactivation first, matching
    // deleteRecurringRule's own doc comment — deletion is meant for
    // rules created by mistake, not the normal way to stop one.
    confirmDelete(
      'Delete rule',
      `Delete "${rule.name}"? If you just want to stop it, deactivate it instead so its history is kept. This cannot be undone.`,
      'Delete',
      async () => {
        try {
          await deleteRecurringRule(rule.id);
          load();
        } catch (deleteError) {
          Alert.alert(
            'Cannot delete rule',
            deleteError instanceof Error
              ? deleteError.message
              : String(deleteError),
          );
        }
      },
    );
  };

  const handleToggleHistory = async (rule: RuleRow) => {
    if (expandedRuleId === rule.id) {
      setExpandedRuleId(null);
      return;
    }
    setExpandedRuleId(rule.id);
    if (!(rule.id in historyByRule)) {
      const history = await getOccurrenceHistory(rule.id);
      setHistoryByRule(current => ({ ...current, [rule.id]: history }));
    }
  };

  const visibleRules = rules.filter(r => r.ruleType === listType);
  const parsedDayPreview = Number(dayOfMonth);

  // Mirrors handleSubmit's own checks (minus trimming/rounding, which
  // only matter at actual submit time) so Save disables the instant a
  // required field is missing, rather than only failing after a tap.
  const formCanSave =
    name.trim() !== '' &&
    amount !== '' &&
    !Number.isNaN(Number(amount)) &&
    Number(amount) > 0 &&
    Number.isInteger(parsedDayPreview) &&
    parsedDayPreview >= 1 &&
    parsedDayPreview <= 31 &&
    accountId != null &&
    currencyId != null &&
    (ruleType !== 'Expense' || categoryId != null);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SegmentedToggle
        options={LIST_TYPE_OPTIONS}
        value={listType}
        onChange={setListType}
      />

      <Pressable
        style={[styles.addButton, { borderColor: colors.primary }]}
        onPress={handleAddPress}>
        <Plus size={16} color={colors.primary} strokeWidth={2.5} />
        <Text style={[styles.addButtonText, { color: colors.primary }]}>
          Add Rule
        </Text>
      </Pressable>

      {loading ? (
        <EmptyState message="Loading..." />
      ) : (
        <FlatList
          data={visibleRules}
          keyExtractor={item => String(item.id)}
          style={styles.list}
          renderItem={({ item, index }) => {
            const { bg, fg } = avatarColorsFor(index, colors.chart);
            return (
              <Card colors={colors} style={[styles.ruleCard, !item.active && styles.ruleCardInactive]}>
                <View style={styles.ruleHeader}>
                  <View style={[styles.dayBadge, { backgroundColor: bg }]}>
                    <Text style={[styles.dayBadgeText, { color: fg }]}>
                      {item.dayOfMonth}
                    </Text>
                  </View>
                  <View style={styles.ruleHeaderText}>
                    <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                      {item.name}
                      {!item.active && (
                        <Text style={[styles.inactiveTag, { color: colors.textSecondary }]}>
                          {' '}
                          (inactive)
                        </Text>
                      )}
                    </Text>
                    <Text style={[typography.amountMono, styles.rowMeta, { color: colors.text }]}>
                      {formatAmount(item.amount, item.currencyCode)}
                    </Text>
                    <Text style={[styles.rowSubMeta, { color: colors.textSecondary }]}>
                      Day {item.dayOfMonth} · {item.accountName}
                      {item.ruleType === 'Expense' && item.categoryName
                        ? ` · ${item.categoryName}`
                        : ''}
                    </Text>
                  </View>
                </View>

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                <ActionButtons
                  equalWidth
                  style={styles.ruleActionsRow}
                  items={[
                    { key: 'edit', icon: Pencil, label: 'Edit', onPress: () => handleEditPress(item) },
                    {
                      key: 'toggle',
                      icon: item.active ? Ban : CheckCircle2,
                      label: item.active ? 'Deactivate' : 'Activate',
                      onPress: () => handleToggleActive(item),
                    },
                    { key: 'delete', icon: Trash2, label: 'Delete', tone: 'danger', onPress: () => handleDelete(item) },
                  ]}
                />

                <Pressable onPress={() => handleToggleHistory(item)}>
                  <Text style={[styles.historyLink, { color: colors.primary }]}>
                    {expandedRuleId === item.id ? 'Hide history' : 'View history'}
                  </Text>
                </Pressable>

                {expandedRuleId === item.id && (
                  <View style={styles.historyList}>
                    {!(item.id in historyByRule) ? (
                      <Text style={{ color: colors.textSecondary }}>
                        Loading...
                      </Text>
                    ) : historyByRule[item.id].length === 0 ? (
                      <Text style={{ color: colors.textSecondary }}>
                        No resolved occurrences yet.
                      </Text>
                    ) : (
                      historyByRule[item.id].map(occurrence => (
                        <View
                          key={occurrence.id}
                          style={[
                            styles.historyRow,
                            { borderTopColor: colors.border },
                          ]}>
                          <Text style={{ color: colors.text }}>
                            {occurrence.dueDate} —{' '}
                            {occurrence.status === 'confirmed'
                              ? `Confirmed ${formatAmount(occurrence.confirmedAmount ?? 0, item.currencyCode)}${
                                  occurrence.accountName
                                    ? ` (${occurrence.accountName})`
                                    : ''
                                }`
                              : occurrence.status === 'skipped'
                                ? 'Skipped'
                                : 'Pending'}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                )}
              </Card>
            );
          }}
          ListEmptyComponent={
            <EmptyState message={listType === 'Income' ? 'No income rules yet.' : 'No expense rules yet.'} />
          }
        />
      )}

      <BottomSheetModal
        visible={formVisible}
        onClose={handleCancel}
        onSave={handleSubmit}
        canSave={formCanSave}
        title={editingId ? 'Edit Rule' : 'New Recurring Rule'}
        saveLabel={editingId ? 'Save' : 'Create'}>
                  <Text style={[styles.label, { color: colors.text }]}>
                    Type
                  </Text>
                  <SegmentedToggle
                    options={RULE_TYPE_OPTIONS}
                    value={ruleType}
                    onChange={handleRuleTypeChange}
                  />

                  <Text style={[styles.label, { color: colors.text }]}>
                    Name
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
                    ]}
                    value={name}
                    onChangeText={setName}
                    placeholder={
                      ruleType === 'Income' ? 'e.g. Salary' : 'e.g. Netflix'
                    }
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={[styles.label, { color: colors.text }]}>
                    Amount
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
                    ]}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="numeric"
                    returnKeyType="done"
                    inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
                    placeholder="0.00"
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={[styles.label, { color: colors.text }]}>
                    Day of month
                  </Text>
                  <CollapsiblePicker
                    displayLabel={`Day ${dayOfMonth}`}
                    selectedValue={dayOfMonth}
                    onValueChange={setDayOfMonth}
                    items={DAY_OF_MONTH_OPTIONS}
                  />
                  {parsedDayPreview >= 29 && (
                    <Text style={[styles.hint, { color: colors.textSecondary }]}>
                      Months without day {parsedDayPreview} will use their
                      last day instead.
                    </Text>
                  )}

                  <Text style={[styles.label, { color: colors.text }]}>
                    Account
                  </Text>
                  {accounts.length === 0 ? (
                    <EmptyState message="No eligible accounts available." />
                  ) : (
                    <CollapsiblePicker
                      displayLabel={labelForId(
                        accounts,
                        accountId,
                        'name',
                        'Select account',
                      )}
                      selectedValue={accountId != null ? String(accountId) : ''}
                      onValueChange={value => setAccountId(Number(value))}
                      items={accounts.map(a => ({
                        label: `${a.name} (${a.type})`,
                        value: String(a.id),
                      }))}
                    />
                  )}

                  {accountBalances.length > 1 && (
                    <>
                      <Text style={[styles.label, { color: colors.text }]}>
                        Currency
                      </Text>
                      <CollapsiblePicker
                        displayLabel={labelForId(
                          accountBalances.map(b => ({ ...b, id: b.currencyId })),
                          currencyId,
                          'currencyCode',
                          'Select currency',
                        )}
                        selectedValue={currencyId != null ? String(currencyId) : ''}
                        onValueChange={value => setCurrencyId(Number(value))}
                        items={accountBalances.map(b => ({
                          label: `${b.currencyCode} — ${b.currencyName}`,
                          value: String(b.currencyId),
                        }))}
                      />
                    </>
                  )}

                  {ruleType === 'Expense' && (
                    <>
                      <Text style={[styles.label, { color: colors.text }]}>
                        Category
                      </Text>
                      {categories.length === 0 ? (
                        <EmptyState message="No categories available." />
                      ) : (
                        <CollapsiblePicker
                          displayLabel={labelForId(
                            categories,
                            categoryId,
                            'name',
                            'Select category',
                          )}
                          selectedValue={categoryId != null ? String(categoryId) : ''}
                          onValueChange={value => setCategoryId(Number(value))}
                          items={categories.map(c => ({
                            label: c.name,
                            value: String(c.id),
                          }))}
                        />
                      )}
                    </>
                  )}

                  {error && (
                    <Text style={[styles.error, { color: colors.danger }]}>
                      {error}
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
  list: {
    marginTop: 12,
  },
  addButton: {
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
  addButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  ruleCard: {
    padding: 14,
    marginBottom: 10,
  },
  ruleCardInactive: {
    opacity: 0.6,
  },
  ruleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  dayBadgeText: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  ruleHeaderText: {
    flex: 1,
  },
  rowName: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  inactiveTag: {
    fontWeight: '400',
  },
  rowMeta: {
    fontSize: scaleFont(14),
    marginTop: 2,
  },
  rowSubMeta: {
    fontSize: scaleFont(12.5),
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
  },
  ruleActionsRow: {
    marginBottom: 10,
  },
  historyLink: {
    fontWeight: '600',
    fontSize: scaleFont(13),
  },
  historyList: {
    marginTop: 8,
    gap: 4,
  },
  historyRow: {
    paddingVertical: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
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
  hint: {
    fontSize: 12,
    marginTop: 4,
  },
  error: {
    marginTop: 12,
  },
});

export default RecurringRulesScreen;
