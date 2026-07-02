import React from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import CollapsiblePicker from '../CollapsiblePicker';
import EmptyState from '../common/EmptyState';
import SegmentedToggle, {
  type SegmentedToggleOption,
} from '../common/SegmentedToggle';
import { NUMERIC_KEYBOARD_ACCESSORY_ID } from '../NumericInputAccessory';
import { useTheme } from '../../contexts/ThemeContext';
import { labelForId } from '../../utils/pickerLabels';
import type { UseRecurringRuleFormResult } from '../../hooks/useRecurringRuleForm';
import type {
  RecurringRuleAccountRow,
  RecurringRuleCategoryRow,
} from '../../hooks/useRecurringRulesData';

const RULE_TYPE_OPTIONS: SegmentedToggleOption<'Income' | 'Expense'>[] = [
  { key: 'Income', label: 'Income' },
  { key: 'Expense', label: 'Expense' },
];

const DAY_OF_MONTH_OPTIONS = Array.from({ length: 31 }, (_, i) => ({
  label: String(i + 1),
  value: String(i + 1),
}));

type Props = {
  form: UseRecurringRuleFormResult;
  accounts: RecurringRuleAccountRow[];
  categories: RecurringRuleCategoryRow[];
};

// The full Add/Edit Rule form body — rendered inside a BottomSheetModal by
// the screen orchestrator, same split GoalFormFields uses for its own
// screen.
function RuleFormFields({ form, accounts, categories }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { values, error, accountId, currencyId, accountBalances } = form;
  const parsedDayPreview = Number(values.dayOfMonth);

  return (
    <>
      <Text style={[styles.label, { color: colors.text }]}>Type</Text>
      <SegmentedToggle
        options={RULE_TYPE_OPTIONS}
        value={values.ruleType}
        onChange={form.setRuleType}
      />

      <Text style={[styles.label, { color: colors.text }]}>Name</Text>
      <TextInput
        style={[
          styles.input,
          { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
        ]}
        value={values.name}
        onChangeText={form.setName}
        placeholder={values.ruleType === 'Income' ? 'e.g. Salary' : 'e.g. Netflix'}
        placeholderTextColor={colors.textSecondary}
      />

      <Text style={[styles.label, { color: colors.text }]}>Amount</Text>
      <TextInput
        style={[
          styles.input,
          { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
        ]}
        value={values.amount}
        onChangeText={form.setAmount}
        keyboardType="numeric"
        returnKeyType="done"
        inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
        placeholder="0.00"
        placeholderTextColor={colors.textSecondary}
      />

      <Text style={[styles.label, { color: colors.text }]}>Day of month</Text>
      <CollapsiblePicker
        displayLabel={`Day ${values.dayOfMonth}`}
        selectedValue={values.dayOfMonth}
        onValueChange={form.setDayOfMonth}
        items={DAY_OF_MONTH_OPTIONS}
        label="Day of month"
      />
      {parsedDayPreview >= 29 && (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Months without day {parsedDayPreview} will use their last day
          instead.
        </Text>
      )}

      <Text style={[styles.label, { color: colors.text }]}>Account</Text>
      {accounts.length === 0 ? (
        <EmptyState message="No eligible accounts available." />
      ) : (
        <CollapsiblePicker
          displayLabel={labelForId(accounts, accountId, 'name', 'Select account')}
          selectedValue={accountId != null ? String(accountId) : ''}
          onValueChange={value => form.setAccountId(Number(value))}
          items={accounts.map(a => ({
            label: `${a.name} (${a.type})`,
            value: String(a.id),
          }))}
          label="Account"
        />
      )}

      {accountBalances.length > 1 && (
        <>
          <Text style={[styles.label, { color: colors.text }]}>Currency</Text>
          <CollapsiblePicker
            displayLabel={labelForId(
              accountBalances.map(b => ({ ...b, id: b.currencyId })),
              currencyId,
              'currencyCode',
              'Select currency',
            )}
            selectedValue={currencyId != null ? String(currencyId) : ''}
            onValueChange={value => form.setCurrencyId(Number(value))}
            items={accountBalances.map(b => ({
              label: `${b.currencyCode} — ${b.currencyName}`,
              value: String(b.currencyId),
            }))}
            label="Currency"
          />
        </>
      )}

      {values.ruleType === 'Expense' && (
        <>
          <Text style={[styles.label, { color: colors.text }]}>Category</Text>
          {categories.length === 0 ? (
            <EmptyState message="No categories available." />
          ) : (
            <CollapsiblePicker
              displayLabel={labelForId(categories, values.categoryId, 'name', 'Select category')}
              selectedValue={values.categoryId != null ? String(values.categoryId) : ''}
              onValueChange={value => form.setCategoryId(Number(value))}
              items={categories.map(c => ({ label: c.name, value: String(c.id) }))}
              label="Category"
            />
          )}
        </>
      )}

      {error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}
    </>
  );
}

const styles = StyleSheet.create({
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

export default RuleFormFields;
