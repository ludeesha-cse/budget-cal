import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getBudgetForMonth,
  getMonthlyTotal,
  getTotalCashInHand,
  getTotalCreditCardDebt,
} from '../db/queries';
import { getAmountLeft, getAverageLeftPerDay } from '../utils/budgetCalculations';
import { getCurrentMonthString } from '../utils/date';

function DashboardScreen(): React.JSX.Element {
  const [total, setTotal] = useState(0);
  const [budget, setBudget] = useState<
    Awaited<ReturnType<typeof getBudgetForMonth>>
  >(null);
  const [amountLeft, setAmountLeft] = useState<number | null>(null);
  const [averageLeftPerDay, setAverageLeftPerDay] = useState<number | null>(
    null,
  );
  const [cashInHand, setCashInHand] = useState(0);
  const [creditCardDebt, setCreditCardDebt] = useState(0);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      const month = getCurrentMonthString();
      Promise.all([
        getMonthlyTotal(month),
        getBudgetForMonth(month),
        getAmountLeft(month),
        getAverageLeftPerDay(month),
        getTotalCashInHand(),
        getTotalCreditCardDebt(),
      ]).then(
        ([monthlyTotal, monthlyBudget, left, avgLeftPerDay, totalCash, cardDebt]) => {
          if (!cancelled) {
            setTotal(monthlyTotal);
            setBudget(monthlyBudget);
            setAmountLeft(left);
            setAverageLeftPerDay(avgLeftPerDay);
            setCashInHand(totalCash);
            setCreditCardDebt(cardDebt);
            setLoading(false);
          }
        },
      );
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const percentUsed =
    budget && budget.limitAmount > 0 ? total / budget.limitAmount : 0;
  const amountLeftStyle =
    percentUsed > 1 ? styles.red : percentUsed >= 0.9 ? styles.amber : styles.green;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dashboard</Text>
      {loading ? (
        <ActivityIndicator size="large" />
      ) : (
        <>
          <Text style={styles.row}>
            Total cash in hand: {cashInHand.toFixed(2)}
          </Text>
          <Text style={[styles.row, styles.red]}>
            Credit card debt: {creditCardDebt.toFixed(2)}
          </Text>
          <Text style={styles.row}>
            Total spent this month: {total.toFixed(2)}
          </Text>
          {budget && amountLeft !== null ? (
            <>
              <Text style={styles.row}>
                Budget allocated: {budget.limitAmount.toFixed(2)}
              </Text>
              <Text style={[styles.row, amountLeftStyle]}>
                Amount left: {amountLeft.toFixed(2)}
              </Text>
              {averageLeftPerDay !== null && (
                <Text style={styles.row}>
                  Average left per day: {averageLeftPerDay.toFixed(2)}
                </Text>
              )}
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
  green: {
    color: '#2e7d32',
  },
  amber: {
    color: '#f9a825',
  },
  red: {
    color: '#c62828',
  },
});

export default DashboardScreen;
