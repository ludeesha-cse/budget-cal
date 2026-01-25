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
  getActiveLoanAccounts,
  getBudgetForMonth,
  getCategories,
  getCategoryBudgetsForMonth,
  getLoanTotalOwed,
  getMonthlyIncome,
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
import { getCurrentDateString, getCurrentMonthString } from '../utils/date';
import { useTheme } from '../contexts/ThemeContext';

const DUE_SOON_WINDOW_DAYS = 7;

type UpcomingLoanRow = {
  accountId: number;
  counterpartyName: string;
  type: 'Liability' | 'Receivable';
  currencyCode: string;
  totalOwed: number;
  dueDate: string;
  daysUntilDue: number; // negative once overdue
};

// Whole calendar days from today to dueDate — negative once the due date
// has passed, same UTC-midnight-parse trick as
// utils/interestCalculations.ts's daysBetween, kept separate since this
// one only needs to compare against "today" rather than two arbitrary
// dates.
function daysUntil(dueDate: string, today: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const due = new Date(`${dueDate}T00:00:00Z`).getTime();
  const now = new Date(`${today}T00:00:00Z`).getTime();
  return Math.round((due - now) / msPerDay);
}

// Outstanding totals grouped by currency, never summed across
// currencies — same rule as everywhere else this app shows money.
function totalsByCurrency(
  rows: { currencyCode: string; totalOwed: number }[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    totals[row.currencyCode] = (totals[row.currencyCode] ?? 0) + row.totalOwed;
  }
  return totals;
}

function formatCurrencyTotals(totals: Record<string, number>): string {
  const entries = Object.entries(totals).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    return 'None';
  }
  return entries
    .map(([code, amount]) => `${code} ${amount.toFixed(2)}`)
    .join(' · ');
}

type CategoryBreakdownRow = {
  categoryId: number;
  categoryName: string;
  spent: number;
  budgetAmount: number | null;
  amountLeft: number | null;
  averageLeftPerDay: number | null;
};

function amountLeftStyleFor(
  spent: number,
  budgetAmount: number,
  colors: { danger: string; warning: string; success: string },
) {
  const percentUsed = budgetAmount > 0 ? spent / budgetAmount : 0;
  return percentUsed > 1
    ? { color: colors.danger }
    : percentUsed >= 0.9
      ? { color: colors.warning }
      : { color: colors.success };
}

function DashboardScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const [total, setTotal] = useState(0);
  const [totalIncome, setTotalIncome] = useState(0);
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
  const [liabilityTotals, setLiabilityTotals] = useState<Record<string, number>>(
    {},
  );
  const [receivableTotals, setReceivableTotals] = useState<
    Record<string, number>
  >({});
  const [upcomingLoans, setUpcomingLoans] = useState<UpcomingLoanRow[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      const month = getCurrentMonthString();
      Promise.all([
        getMonthlyTotal(month),
        getMonthlyIncome(month),
        getBudgetForMonth(month),
        getAmountLeft(month),
        getAverageLeftPerDay(month),
        getTotalCashInHandByCurrency(),
        getTotalCreditCardDebt(),
        getCategories(),
        getCategoryBudgetsForMonth(month),
        getTransactionsByMonth(month),
        getActiveLoanAccounts('Liability'),
        getActiveLoanAccounts('Receivable'),
      ]).then(
        async ([
          monthlyTotal,
          monthlyIncome,
          monthlyBudget,
          left,
          avgLeftPerDay,
          cashByCurrency,
          cardDebt,
          categories,
          categoryBudgets,
          monthTransactions,
          liabilities,
          receivables,
        ]) => {
          // Expense-only, same as getMonthlyTotal — an Income entry
          // filed under a category shouldn't reduce how "spent" it looks.
          // Every Expense still requires a category (only Income can be
          // null, as of the categoryId-nullable migration); the null
          // check here just satisfies that at the type level too.
          const spentByCategory = new Map<number, number>();
          for (const transaction of monthTransactions) {
            if (
              transaction.entryType !== 'Expense' ||
              transaction.categoryId == null
            ) {
              continue;
            }
            const categoryId = transaction.categoryId;
            spentByCategory.set(
              categoryId,
              (spentByCategory.get(categoryId) ?? 0) + transaction.amount,
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

          // Live totals, same as LiabilitiesReceivablesScreen — never
          // trusted from a stored column, always principal + interest
          // accrued as of today.
          const today = getCurrentDateString();
          const withTotalOwed = async (
            rows: typeof liabilities,
            type: 'Liability' | 'Receivable',
          ) =>
            Promise.all(
              rows.map(async row => ({
                ...row,
                type,
                totalOwed: await getLoanTotalOwed(row.accountId, today),
              })),
            );
          const [liabilitiesWithTotals, receivablesWithTotals] =
            await Promise.all([
              withTotalOwed(liabilities, 'Liability'),
              withTotalOwed(receivables, 'Receivable'),
            ]);
          const allLoansWithTotals = [
            ...liabilitiesWithTotals,
            ...receivablesWithTotals,
          ];

          const upcoming = allLoansWithTotals
            .filter((loan): loan is typeof loan & { dueDate: string } =>
              Boolean(loan.dueDate),
            )
            .map(loan => ({
              accountId: loan.accountId,
              counterpartyName: loan.counterpartyName,
              type: loan.type,
              currencyCode: loan.currencyCode,
              totalOwed: loan.totalOwed,
              dueDate: loan.dueDate,
              daysUntilDue: daysUntil(loan.dueDate, today),
            }))
            // Overdue (negative) through DUE_SOON_WINDOW_DAYS out.
            .filter(loan => loan.daysUntilDue <= DUE_SOON_WINDOW_DAYS)
            .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

          if (!cancelled) {
            setTotal(monthlyTotal);
            setTotalIncome(monthlyIncome);
            setBudget(monthlyBudget);
            setAmountLeft(left);
            setAverageLeftPerDay(avgLeftPerDay);
            setCashInHandByCurrency(cashByCurrency);
            setCreditCardDebt(cardDebt);
            setCategoryBreakdown(breakdown);
            setLiabilityTotals(totalsByCurrency(liabilitiesWithTotals));
            setReceivableTotals(totalsByCurrency(receivablesWithTotals));
            setUpcomingLoans(upcoming);
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
    percentUsed > 1
      ? { color: colors.danger }
      : percentUsed >= 0.9
        ? { color: colors.warning }
        : { color: colors.success };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Dashboard</Text>
      {loading ? (
        <ActivityIndicator size="large" />
      ) : (
        <>
          {/* One line per currency — amounts are never summed across currencies. */}
          <Text style={[styles.subtitle, { color: colors.text }]}>
            Total cash in hand
          </Text>
          {Object.keys(cashInHandByCurrency).length > 0 ? (
            Object.entries(cashInHandByCurrency)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([currencyCode, amount]) => (
                <Text
                  style={[styles.row, { color: colors.text }]}
                  key={currencyCode}>
                  {currencyCode} {amount.toFixed(2)}
                </Text>
              ))
          ) : (
            <Text style={[styles.row, { color: colors.text }]}>
              No cash accounts yet
            </Text>
          )}

          <Text style={[styles.row, { color: colors.danger }]}>
            Credit card debt: {creditCardDebt.toFixed(2)}
          </Text>
          <Text style={[styles.row, { color: colors.text }]}>
            Total spent this month: {total.toFixed(2)}
          </Text>
          <Text style={[styles.row, { color: colors.success }]}>
            Total income this month: {totalIncome.toFixed(2)}
          </Text>
          {budget && amountLeft !== null ? (
            <>
              <Text style={[styles.row, { color: colors.text }]}>
                Budget allocated: {budget.limitAmount.toFixed(2)}
              </Text>
              <Text style={[styles.row, amountLeftStyle]}>
                Amount left: {amountLeft.toFixed(2)}
              </Text>
              {averageLeftPerDay !== null && (
                <Text style={[styles.row, { color: colors.text }]}>
                  Average left per day: {averageLeftPerDay.toFixed(2)}
                </Text>
              )}
            </>
          ) : (
            <Text style={[styles.row, { color: colors.text }]}>
              No budget set for this month yet
            </Text>
          )}

          <Text style={[styles.subtitle, { color: colors.text }]}>
            Liabilities &amp; Receivables
          </Text>
          <Text style={[styles.row, { color: colors.danger }]}>
            Total owed: {formatCurrencyTotals(liabilityTotals)}
          </Text>
          <Text style={[styles.row, { color: colors.success }]}>
            Total owed to you: {formatCurrencyTotals(receivableTotals)}
          </Text>
          {upcomingLoans.length > 0 && (
            <View
              style={[
                styles.dueSoonBox,
                { backgroundColor: colors.surface, borderColor: colors.warning },
              ]}>
              <Text style={[styles.dueSoonTitle, { color: colors.warning }]}>
                Due soon / overdue
              </Text>
              {upcomingLoans.map(loan => (
                <Text
                  key={loan.accountId}
                  style={[styles.dueSoonRow, { color: colors.textSecondary }]}>
                  {loan.daysUntilDue < 0
                    ? `Overdue by ${Math.abs(loan.daysUntilDue)}d`
                    : loan.daysUntilDue === 0
                      ? 'Due today'
                      : `Due in ${loan.daysUntilDue}d`}
                  {' — '}
                  {loan.counterpartyName} ({loan.type}): {loan.currencyCode}{' '}
                  {loan.totalOwed.toFixed(2)}
                </Text>
              ))}
            </View>
          )}

          <Text style={[styles.subtitle, { color: colors.text }]}>
            By Category
          </Text>
          <FlatList
            data={categoryBreakdown}
            keyExtractor={item => String(item.categoryId)}
            renderItem={({ item }) => (
              <View
                style={[styles.categoryRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.categoryName, { color: colors.text }]}>
                  {item.categoryName}
                </Text>
                <Text style={[styles.row, { color: colors.text }]}>
                  Spent: {item.spent.toFixed(2)}
                </Text>
                {item.budgetAmount !== null && item.amountLeft !== null ? (
                  <>
                    <Text
                      style={[
                        styles.row,
                        amountLeftStyleFor(item.spent, item.budgetAmount, colors),
                      ]}>
                      Left: {item.amountLeft.toFixed(2)}
                    </Text>
                    {item.averageLeftPerDay !== null && (
                      <Text style={[styles.row, { color: colors.text }]}>
                        Average left per day:{' '}
                        {item.averageLeftPerDay.toFixed(2)}
                      </Text>
                    )}
                  </>
                ) : (
                  <Text style={[styles.row, { color: colors.text }]}>
                    No budget set for this category yet
                  </Text>
                )}
              </View>
            )}
            ListEmptyComponent={
              <Text style={[styles.row, { color: colors.text }]}>
                No category activity this month.
              </Text>
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
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  // Deliberately loud (solid fill, not just colored text) — this needs to
  // stand out from the rest of the Dashboard's plain rows, not blend in.
  dueSoonBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  },
  dueSoonTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  dueSoonRow: {
    fontSize: 13,
    marginTop: 2,
  },
});

export default DashboardScreen;
