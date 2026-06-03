import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { formatDateString } from '../utils/date';
import { labelForId } from '../utils/pickerLabels';
import { useReferenceData } from '../hooks/useReferenceData';
import { useAccountCurrency } from '../hooks/useAccountCurrency';
import { useAmountInput } from '../hooks/useAmountInput';
import CollapsiblePicker from './CollapsiblePicker';
import SegmentedToggle, {
  type SegmentedToggleOption,
} from './common/SegmentedToggle';
import DateField from './common/DateField';
import AccountCurrencyPicker from './common/AccountCurrencyPicker';
import AmountInput from './common/AmountInput';
import TagSection from './common/TagSection';
import ExcludeFromBudgetCheckbox from './common/ExcludeFromBudgetCheckbox';
import FormSubmitButton from './common/FormSubmitButton';
import { useTheme } from '../contexts/ThemeContext';
import { typography } from '../theme/typography';

const ENTRY_TYPE_OPTIONS: SegmentedToggleOption<'Expense' | 'Income'>[] = [
  { key: 'Expense', label: 'Expense' },
  { key: 'Income', label: 'Income' },
];

export type TransactionFormSubmitValues = {
  date: string; // 'YYYY-MM-DD'
  amount: number;
  categoryId: number;
  description: string;
  accountId: number;
  currencyId: number;
  entryType: 'Expense' | 'Income';
  tagIds: number[]; // Stage 15 — the caller passes this straight to setTransactionTags after the transaction itself is saved
  excludeFromBudget: boolean; // Stage 16a — real spending/income that shouldn't count toward budgets or reports
};

type TransactionFormProps = {
  initialValues?: {
    date?: string;
    amount?: number;
    categoryId?: number;
    description?: string;
    accountId?: number;
    currencyId?: number;
    entryType?: 'Expense' | 'Income';
    tagIds?: number[]; // currently-applied tags, only meaningful when editing an existing transaction
    excludeFromBudget?: boolean;
  };
  onSubmit: (values: TransactionFormSubmitValues) => void;
  submitLabel?: string;
  // When true, hides the Expense/Income toggle and the form always
  // submits entryType: 'Expense'. The Add tab now has a dedicated Income
  // tab/form with no category picker at all, so the old in-form toggle
  // would let someone create a categorized Income entry from the Expense
  // tab — exactly what the new Income tab exists to prevent. Left off by
  // default so EditTransactionScreen (unchanged) can still edit Income
  // rows created before Income got its own tab.
  lockToExpense?: boolean;
};

function TransactionForm({
  initialValues,
  onSubmit,
  submitLabel = 'Save',
  lockToExpense = false,
}: TransactionFormProps): React.JSX.Element {
  const { colors } = useTheme();
  const [date, setDate] = useState(
    initialValues?.date ?? formatDateString(new Date()),
  );
  const { amount, setAmount, parsedAmount, isValid: amountValid } =
    useAmountInput(initialValues?.amount);
  const [description, setDescription] = useState(
    initialValues?.description ?? '',
  );
  const { accounts, categories, tags } = useReferenceData();
  const [accountId, setAccountId] = useState<number | null>(
    initialValues?.accountId ?? null,
  );
  const [categoryId, setCategoryId] = useState<number | null>(
    initialValues?.categoryId ?? null,
  );
  const [entryType, setEntryType] = useState<'Expense' | 'Income'>(
    lockToExpense ? 'Expense' : (initialValues?.entryType ?? 'Expense'),
  );
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>(
    initialValues?.tagIds ?? [],
  );
  const [excludeFromBudget, setExcludeFromBudget] = useState(
    initialValues?.excludeFromBudget ?? false,
  );
  const { accountBalances, currencyId, setCurrencyId } = useAccountCurrency(
    accountId,
    initialValues?.currencyId,
  );
  const [error, setError] = useState<string | null>(null);

  // Keeps the current account/category selections valid (or falls back to
  // the first) whenever the reference-data lists themselves change, same
  // responsibility useReferenceData deliberately leaves to callers.
  React.useEffect(() => {
    setAccountId(current =>
      current != null && accounts.some(a => a.id === current)
        ? current
        : (accounts[0]?.id ?? null),
    );
  }, [accounts]);

  React.useEffect(() => {
    setCategoryId(current =>
      current != null && categories.some(c => c.id === current)
        ? current
        : (categories[0]?.id ?? null),
    );
  }, [categories]);

  const handleSubmit = () => {
    if (!amountValid) {
      setError('Enter a valid amount');
      return;
    }
    if (accountId == null) {
      setError('Select an account');
      return;
    }
    if (categoryId == null) {
      setError('Select a category');
      return;
    }
    if (currencyId == null) {
      setError('Select a currency');
      return;
    }
    setError(null);
    onSubmit({
      date,
      amount: parsedAmount,
      categoryId,
      description,
      accountId,
      currencyId,
      entryType,
      tagIds: selectedTagIds,
      excludeFromBudget,
    });
  };

  const selectedCategoryName = labelForId(
    categories,
    categoryId,
    'name',
    'Select category',
  );

  const canSave =
    amountValid && accountId != null && categoryId != null && currencyId != null;

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      {!lockToExpense && (
        <>
          <Text
            style={[typography.eyebrow, styles.label, { color: colors.textSecondary }]}>
            TYPE
          </Text>
          <SegmentedToggle
            options={ENTRY_TYPE_OPTIONS}
            value={entryType}
            onChange={setEntryType}
          />
        </>
      )}

      <AccountCurrencyPicker
        accounts={accounts}
        accountId={accountId}
        onAccountIdChange={setAccountId}
        accountBalances={accountBalances}
        currencyId={currencyId}
        onCurrencyIdChange={setCurrencyId}
      />

      <Text
        style={[typography.eyebrow, styles.label, { color: colors.textSecondary }]}>
        DATE
      </Text>
      <DateField value={date} onChange={setDate} />

      <AmountInput value={amount} onChangeText={setAmount} />

      <Text
        style={[typography.eyebrow, styles.label, { color: colors.textSecondary }]}>
        CATEGORY
      </Text>
      <CollapsiblePicker
        displayLabel={selectedCategoryName}
        selectedValue={categoryId != null ? String(categoryId) : ''}
        onValueChange={value => setCategoryId(Number(value))}
        items={categories.map(c => ({
          // Cosmetic-only flag for the reserved balance-correction
          // category — it's still a normal, selectable/editable category.
          label: c.name === 'Bank' ? `${c.name} (reserved)` : c.name,
          value: String(c.id),
        }))}
      />

      <Text
        style={[typography.eyebrow, styles.label, { color: colors.textSecondary }]}>
        DESCRIPTION
      </Text>
      <TextInput
        style={[
          styles.input,
          { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
        ]}
        value={description}
        onChangeText={setDescription}
        placeholder="Optional"
        placeholderTextColor={colors.textSecondary}
      />

      <TagSection
        tags={tags}
        selectedIds={selectedTagIds}
        onChange={setSelectedTagIds}
      />

      <ExcludeFromBudgetCheckbox
        checked={excludeFromBudget}
        onToggle={() => setExcludeFromBudget(current => !current)}
        hint="Still real spending/income, but won't count toward budgets or reports — e.g. a reimbursed purchase."
      />

      <FormSubmitButton
        error={error}
        canSave={canSave}
        label={submitLabel}
        onPress={handleSubmit}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    padding: 16,
  },
  label: {
    marginTop: 16,
    marginBottom: 6,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
});

export default TransactionForm;
