import React, { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { formatDateString } from '../utils/date';
import { labelForId } from '../utils/pickerLabels';
import { useReferenceData } from '../hooks/useReferenceData';
import { useAccountCurrency } from '../hooks/useAccountCurrency';
import { useAmountInput } from '../hooks/useAmountInput';
import { useFieldErrors } from '../hooks/useFieldErrors';
import { checkAmount } from '../utils/amountValidation';
import { reportError } from '../utils/appErrors';
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
import KeyboardAwareScrollView from './common/KeyboardAwareScrollView';

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
  // Awaited: a rejection is shown on the form (under the account picker
  // when it is about the account, otherwise as the form's message) and
  // the user's input is kept.
  onSubmit: (values: TransactionFormSubmitValues) => Promise<void> | void;
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
  const { amount, setAmount } = useAmountInput(initialValues?.amount);
  const amountCheck = checkAmount(amount);
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
  const { accountBalances, currencyId, setCurrencyId, balancesLoadedFor } =
    useAccountCurrency(accountId, initialValues?.currencyId);
  const [error, setError] = useState<string | null>(null);
  // Sentences about the chosen account / currency themselves (see
  // AccountCurrencyPicker). Cleared the moment the account, currency or
  // amount changes, since they describe the combination that was saved.
  const [accountError, setAccountError] = useState<string | null>(null);
  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    setAccountError(null);
    setCurrencyError(null);
  }, [accountId, currencyId, amount]);

  // One list feeding both the submit gate and, once the user has pressed
  // Save on an incomplete form, the red outlines. See
  // hooks/useFieldErrors for why the button is muted-but-pressable
  // rather than disabled.
  const missingFields = React.useMemo(() => {
    const missing: string[] = [];
    // Only a BLANK amount is outlined; a present-but-wrong one ("-5",
    // "abc") is explained in the message instead.
    if (amountCheck.kind === 'blank') {
      missing.push('amount');
    }
    if (accountId == null) {
      missing.push('accountId');
    }
    if (categoryId == null) {
      missing.push('categoryId');
    }
    if (currencyId == null) {
      missing.push('currencyId');
    }
    return missing;
  }, [amountCheck.kind, accountId, categoryId, currencyId]);
  const fieldErrors = useFieldErrors(missingFields);

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

  const handleSubmit = async () => {
    if (submitting) {
      return;
    }
    if (missingFields.length > 0) {
      fieldErrors.reveal();
    }
    if (accountId == null) {
      setError('Choose an account');
      return;
    }
    if (currencyId == null) {
      setError('Choose a currency');
      return;
    }
    if (amountCheck.kind === 'blank') {
      setError('Enter an amount');
      return;
    }
    if (amountCheck.kind === 'invalid') {
      setError(amountCheck.message);
      return;
    }
    if (entryType === 'Expense' && categoryId == null) {
      setError('Choose a category');
      return;
    }
    setError(null);

    fieldErrors.reset();
    setSubmitting(true);
    try {
      await onSubmit({
        date,
        amount: amountCheck.value,
        // Income carries no category; the picker is still shown for an
        // Income row being edited, so its value is passed through as-is.
        categoryId: categoryId as number,
        description,
        accountId,
        currencyId,
        entryType,
        tagIds: selectedTagIds,
        excludeFromBudget,
      });
    } catch (e) {
      const appError = reportError(e, {
        operation: entryType === 'Expense' ? 'Save expense' : 'Save income',
      });
      if (appError.field === 'account') {
        setAccountError(appError.message);
      } else if (appError.field === 'currency') {
        setCurrencyError(appError.message);
      } else {
        setError(appError.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCategoryName = labelForId(
    categories,
    categoryId,
    'name',
    'Select category',
  );

  const canSave = missingFields.length === 0;

  return (
    <KeyboardAwareScrollView
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
        accountInvalid={fieldErrors.isMissing('accountId')}
        currencyInvalid={fieldErrors.isMissing('currencyId')}
        accountError={accountError}
        currencyError={currencyError}
        balancesLoadedFor={balancesLoadedFor}
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

      <AmountInput
        value={amount}
        onChangeText={setAmount}
        invalid={fieldErrors.isMissing('amount')}
      />

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
        label="Category"
        invalid={fieldErrors.isMissing('categoryId')}
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
        submitting={submitting}
        label={submitLabel}
        onPress={handleSubmit}
      />
    </KeyboardAwareScrollView>
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
