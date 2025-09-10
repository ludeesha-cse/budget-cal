import React, { useCallback, useState } from 'react';
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
import {
  getCategories,
  getCategoryBudgetsForMonth,
  upsertCategoryBudget,
} from '../db/queries';
import { getCurrentMonthString, getCurrentYearString } from '../utils/date';

type CategoryRow = Awaited<ReturnType<typeof getCategories>>[number];

function CategoryBudgetsScreen(): React.JSX.Element {
  const [month, setMonth] = useState(getCurrentMonthString().slice(5));
  const [year, setYear] = useState(getCurrentYearString());
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const selectedMonth = `${year}-${month}`;

  const load = useCallback(async () => {
    setSavedMessage(null);
    const [allCategories, existingBudgets] = await Promise.all([
      getCategories(),
      getCategoryBudgetsForMonth(selectedMonth),
    ]);
    setCategories(allCategories);
    const byCategory: Record<number, string> = {};
    for (const budget of existingBudgets) {
      byCategory[budget.categoryId] = String(budget.amount);
    }
    setAmounts(byCategory);
  }, [selectedMonth]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleAmountChange = (categoryId: number, value: string) => {
    setAmounts(current => ({ ...current, [categoryId]: value }));
  };

  const handleSaveAll = async () => {
    const entries = Object.entries(amounts).filter(
      ([, value]) => value.trim() !== '',
    );
    await Promise.all(
      entries.map(([categoryId, value]) => {
        const parsedAmount = Number(value);
        if (Number.isNaN(parsedAmount)) {
          return Promise.resolve();
        }
        return upsertCategoryBudget(
          selectedMonth,
          Number(categoryId),
          parsedAmount,
        );
      }),
    );
    setSavedMessage('Category budgets saved');
    load();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Category Budgets</Text>
      <MonthYearPicker
        month={month}
        year={year}
        onMonthChange={setMonth}
        onYearChange={setYear}
      />

      <Text style={styles.label}>Budgets for {selectedMonth}</Text>
      {savedMessage && <Text style={styles.success}>{savedMessage}</Text>}

      <FlatList
        data={categories}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowName}>{item.name}</Text>
            <TextInput
              style={styles.input}
              value={amounts[item.id] ?? ''}
              onChangeText={value => handleAmountChange(item.id, value)}
              keyboardType="numeric"
              placeholder="0.00"
            />
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No categories yet.</Text>
        }
      />

      <Button title="Save All" onPress={handleSaveAll} />
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
  success: {
    color: '#2e7d32',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  rowName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#999',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
    width: 120,
    textAlign: 'right',
  },
  empty: {
    fontSize: 14,
    marginTop: 8,
  },
});

export default CategoryBudgetsScreen;
