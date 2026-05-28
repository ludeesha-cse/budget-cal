import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Check } from 'lucide-react-native';
import { formatDateString } from '../utils/date';
import {
  getAccountBalances,
  getAccounts,
  getCategories,
  getTags,
} from '../db/queries';
import Card from './Card';
import CollapsiblePicker from './CollapsiblePicker';
import SegmentedToggle, {
  type SegmentedToggleOption,
} from './common/SegmentedToggle';
import DateField from './common/DateField';
import TagPicker from './common/TagPicker';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from './NumericInputAccessory';
import { useTheme } from '../contexts/ThemeContext';
import { scaleFont, typography } from '../theme/typography';

// Liability/Receivable accounts are managed exclusively through the loan
// flows (create/reactivate a loan, and Stage 9b's settlement) — posting
// an ordinary Expense/Income straight to one would move money without
// going through that bookkeeping (no loan_payments row, no interest
// accrual reset), so they're never offered as a transaction account here.
const NON_TRANSACTABLE_ACCOUNT_TYPES = ['Liability', 'Receivable'];

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
  const [amount, setAmount] = useState(
    initialValues?.amount != null ? String(initialValues.amount) : '',
  );
  const [description, setDescription] = useState(
    initialValues?.description ?? '',
  );
  const [accounts, setAccounts] = useState<Awaited<ReturnType<typeof getAccounts>>>(
    [],
  );
  const [accountId, setAccountId] = useState<number | null>(
    initialValues?.accountId ?? null,
  );
  const [categories, setCategories] = useState<
    Awaited<ReturnType<typeof getCategories>>
  >([]);
  const [categoryId, setCategoryId] = useState<number | null>(
    initialValues?.categoryId ?? null,
  );
  const [entryType, setEntryType] = useState<'Expense' | 'Income'>(
    lockToExpense ? 'Expense' : (initialValues?.entryType ?? 'Expense'),
  );
  const [tags, setTags] = useState<Awaited<ReturnType<typeof getTags>>>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>(
    initialValues?.tagIds ?? [],
  );
  const [excludeFromBudget, setExcludeFromBudget] = useState(
    initialValues?.excludeFromBudget ?? false,
  );
  // Which currencies the selected account actually holds, and which one
  // is chosen. Now persisted on the transaction itself
  // (transactions.currencyId) as of Stage 8.
  const [accountBalances, setAccountBalances] = useState<
    Awaited<ReturnType<typeof getAccountBalances>>
  >([]);
  const [currencyId, setCurrencyId] = useState<number | null>(null);
  // Whether the account-currencies effect below has run at least once —
  // only that first run honors initialValues.currencyId (editing an
  // existing transaction); every run after an actual account switch
  // resets to "no selection" or the account's one currency instead.
  const [hasInitializedCurrency, setHasInitializedCurrency] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refetch on every focus (not just on mount) so accounts/categories
  // added, edited, or deleted elsewhere show up immediately without
  // needing to reload the app.
  useFocusEffect(
    useCallback(() => {
      getAccounts().then(rows => {
        // Closed accounts can't take new activity either — same rule as
        // the Liability/Receivable exclusion above, just for a different
        // reason (the account was deliberately shut down).
        const selectable = rows.filter(
          a => a.active && !NON_TRANSACTABLE_ACCOUNT_TYPES.includes(a.type),
        );
        setAccounts(selectable);
        setAccountId(current =>
          current != null && selectable.some(a => a.id === current)
            ? current
            : selectable[0]?.id ?? null,
        );
      });
      getCategories().then(rows => {
        setCategories(rows);
        setCategoryId(current =>
          current != null && rows.some(c => c.id === current)
            ? current
            : rows[0]?.id ?? null,
        );
      });
      // Only refreshes the available options — never touches
      // selectedTagIds, so a tag added/deleted elsewhere shows up here
      // without disturbing whatever's already checked on this form.
      getTags().then(setTags);
    }, []),
  );

  const toggleTag = (tagId: number) => {
    setSelectedTagIds(current =>
      current.includes(tagId)
        ? current.filter(id => id !== tagId)
        : [...current, tagId],
    );
  };

  // After an account is picked (including the initial default), load only
  // that account's own currencies. Switching accounts always resets the
  // currency choice rather than leaving a stale, invalid selection —
  // silently to the account's one currency if it only has one, or to
  // "unselected" if there's a real choice to make.
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
      const initialCurrencyStillValid =
        !hasInitializedCurrency &&
        initialValues?.currencyId != null &&
        balances.some(b => b.currencyId === initialValues.currencyId);
      setCurrencyId(
        initialCurrencyStillValid
          ? initialValues!.currencyId!
          : balances.length === 1
            ? balances[0].currencyId
            : null,
      );
      setHasInitializedCurrency(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const handleSubmit = () => {
    const parsedAmount = Number(amount);
    if (!amount || Number.isNaN(parsedAmount)) {
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

  const selectedAccountName =
    accounts.find(a => a.id === accountId)?.name ?? 'Select account';
  const selectedCategoryName =
    categories.find(c => c.id === categoryId)?.name ?? 'Select category';

  const canSave =
    amount.trim() !== '' &&
    !Number.isNaN(Number(amount)) &&
    accountId != null &&
    categoryId != null &&
    currencyId != null;

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

      <Text
        style={[typography.eyebrow, styles.label, { color: colors.textSecondary }]}>
        ACCOUNT
      </Text>
      <CollapsiblePicker
        displayLabel={selectedAccountName}
        selectedValue={accountId != null ? String(accountId) : ''}
        onValueChange={value => setAccountId(Number(value))}
        items={accounts.map(a => ({ label: a.name, value: String(a.id) }))}
      />

      {accountBalances.length > 1 && (
        <>
          <Text
            style={[typography.eyebrow, styles.label, { color: colors.textSecondary }]}>
            CURRENCY
          </Text>
          <CollapsiblePicker
            displayLabel={
              accountBalances.find(b => b.currencyId === currencyId)
                ?.currencyCode ?? 'Select currency'
            }
            selectedValue={currencyId != null ? String(currencyId) : ''}
            onValueChange={value => setCurrencyId(Number(value))}
            items={accountBalances.map(b => ({
              label: `${b.currencyCode} — ${b.currencyName}`,
              value: String(b.currencyId),
            }))}
          />
        </>
      )}

      <Text
        style={[typography.eyebrow, styles.label, { color: colors.textSecondary }]}>
        DATE
      </Text>
      <DateField value={date} onChange={setDate} />

      <Text
        style={[typography.eyebrow, styles.label, { color: colors.textSecondary }]}>
        AMOUNT
      </Text>
      <TextInput
        style={[
          typography.amountLarge,
          styles.amountInput,
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
      <NumericInputAccessory />

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

      <Text
        style={[typography.eyebrow, styles.label, { color: colors.textSecondary }]}>
        TAGS
      </Text>
      <TagPicker tags={tags} selectedIds={selectedTagIds} onToggle={toggleTag} />

      <Card colors={colors} style={styles.checkboxCard}>
        <Pressable
          style={styles.checkboxRow}
          onPress={() => setExcludeFromBudget(current => !current)}>
          <View
            style={[
              styles.checkboxBox,
              { borderColor: colors.primary },
              excludeFromBudget && { backgroundColor: colors.primary },
            ]}>
            {excludeFromBudget && (
              <Check size={13} color={colors.primaryText} strokeWidth={3} />
            )}
          </View>
          <View style={styles.checkboxLabelArea}>
            <Text style={[styles.checkboxLabel, { color: colors.text }]}>
              Exclude from budget
            </Text>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Still real spending/income, but won't count toward budgets or
              reports — e.g. a reimbursed purchase.
            </Text>
          </View>
        </Pressable>
      </Card>

      {error && (
        <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
      )}

      <Pressable
        disabled={!canSave}
        style={[
          styles.submitButton,
          { backgroundColor: !canSave ? colors.neutralSoft : colors.primary },
        ]}
        onPress={handleSubmit}>
        <Text
          style={[
            styles.submitButtonText,
            { color: !canSave ? colors.textSecondary : colors.primaryText },
          ]}>
          {submitLabel}
        </Text>
      </Pressable>
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
  amountInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  error: {
    marginTop: 12,
  },
  hint: {
    fontSize: scaleFont(12.5),
    lineHeight: scaleFont(17),
  },
  checkboxCard: {
    padding: 14,
    marginTop: 16,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxLabelArea: {
    flex: 1,
  },
  checkboxLabel: {
    fontSize: scaleFont(15),
    fontWeight: '600',
    marginBottom: 2,
  },
  submitButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  submitButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
});

export default TransactionForm;
