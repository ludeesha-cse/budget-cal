import React, { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { formatDateString } from '../utils/date';
import { useReferenceData } from '../hooks/useReferenceData';
import { useAccountCurrency } from '../hooks/useAccountCurrency';
import { useAmountInput } from '../hooks/useAmountInput';
import { useFieldErrors } from '../hooks/useFieldErrors';
import { checkAmount } from '../utils/amountValidation';
import { reportError } from '../utils/appErrors';
import DateField from './common/DateField';
import AccountCurrencyPicker from './common/AccountCurrencyPicker';
import AmountInput from './common/AmountInput';
import TagSection from './common/TagSection';
import ExcludeFromBudgetCheckbox from './common/ExcludeFromBudgetCheckbox';
import FormSubmitButton from './common/FormSubmitButton';
import { useTheme } from '../contexts/ThemeContext';
import { typography } from '../theme/typography';
import KeyboardAwareScrollView from './common/KeyboardAwareScrollView';

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
  // Awaited — see TransactionForm's onSubmit.
  onSubmit: (values: IncomeFormSubmitValues) => Promise<void> | void;
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
  const { amount, setAmount } = useAmountInput();
  const amountCheck = checkAmount(amount);
  const [description, setDescription] = useState('');
  const { accounts, tags } = useReferenceData();
  const [accountId, setAccountId] = useState<number | null>(null);
  const { accountBalances, currencyId, setCurrencyId, balancesLoadedFor } =
    useAccountCurrency(accountId);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [excludeFromBudget, setExcludeFromBudget] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // See TransactionForm: messages about the chosen account / currency,
  // cleared when either (or the amount) changes.
  const [accountError, setAccountError] = useState<string | null>(null);
  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    setAccountError(null);
    setCurrencyError(null);
  }, [accountId, currencyId, amount]);

  // Same shape as TransactionForm's — one list driving both the submit
  // gate and the red outlines. An Income entry carries no category at
  // all, which is why that field is absent here.
  const missingFields = React.useMemo(() => {
    const missing: string[] = [];
    if (amountCheck.kind === 'blank') {
      missing.push('amount');
    }
    if (accountId == null) {
      missing.push('accountId');
    }
    if (currencyId == null) {
      missing.push('currencyId');
    }
    return missing;
  }, [amountCheck.kind, accountId, currencyId]);
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
    setError(null);
    fieldErrors.reset();
    setSubmitting(true);
    try {
      await onSubmit({
        date,
        amount: amountCheck.value,
        accountId,
        currencyId,
        description,
        tagIds: selectedTagIds,
        excludeFromBudget,
      });
    } catch (e) {
      const appError = reportError(e, { operation: 'Save income' });
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

  const canSave = missingFields.length === 0;

  return (
    <KeyboardAwareScrollView
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
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

export default IncomeForm;
