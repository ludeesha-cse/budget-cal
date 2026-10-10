import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import Card from '../components/Card';
import EmptyState from '../components/common/EmptyState';
import ProgressBar from '../components/common/ProgressBar';
import CurrencyTabs from '../components/common/CurrencyTabs';
import {
  useExpenseCurrenciesForMonth,
  useExpensesByType,
} from '../hooks/queries';
import { getCurrentMonthString } from '../utils/date';
import { formatAmount } from '../utils/formatAmount';
import { useTheme } from '../contexts/ThemeContext';
import { scaleFont, typography } from '../theme/typography';
import { FAB_CLEARANCE } from '../theme/layout';

function ExpensesByTypeScreen(): React.JSX.Element {
  const { colors } = useTheme();
  // null until the currencies query resolves a starting tab, or
  // permanently null if there's no expense activity at all this month.
  const [currencyId, setCurrencyId] = useState<number | null>(null);
  const month = getCurrentMonthString();

  // Both reads are transactional-cached and keyed by (month, currency),
  // so flipping between currency tabs is free after each has been seen
  // once — where the old load() re-queried on every tab change AND on
  // every screen focus.
  const { data: currencies, isPending: currenciesPending } =
    useExpenseCurrenciesForMonth(month);

  const resolvedCurrencyId = useMemo(() => {
    if (!currencies) {
      return currencyId;
    }
    if (currencyId != null && currencies.some(c => c.id === currencyId)) {
      return currencyId;
    }
    return currencies[0]?.id ?? null;
  }, [currencies, currencyId]);

  useEffect(() => {
    if (resolvedCurrencyId !== currencyId) {
      setCurrencyId(resolvedCurrencyId);
    }
  }, [resolvedCurrencyId, currencyId]);

  const { data: expenses, isPending: expensesPending } = useExpensesByType(
    month,
    resolvedCurrencyId,
  );
  const loading =
    currenciesPending || (resolvedCurrencyId != null && expensesPending);

  const currencyCode =
    (currencies ?? []).find(c => c.id === currencyId)?.code ?? '';
  const rows = expenses ?? [];
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const sorted = [...rows].sort((a, b) => b.total - a.total);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[typography.screenTitle, styles.title, { color: colors.text }]}>
        Expenses by Type
      </Text>
      <Text style={[typography.eyebrow, styles.subtitle, { color: colors.textSecondary }]}>
        THIS MONTH
      </Text>

      {(currencies ?? []).length > 1 && (
        <CurrencyTabs
          currencies={currencies ?? []}
          value={currencyId}
          onChange={setCurrencyId}
          style={styles.currencyTabs}
        />
      )}

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : sorted.length === 0 ? (
        <EmptyState message="No expenses recorded this month." />
      ) : (
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
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
                    {formatAmount(item.total, currencyCode, { hideCode: true })}
                  </Text>
                </View>
                <ProgressBar percent={percent} color={dotColor} style={styles.progressTrack} />
              </Card>
            );
          }}
        />
      )}

      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        This is a quick month-at-a-glance view. For a deeper breakdown with
        custom date ranges, check the Reports tab.
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
  currencyTabs: {
    marginBottom: 12,
  },
  list: {
    marginTop: 4,
  },
  // Lets the last row scroll out from under the FAB.
  listContent: {
    paddingBottom: FAB_CLEARANCE,
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
    marginTop: 10,
  },
  hint: {
    fontSize: scaleFont(12.5),
    textAlign: 'center',
    marginTop: 12,
    lineHeight: scaleFont(18),
  },
});

export default ExpensesByTypeScreen;
