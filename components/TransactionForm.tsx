import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { formatDateString } from '../utils/date';
import { getAccountBalances, getAccounts, getCategories } from '../db/queries';
import CollapsiblePicker from './CollapsiblePicker';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from './NumericInputAccessory';
import { useTheme } from '../contexts/ThemeContext';

// Liability/Receivable accounts are managed exclusively through the loan
// flows (create/reactivate a loan, and Stage 9b's settlement) — posting
// an ordinary Expense/Income straight to one would move money without
// going through that bookkeeping (no loan_payments row, no interest
// accrual reset), so they're never offered as a transaction account here.
const NON_TRANSACTABLE_ACCOUNT_TYPES = ['Liability', 'Receivable'];

export type TransactionFormSubmitValues = {
  date: string; // 'YYYY-MM-DD'
  amount: number;
  categoryId: number;
  description: string;
  accountId: number;
  currencyId: number;
  entryType: 'Expense' | 'Income';
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
  const [showDatePicker, setShowDatePicker] = useState(false);
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
    }, []),
  );

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

  const handleDateChange = (
    _event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (selectedDate) {
      setDate(formatDateString(selectedDate));
    }
    // Android's native dialog dismisses itself on pick/cancel; the iOS
    // popup modal (below) is closed explicitly via its Done button instead.
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
  };

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
    });
  };

  const selectedAccountName =
    accounts.find(a => a.id === accountId)?.name ?? 'Select account';
  const selectedCategoryName =
    categories.find(c => c.id === categoryId)?.name ?? 'Select category';

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      {!lockToExpense && (
        <>
          <Text style={[styles.label, { color: colors.text }]}>Type</Text>
          <View style={styles.toggleRow}>
            <Pressable
              style={[
                styles.toggleButton,
                { backgroundColor: colors.surface, borderColor: colors.primary },
                entryType === 'Expense' && { backgroundColor: colors.primary },
              ]}
              onPress={() => setEntryType('Expense')}>
              <Text
                style={[
                  styles.toggleButtonText,
                  { color: colors.primary },
                  entryType === 'Expense' && { color: colors.primaryText },
                ]}>
                Expense
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.toggleButton,
                { backgroundColor: colors.surface, borderColor: colors.primary },
                entryType === 'Income' && { backgroundColor: colors.primary },
              ]}
              onPress={() => setEntryType('Income')}>
              <Text
                style={[
                  styles.toggleButtonText,
                  { color: colors.primary },
                  entryType === 'Income' && { color: colors.primaryText },
                ]}>
                Income
              </Text>
            </Pressable>
          </View>
        </>
      )}

      <Text style={[styles.label, { color: colors.text }]}>Account</Text>
      <CollapsiblePicker
        displayLabel={selectedAccountName}
        selectedValue={accountId != null ? String(accountId) : ''}
        onValueChange={value => setAccountId(Number(value))}
        items={accounts.map(a => ({ label: a.name, value: String(a.id) }))}
      />

      {accountBalances.length > 1 && (
        <>
          <Text style={[styles.label, { color: colors.text }]}>Currency</Text>
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

      <Text style={[styles.label, { color: colors.text }]}>Date</Text>
      <Button
        title={date}
        color={colors.primary}
        onPress={() => {
          Keyboard.dismiss();
          setShowDatePicker(true);
        }}
      />
      {Platform.OS === 'android' ? (
        showDatePicker && (
          <DateTimePicker
            value={new Date(date)}
            mode="date"
            display="default"
            onChange={handleDateChange}
          />
        )
      ) : (
        <Modal
          visible={showDatePicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowDatePicker(false)}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowDatePicker(false)}>
            <Pressable
              style={[styles.modalCard, { backgroundColor: colors.surface }]}
              onPress={() => {}}>
              <DateTimePicker
                value={new Date(date)}
                mode="date"
                display="spinner"
                onChange={handleDateChange}
              />
              <Button
                title="Done"
                color={colors.primary}
                onPress={() => setShowDatePicker(false)}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}

      <Text style={[styles.label, { color: colors.text }]}>Amount</Text>
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
      <NumericInputAccessory />

      <Text style={[styles.label, { color: colors.text }]}>Category</Text>
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

      <Text style={[styles.label, { color: colors.text }]}>Description</Text>
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

      {error && (
        <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
      )}

      <Button title={submitLabel} color={colors.primary} onPress={handleSubmit} />
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
    fontSize: 14,
    fontWeight: '600',
    marginTop: 16,
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
    fontSize: 16,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  modalCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32,
  },
});

export default TransactionForm;
