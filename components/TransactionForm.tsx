import React, { useCallback, useState } from 'react';
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
import { getAccounts, getCategories } from '../db/queries';
import CollapsiblePicker from './CollapsiblePicker';

export type TransactionFormSubmitValues = {
  date: string; // 'YYYY-MM-DD'
  amount: number;
  categoryId: number;
  description: string;
  accountId: number;
};

type TransactionFormProps = {
  initialValues?: {
    date?: string;
    amount?: number;
    categoryId?: number;
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
  const [error, setError] = useState<string | null>(null);

  // Refetch on every focus (not just on mount) so accounts/categories
  // added, edited, or deleted elsewhere show up immediately without
  // needing to reload the app.
  useFocusEffect(
    useCallback(() => {
      getAccounts().then(rows => {
        setAccounts(rows);
        setAccountId(current =>
          current != null && rows.some(a => a.id === current)
            ? current
            : rows[0]?.id ?? null,
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
    setError(null);
    onSubmit({
      date,
      amount: parsedAmount,
      categoryId,
      description,
      accountId,
    });
  };

  const selectedAccountName =
    accounts.find(a => a.id === accountId)?.name ?? 'Select account';
  const selectedCategoryName =
    categories.find(c => c.id === categoryId)?.name ?? 'Select category';

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

      <Text style={styles.label}>Category</Text>
      <CollapsiblePicker
        displayLabel={selectedCategoryName}
        selectedValue={categoryId != null ? String(categoryId) : ''}
        onValueChange={value => setCategoryId(Number(value))}
        items={categories.map(c => ({ label: c.name, value: String(c.id) }))}
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
