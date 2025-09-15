import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getBudgetForMonth,
  getCategories,
  getCategoryBudgetsForMonth,
  getMonthlyTotal,
  getTotalCashInHandByCurrency,
  getTotalCreditCardDebt,
  getTransactionsByMonth,
} from '../db/queries';
import {
  getAmountLeft,
  getAverageLeftPerDay,
  getCategoryAmountLeft,
  getCategoryAverageLeftPerDay,
} from '../utils/budgetCalculations';
import { getCurrentMonthString } from '../utils/date';

type CategoryBreakdownRow = {
  categoryId: number;
  categoryName: string;
  spent: number;
  budgetAmount: number | null;
  amountLeft: number | null;
  averageLeftPerDay: number | null;
};

function amountLeftStyleFor(spent: number, budgetAmount: number) {
  const percentUsed = budgetAmount > 0 ? spent / budgetAmount : 0;
  return percentUsed > 1
    ? styles.red
    : percentUsed >= 0.9
      ? styles.amber
      : styles.green;
}

function DashboardScreen(): React.JSX.Element {
  const [total, setTotal] = useState(0);
  const [budget, setBudget] = useState<
    Awaited<ReturnType<typeof getBudgetForMonth>>
  >(null);
  const [amountLeft, setAmountLeft] = useState<number | null>(null);
  const [averageLeftPerDay, setAverageLeftPerDay] = useState<number | null>(
    null,
  );
  const [cashInHandByCurrency, setCashInHandByCurrency] = useState<
    Record<string, number>
  >({});
  const [creditCardDebt, setCreditCardDebt] = useState(0);
  const [categoryBreakdown, setCategoryBreakdown] = useState<
    CategoryBreakdownRow[]
  >([]);
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
        getTotalCashInHandByCurrency(),
        getTotalCreditCardDebt(),
        getCategories(),
        getCategoryBudgetsForMonth(month),
        getTransactionsByMonth(month),
      ]).then(
        async ([
          monthlyTotal,
          monthlyBudget,
          left,
          avgLeftPerDay,
          cashByCurrency,
          cardDebt,
          categories,
          categoryBudgets,
          monthTransactions,
        ]) => {
          const spentByCategory = new Map<number, number>();
          for (const transaction of monthTransactions) {
            spentByCategory.set(
              transaction.categoryId,
              (spentByCategory.get(transaction.categoryId) ?? 0) +
                transaction.amount,
            );
          }
          const budgetByCategory = new Map(
            categoryBudgets.map(row => [row.categoryId, row.amount]),
          );
          const categoryIdsToShow = new Set<number>([
            ...spentByCategory.keys(),
            ...budgetByCategory.keys(),
          ]);
          const breakdown = await Promise.all(
            Array.from(categoryIdsToShow).map(async categoryId => {
              const categoryName =
                categories.find(c => c.id === categoryId)?.name ??
                'Unknown category';
              const spent = spentByCategory.get(categoryId) ?? 0;
              const budgetAmount = budgetByCategory.get(categoryId) ?? null;
              const hasBudget = budgetAmount !== null;
              const [rowAmountLeft, rowAverageLeftPerDay] = hasBudget
                ? await Promise.all([
                    getCategoryAmountLeft(month, categoryId),
                    getCategoryAverageLeftPerDay(month, categoryId),
                  ])
                : [null, null];
              return {
                categoryId,
                categoryName,
                spent,
                budgetAmount,
                amountLeft: rowAmountLeft,
                averageLeftPerDay: rowAverageLeftPerDay,
              };
            }),
          );
          breakdown.sort((a, b) => a.categoryName.localeCompare(b.categoryName));

          if (!cancelled) {
            setTotal(monthlyTotal);
            setBudget(monthlyBudget);
            setAmountLeft(left);
            setAverageLeftPerDay(avgLeftPerDay);
            setCashInHandByCurrency(cashByCurrency);
            setCreditCardDebt(cardDebt);
            setCategoryBreakdown(breakdown);
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
          {/* One line per currency — amounts are never summed across currencies. */}
          <Text style={styles.subtitle}>Total cash in hand</Text>
          {Object.keys(cashInHandByCurrency).length > 0 ? (
            Object.entries(cashInHandByCurrency)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([currencyCode, amount]) => (
                <Text style={styles.row} key={currencyCode}>
                  {currencyCode} {amount.toFixed(2)}
                </Text>
              ))
          ) : (
            <Text style={styles.row}>No cash accounts yet</Text>
          )}

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

          <Text style={styles.subtitle}>By Category</Text>
          <FlatList
            data={categoryBreakdown}
            keyExtractor={item => String(item.categoryId)}
            renderItem={({ item }) => (
              <View style={styles.categoryRow}>
                <Text style={styles.categoryName}>{item.categoryName}</Text>
                <Text style={styles.row}>Spent: {item.spent.toFixed(2)}</Text>
                {item.budgetAmount !== null && item.amountLeft !== null ? (
                  <>
                    <Text
                      style={[
                        styles.row,
                        amountLeftStyleFor(item.spent, item.budgetAmount),
                      ]}>
                      Left: {item.amountLeft.toFixed(2)}
                    </Text>
                    {item.averageLeftPerDay !== null && (
                      <Text style={styles.row}>
                        Average left per day:{' '}
                        {item.averageLeftPerDay.toFixed(2)}
                      </Text>
                    )}
                  </>
                ) : (
                  <Text style={styles.row}>
                    No budget set for this category yet
                  </Text>
                )}
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.row}>No category activity this month.</Text>
            }
          />
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
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  categoryRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
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
