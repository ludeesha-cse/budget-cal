import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getBudgetForMonth, getMonthlyTotal } from '../db/queries';
import { getCurrentMonthString } from '../utils/date';

function DashboardScreen(): React.JSX.Element {
  const [total, setTotal] = useState(0);
  const [budget, setBudget] = useState<
    Awaited<ReturnType<typeof getBudgetForMonth>>
  >(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      const month = getCurrentMonthString();
      Promise.all([getMonthlyTotal(month), getBudgetForMonth(month)]).then(
        ([monthlyTotal, monthlyBudget]) => {
          if (!cancelled) {
            setTotal(monthlyTotal);
            setBudget(monthlyBudget);
            setLoading(false);
          }
        },
      );
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dashboard</Text>
      {loading ? (
        <ActivityIndicator size="large" />
      ) : (
        <>
          <Text style={styles.row}>
            Total spent this month: {total.toFixed(2)}
          </Text>
          {budget ? (
            <>
              <Text style={styles.row}>
                Budget allocated: {budget.limitAmount.toFixed(2)}
              </Text>
              <Text style={styles.row}>
                Amount left: {(budget.limitAmount - total).toFixed(2)}
              </Text>
            </>
          ) : (
            <Text style={styles.row}>No budget set for this month yet</Text>
          )}
        </>
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
  row: {
    fontSize: 16,
    marginBottom: 8,
  },
});

export default DashboardScreen;
