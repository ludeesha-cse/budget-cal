import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Card from '../components/Card';
import { getExpensesByType } from '../db/queries';
import { getCurrentMonthString } from '../utils/date';
import { useTheme } from '../contexts/ThemeContext';
import { scaleFont, typography } from '../theme/typography';

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

  const total = expenses.reduce((sum, row) => sum + row.total, 0);
  const sorted = [...expenses].sort((a, b) => b.total - a.total);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[typography.screenTitle, styles.title, { color: colors.text }]}>
        Expenses by Type
      </Text>
      <Text style={[typography.eyebrow, styles.subtitle, { color: colors.textSecondary }]}>
        THIS MONTH
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : sorted.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>
          No expenses recorded this month.
        </Text>
      ) : (
        <FlatList
          style={styles.list}
          data={sorted}
          keyExtractor={item => item.type}
          renderItem={({ item, index }) => {
            const dotColor = colors.chart[index % colors.chart.length];
            const percent = total > 0 ? (item.total / total) * 100 : 0;
            return (
              <Card colors={colors} style={styles.row}>
                <View style={styles.rowTop}>
                  <View style={[styles.dot, { backgroundColor: dotColor }]} />
                  <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                    {item.type}
                  </Text>
                  <Text style={[typography.amountMono, styles.rowAmount, { color: colors.text }]}>
                    {item.total.toFixed(2)}
                  </Text>
                </View>
                <View
                  style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${percent}%`, backgroundColor: dotColor },
                    ]}
                  />
                </View>
              </Card>
            );
          }}
        />
      )}

      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        This is a quick month-at-a-glance view. For a deeper breakdown with
        custom date ranges and currencies, check the Reports tab.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    marginBottom: 2,
  },
  subtitle: {
    marginBottom: 16,
  },
  list: {
    marginTop: 4,
  },
  row: {
    padding: 14,
    marginBottom: 10,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  rowName: {
    flex: 1,
    fontSize: scaleFont(15),
    fontWeight: '600',
  },
  rowAmount: {
    fontSize: scaleFont(15),
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 10,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  empty: {
    fontSize: 15,
    marginTop: 24,
    textAlign: 'center',
  },
  hint: {
    fontSize: scaleFont(12.5),
    textAlign: 'center',
    marginTop: 12,
    lineHeight: scaleFont(18),
  },
});

export default ExpensesByTypeScreen;
