import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { formatDateString } from '../utils/date';
import { getAccountBalances, getAccounts } from '../db/queries';
import CollapsiblePicker from './CollapsiblePicker';
import { useTheme } from '../contexts/ThemeContext';

// Same exclusion as TransactionForm — Liability/Receivable accounts only
// ever move through the loan flows, and Income never gets posted to a
// closed account.
const NON_TRANSACTABLE_ACCOUNT_TYPES = ['Liability', 'Receivable'];

export type IncomeFormSubmitValues = {
  date: string; // 'YYYY-MM-DD'
  amount: number;
  accountId: number;
  currencyId: number;
  description: string;
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
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [accounts, setAccounts] = useState<Awaited<ReturnType<typeof getAccounts>>>(
    [],
  );
  const [accountId, setAccountId] = useState<number | null>(null);
  const [accountBalances, setAccountBalances] = useState<
    Awaited<ReturnType<typeof getAccountBalances>>
  >([]);
  const [currencyId, setCurrencyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      getAccounts().then(rows => {
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
    }, []),
  );

  // Same reset-on-switch behavior as TransactionForm: a new account
  // always re-derives its currency choice rather than keeping a stale one.
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
      setCurrencyId(balances.length === 1 ? balances[0].currencyId : null);
    });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const handleDateChange = (
    _event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (selectedDate) {
      setDate(formatDateString(selectedDate));
    }
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
    if (currencyId == null) {
      setError('Select a currency');
      return;
    }
    setError(null);
    onSubmit({ date, amount: parsedAmount, accountId, currencyId, description });
  };

  const selectedAccountName =
    accounts.find(a => a.id === accountId)?.name ?? 'Select account';

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
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
      <Button title={date} color={colors.primary} onPress={() => setShowDatePicker(true)} />
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
        placeholder="0.00"
        placeholderTextColor={colors.textSecondary}
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

export default IncomeForm;
