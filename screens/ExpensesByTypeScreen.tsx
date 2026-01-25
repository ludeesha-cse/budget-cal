import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getExpensesByType } from '../db/queries';
import { getCurrentMonthString } from '../utils/date';
import { useTheme } from '../contexts/ThemeContext';

type ExpenseRow = Awaited<ReturnType<typeof getExpensesByType>>[number];

function ExpensesByTypeScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      getExpensesByType(getCurrentMonthString()).then(rows => {
        if (!cancelled) {
          setExpenses(rows);
          setLoading(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>
        Expenses by Type
      </Text>
      {loading ? (
        <ActivityIndicator size="large" />
      ) : expenses.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>
          No expenses recorded this month.
        </Text>
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={item => item.type}
          renderItem={({ item }) => (
            <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <Text style={{ color: colors.text }}>{item.type}</Text>
              <Text style={{ color: colors.text }}>
                {item.total.toFixed(2)}
              </Text>
            </View>
          )}
        />
      )}
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
  empty: {
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});

export default ExpensesByTypeScreen;
