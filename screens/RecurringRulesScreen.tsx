import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import BottomSheetModal from '../components/BottomSheetModal';
import OccurrenceHistoryList from '../components/recurringRules/OccurrenceHistoryList';
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
  getOccurrenceHistory,
} from '../db/queries';
import {
  useDeleteRecurringRule as useDeleteRecurringRuleMutation,
  useSetRecurringRuleActive as useSetRecurringRuleActiveMutation,
} from '../hooks/queries';
import { FAB_CLEARANCE } from '../theme/layout';

const LIST_TYPE_OPTIONS: SegmentedToggleOption<RecurringRuleListType>[] = [
  { key: 'Income', label: 'Income rules' },
  { key: 'Expense', label: 'Expense rules' },
];

function RecurringRulesScreen(): React.JSX.Element {
  // Write paths go through the caching layer's mutation hooks: each
  // one runs the same db/queries function as before and then
  // invalidates every query its write can affect (see
  // hooks/queries/invalidation.ts). The call sites below are
  // unchanged — these hooks take the wrapped function's own arguments.
  const deleteRecurringRule = useDeleteRecurringRuleMutation();
  const setRecurringRuleActive = useSetRecurringRuleActiveMutation();
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
  } = useRecurringRulesData();

  // Occurrence history is fetched lazily on first expand — most rules
  // will never be expanded in a given session. Read-only, unlike
  // SavingsGoalsScreen's contributions, so no refresh() call is needed.
  const historyDetail = useLazyExpandableDetail(getOccurrenceHistory);
  const historyRule =
    visibleRules.find(rule => rule.id === historyDetail.expandedId) ?? null;

  const ruleForm = useRecurringRuleForm(accounts, categories);

  // Doesn't cleanly fit useRecurringRulesData/useRecurringRuleForm, so —
  // mirroring AccountsScreen's and InstallmentPlansScreen's own
  // orchestrator-level handlers — these stay here rather than being
  // forced into an unrelated hook.
  const handleToggleActive = async (rule: RecurringRuleRow) => {
    await runAction(async () => {
      await setRecurringRuleActive(rule.id, !rule.active);
      // No reload() here any more: the mutation above already
      // invalidated every query this write affects, and awaiting it
      // waits for those refetches — a second read would be redundant.
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
        // No reload() here any more: the mutation above already
        // invalidated every query this write affects, and awaiting it
        // waits for those refetches — a second read would be redundant.
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
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) => (
            <RuleCard
              rule={item}
              index={index}
              onOpenHistory={() => historyDetail.open(item.id)}
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

      {/* One rule's occurrence history. A sheet rather than an in-card
          expansion: a rule that has run for a year has a long list, and
          unfolding it in place shifted every card below it and gave the
          list no scroll of its own. */}
      <BottomSheetModal
        visible={historyDetail.expandedId != null}
        onClose={historyDetail.close}
        title={historyRule ? `History — ${historyRule.name}` : undefined}
        cancelLabel="Close">
        {historyRule && (
          <OccurrenceHistoryList
            history={historyDetail.dataById[historyRule.id]}
            currencyCode={historyRule.currencyCode}
          />
        )}
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
  // Lets the last row scroll out from under the FAB.
  listContent: {
    paddingBottom: FAB_CLEARANCE,
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
