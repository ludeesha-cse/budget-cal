import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { formatDateString } from '../utils/date';
import { useReferenceData } from '../hooks/useReferenceData';
import { useAccountCurrency } from '../hooks/useAccountCurrency';
import { useAmountInput } from '../hooks/useAmountInput';
import { useFieldErrors } from '../hooks/useFieldErrors';
import DateField from './common/DateField';
import AccountCurrencyPicker from './common/AccountCurrencyPicker';
import AmountInput from './common/AmountInput';
import TagSection from './common/TagSection';
import ExcludeFromBudgetCheckbox from './common/ExcludeFromBudgetCheckbox';
import FormSubmitButton from './common/FormSubmitButton';
import { useTheme } from '../contexts/ThemeContext';
import { typography } from '../theme/typography';

export type IncomeFormSubmitValues = {
  date: string; // 'YYYY-MM-DD'
  amount: number;
  accountId: number;
  currencyId: number;
  description: string;
  tagIds: number[]; // Stage 15 — the caller passes this straight to setTransactionTags after the transaction itself is saved
  excludeFromBudget: boolean; // Stage 16a — real income that shouldn't count toward budgets or reports
};

type IncomeFormProps = {
  onSubmit: (values: IncomeFormSubmitValues) => void;
  submitLabel?: string;
};

// Deliberately no category field anywhere in this component — Income
// entries carry no category at all (transactions.categoryId is nullable
// specifically so this form never has to pick one).
function IncomeForm({
  onSubmit,
  submitLabel = 'Save',
}: IncomeFormProps): React.JSX.Element {
  const { colors } = useTheme();
  const [date, setDate] = useState(formatDateString(new Date()));
  const { amount, setAmount, parsedAmount, isValid: amountValid } =
    useAmountInput();
  const [description, setDescription] = useState('');
  const { accounts, tags } = useReferenceData();
  const [accountId, setAccountId] = useState<number | null>(null);
  const { accountBalances, currencyId, setCurrencyId } =
    useAccountCurrency(accountId);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [excludeFromBudget, setExcludeFromBudget] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same shape as TransactionForm's — one list driving both the submit
  // gate and the red outlines. An Income entry carries no category at
  // all, which is why that field is absent here.
  const missingFields = React.useMemo(() => {
    const missing: string[] = [];
    if (!amountValid) {
      missing.push('amount');
    }
    if (accountId == null) {
      missing.push('accountId');
    }
    if (currencyId == null) {
      missing.push('currencyId');
    }
    return missing;
  }, [amountValid, accountId, currencyId]);
  const fieldErrors = useFieldErrors(missingFields);

  // Keeps the current account selection valid (or falls back to the
  // first) whenever the reference-data list itself changes, same
  // responsibility useReferenceData deliberately leaves to callers.
  React.useEffect(() => {
    setAccountId(current =>
      current != null && accounts.some(a => a.id === current)
        ? current
        : (accounts[0]?.id ?? null),
    );
  }, [accounts]);

  const handleSubmit = () => {
    if (missingFields.length > 0) {
      fieldErrors.reveal();
    }
    if (!amountValid) {
      setError('Enter a valid amount');
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
    setError(null);
    onSubmit({
      date,
      amount: parsedAmount,
      accountId,
      currencyId,
      description,
      tagIds: selectedTagIds,
      excludeFromBudget,
    });
  };

  const canSave = missingFields.length === 0;

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      <AccountCurrencyPicker
        accountInvalid={fieldErrors.isMissing('accountId')}
        currencyInvalid={fieldErrors.isMissing('currencyId')}
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
        hint="Still real income, but won't count toward budgets or reports."
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

export default IncomeForm;
