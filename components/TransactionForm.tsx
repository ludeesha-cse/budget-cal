import React, { useState } from 'react';
import {
  Button,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { formatDateString } from '../utils/date';

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
};

type TransactionFormProps = {
  initialValues?: {
    date?: string;
    amount?: number;
    category?: TransactionCategory;
    description?: string;
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
  const [error, setError] = useState<string | null>(null);

  const handleDateChange = (
    _event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDate(formatDateString(selectedDate));
    }
  };

  const handleSubmit = () => {
    const parsedAmount = Number(amount);
    if (!amount || Number.isNaN(parsedAmount)) {
      setError('Enter a valid amount');
      return;
    }
    setError(null);
    onSubmit({ date, amount: parsedAmount, category, description });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Date</Text>
      <Button title={date} onPress={() => setShowDatePicker(true)} />
      {showDatePicker && (
        <DateTimePicker
          value={new Date(date)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange}
        />
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
      <View style={styles.pickerWrapper}>
        <Picker
          selectedValue={category}
          onValueChange={value => setCategory(value)}>
          {TRANSACTION_CATEGORIES.map(c => (
            <Picker.Item key={c} label={c} value={c} />
          ))}
        </Picker>
      </View>

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={styles.input}
        value={description}
        onChangeText={setDescription}
        placeholder="Optional"
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Button title={submitLabel} onPress={handleSubmit} />
    </View>
  );
}

const styles = StyleSheet.create({
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
  pickerWrapper: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#999',
    borderRadius: 6,
  },
  error: {
    color: '#c0392b',
    marginTop: 12,
  },
});

export default TransactionForm;
