import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MonthYearPicker from '../components/MonthYearPicker';
import { getAllBudgets, getBudgetForMonth, upsertBudget } from '../db/queries';
import { getCurrentMonthString, getCurrentYearString } from '../utils/date';

type BudgetRow = Awaited<ReturnType<typeof getAllBudgets>>[number];

function BudgetSettingsScreen(): React.JSX.Element {
  const [month, setMonth] = useState(getCurrentMonthString().slice(5));
  const [year, setYear] = useState(getCurrentYearString());
  const [amount, setAmount] = useState('');
  const [allBudgets, setAllBudgets] = useState<BudgetRow[]>([]);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const selectedMonth = `${year}-${month}`;

  const load = useCallback(async () => {
    const [existing, all] = await Promise.all([
      getBudgetForMonth(selectedMonth),
      getAllBudgets(),
    ]);
    setAmount(existing ? String(existing.limitAmount) : '');
    setAllBudgets(all);
  }, [selectedMonth]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    setSavedMessage(null);
  }, [selectedMonth]);

  const handleSave = async () => {
    const parsedAmount = Number(amount);
    if (!amount || Number.isNaN(parsedAmount)) {
      return;
    }
    await upsertBudget(selectedMonth, parsedAmount);
    setSavedMessage('Budget saved');
    load();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Budget Settings</Text>
      <MonthYearPicker
        month={month}
        year={year}
        onMonthChange={setMonth}
        onYearChange={setYear}
      />

      <Text style={styles.label}>Budget amount for {selectedMonth}</Text>
      <TextInput
        style={styles.input}
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
        placeholder="0.00"
      />
      {savedMessage && <Text style={styles.success}>{savedMessage}</Text>}
      <Button title="Save" onPress={handleSave} />

      <Text style={styles.subtitle}>Past budgets</Text>
      <FlatList
        data={allBudgets}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text>{item.month ?? '—'}</Text>
            <Text>{item.limitAmount.toFixed(2)}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No budgets set yet.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
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
    marginBottom: 12,
  },
  success: {
    color: '#2e7d32',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 8,
  },
  empty: {
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
});

export default BudgetSettingsScreen;
