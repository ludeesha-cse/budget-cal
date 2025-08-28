import React, { useEffect, useState } from 'react';
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
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { formatDateString } from '../utils/date';
import { getAccounts } from '../db/queries';
import CollapsiblePicker from './CollapsiblePicker';

export const TRANSACTION_CATEGORIES = [
  'Food',
  'Transport',
  'Bills',
  'Entertainment',
  'Other',
] as const;

export type TransactionCategory = (typeof TRANSACTION_CATEGORIES)[number];

export type TransactionFormSubmitValues = {
  date: string; // 'YYYY-MM-DD'
  amount: number;
  category: TransactionCategory;
  description: string;
  accountId: number;
};

type TransactionFormProps = {
  initialValues?: {
    date?: string;
    amount?: number;
    category?: TransactionCategory;
    description?: string;
    accountId?: number;
  };
  onSubmit: (values: TransactionFormSubmitValues) => void;
  submitLabel?: string;
};

function TransactionForm({
  initialValues,
  onSubmit,
  submitLabel = 'Save',
}: TransactionFormProps): React.JSX.Element {
  const [date, setDate] = useState(
    initialValues?.date ?? formatDateString(new Date()),
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [amount, setAmount] = useState(
    initialValues?.amount != null ? String(initialValues.amount) : '',
  );
  const [category, setCategory] = useState<TransactionCategory>(
    initialValues?.category ?? 'Food',
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAccounts().then(rows => {
      setAccounts(rows);
      setAccountId(current => current ?? rows[0]?.id ?? null);
    });
  }, []);

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
    setError(null);
    onSubmit({ date, amount: parsedAmount, category, description, accountId });
  };

  const selectedAccountName =
    accounts.find(a => a.id === accountId)?.name ?? 'Select account';

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Account</Text>
      <CollapsiblePicker
        displayLabel={selectedAccountName}
        selectedValue={accountId != null ? String(accountId) : ''}
        onValueChange={value => setAccountId(Number(value))}
        items={accounts.map(a => ({ label: a.name, value: String(a.id) }))}
      />

      <Text style={styles.label}>Date</Text>
      <Button title={date} onPress={() => setShowDatePicker(true)} />
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
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <DateTimePicker
                value={new Date(date)}
                mode="date"
                display="spinner"
                onChange={handleDateChange}
              />
              <Button title="Done" onPress={() => setShowDatePicker(false)} />
            </Pressable>
          </Pressable>
        </Modal>
      )}

      <Text style={styles.label}>Amount</Text>
      <TextInput
        style={styles.input}
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
        placeholder="0.00"
      />

      <Text style={styles.label}>Type</Text>
      <CollapsiblePicker
        displayLabel={category}
        selectedValue={category}
        onValueChange={value => setCategory(value as TransactionCategory)}
        items={TRANSACTION_CATEGORIES.map(c => ({ label: c, value: c }))}
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={styles.input}
        value={description}
        onChangeText={setDescription}
        placeholder="Optional"
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Button title={submitLabel} onPress={handleSubmit} />
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
    borderColor: '#999',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
  },
  error: {
    color: '#c0392b',
    marginTop: 12,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32,
  },
});

export default TransactionForm;
