import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import BottomSheetModal from '../components/BottomSheetModal';
import NumericInputAccessory from '../components/NumericInputAccessory';
import EmptyState from '../components/common/EmptyState';
import SegmentedToggle, {
  type SegmentedToggleOption,
} from '../components/common/SegmentedToggle';
import RuleCard from '../components/recurringRules/RuleCard';
import RuleFormFields from '../components/recurringRules/RuleFormFields';
import { scaleFont } from '../theme/typography';
import { useTheme } from '../contexts/ThemeContext';
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useLazyExpandableDetail } from '../hooks/useLazyExpandableDetail';
import {
  useRecurringRulesData,
  type RecurringRuleListType,
  type RecurringRuleRow,
} from '../hooks/useRecurringRulesData';
import { useRecurringRuleForm } from '../hooks/useRecurringRuleForm';
import {
  deleteRecurringRule,
  getOccurrenceHistory,
  setRecurringRuleActive,
} from '../db/queries';

const LIST_TYPE_OPTIONS: SegmentedToggleOption<RecurringRuleListType>[] = [
  { key: 'Income', label: 'Income rules' },
  { key: 'Expense', label: 'Expense rules' },
];

function RecurringRulesScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const confirmDelete = useConfirmDelete();
  const runAction = useAsyncAction();

  const {
    listType,
    setListType,
    accounts,
    categories,
    loading,
    visibleRules,
    load,
  } = useRecurringRulesData();

  // Occurrence history is fetched lazily on first expand — most rules
  // will never be expanded in a given session. Read-only, unlike
  // SavingsGoalsScreen's contributions, so no refresh() call is needed.
  const historyDetail = useLazyExpandableDetail(getOccurrenceHistory);

  const ruleForm = useRecurringRuleForm(accounts, categories, load);

  // Doesn't cleanly fit useRecurringRulesData/useRecurringRuleForm, so —
  // mirroring AccountsScreen's and InstallmentPlansScreen's own
  // orchestrator-level handlers — these stay here rather than being
  // forced into an unrelated hook.
  const handleToggleActive = async (rule: RecurringRuleRow) => {
    await runAction(async () => {
      await setRecurringRuleActive(rule.id, !rule.active);
      await load();
    }, 'Could not update rule');
  };

  const handleDelete = (rule: RecurringRuleRow) => {
    // Steers toward deactivation first, matching deleteRecurringRule's
    // own doc comment — deletion is meant for rules created by mistake,
    // not the normal way to stop one.
    confirmDelete(
      'Delete rule',
      `Delete "${rule.name}"? If you just want to stop it, deactivate it instead so its history is kept. This cannot be undone.`,
      'Delete',
      () =>
        runAction(async () => {
          await deleteRecurringRule(rule.id);
          await load();
        }, 'Cannot delete rule'),
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SegmentedToggle
        options={LIST_TYPE_OPTIONS}
        value={listType}
        onChange={setListType}
      />

      <Pressable
        style={[styles.addButton, { borderColor: colors.primary }]}
        onPress={ruleForm.openAdd}
      >
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
          renderItem={({ item, index }) => (
            <RuleCard
              rule={item}
              index={index}
              expanded={historyDetail.expandedId === item.id}
              history={historyDetail.dataById[item.id]}
              onToggleHistory={() => historyDetail.toggle(item.id)}
              onEdit={() => ruleForm.openEdit(item)}
              onToggleActive={() => handleToggleActive(item)}
              onDelete={() => handleDelete(item)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              message={
                listType === 'Income'
                  ? 'No income rules yet.'
                  : 'No expense rules yet.'
              }
            />
          }
        />
      )}

      <BottomSheetModal
        visible={ruleForm.visible}
        onClose={ruleForm.close}
        onSave={ruleForm.submit}
        canSave={ruleForm.canSave}
        title={ruleForm.editingId ? 'Edit Rule' : 'New Recurring Rule'}
        saveLabel={ruleForm.editingId ? 'Save' : 'Create'}
      >
        <RuleFormFields
          form={ruleForm}
          accounts={accounts}
          categories={categories}
        />
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
});

export default RecurringRulesScreen;
