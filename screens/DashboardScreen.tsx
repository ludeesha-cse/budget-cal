import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { X } from 'lucide-react-native';
import ScreenBackground from '../components/ScreenBackground';
import Card from '../components/Card';
import ProgressBar from '../components/common/ProgressBar';
import type { DashboardStackParamList, RootTabParamList } from '../navigation/types';
import {
  generatePendingOccurrences,
  getAccountBalance,
  getAccountBalances,
  getAccounts,
  getActiveLoanAccounts,
  getBudgetForMonth,
  getCategories,
  getCategoryBudgetsForMonth,
  getInstallmentReminders,
  getLoanTotalOwed,
  getMonthlyIncome,
  getMonthlyTotal,
  getPendingOccurrences,
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
import { formatEyebrowDate, formatMonthTitle } from '../utils/dateUtils';
import { budgetStatusFor } from '../utils/statusColor';
import { formatAmount } from '../utils/formatAmount';
import { totalsByCurrency, formatCurrencyTotals } from '../utils/currencyTotals';
import { labelForId } from '../utils/pickerLabels';
import { useTheme } from '../contexts/ThemeContext';
import { typography, scaleFont } from '../theme/typography';

const DUE_SOON_WINDOW_DAYS = 7;
// Narrower than loans' own DUE_SOON_WINDOW_DAYS — installment reminders
// are meant to catch "this is about to come out of your account", not a
// week-out heads-up, per the explicit "within 3 or 4 days" ask.
const INSTALLMENT_REMINDER_WINDOW_DAYS = 4;
// Only the top few rows show on the dashboard itself — "See all"/"Manage"
// exist specifically so this card never has to grow to fit everything.
const CATEGORY_PREVIEW_COUNT = 3;
const SHORTCUT_ACCOUNT_COUNT = 2;

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

type CategoryBreakdownRow = {
  categoryId: number;
  categoryName: string;
  spent: number;
  budgetAmount: number | null;
  amountLeft: number | null;
  averageLeftPerDay: number | null;
};

type ShortcutAccountRow = {
  accountId: number;
  name: string;
  currencyCode: string;
  balance: number;
};

type UpcomingInstallmentRow = {
  id: number;
  name: string;
  currencyCode: string;
  nextInstallmentNumber: number;
  numberOfMonths: number;
  nextAmountDue: number;
  daysUntilDue: number; // negative once overdue, same convention as UpcomingLoanRow
};

type Props = NativeStackScreenProps<DashboardStackParamList, 'DashboardHome'>;

function DashboardScreen({ navigation }: Props): React.JSX.Element {
  const { colors } = useTheme();
  // Cross-tab navigation (Settings, Add) needs the tab navigator's own
  // prop, not DashboardStack's — same pattern AddTransactionScreen's
  // "Liabilities & Receivables" shortcut already uses.
  const tabNavigation =
    useNavigation<BottomTabNavigationProp<RootTabParamList, 'Dashboard'>>();

  const [pendingOccurrenceCount, setPendingOccurrenceCount] = useState(0);
  // Session-only — resets to false on every fresh app launch (a plain
  // useState has no persistence of its own), which is exactly what makes
  // "dismissible for the session, but reappears next launch while
  // anything is still pending" true without writing anything to disk.
  const [bannerDismissed, setBannerDismissed] = useState(false);
  // Also session-only, same reasoning — hiding balances is a
  // glance-privacy toggle for right now, not a saved preference.
  const [balancesHidden, setBalancesHidden] = useState(false);
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
  const [shortcutAccounts, setShortcutAccounts] = useState<ShortcutAccountRow[]>(
    [],
  );
  const [liabilityTotals, setLiabilityTotals] = useState<Record<string, number>>(
    {},
  );
  const [receivableTotals, setReceivableTotals] = useState<
    Record<string, number>
  >({});
  const [upcomingLoans, setUpcomingLoans] = useState<UpcomingLoanRow[]>([]);
  const [upcomingInstallments, setUpcomingInstallments] = useState<
    UpcomingInstallmentRow[]
  >([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      const month = getCurrentMonthString();
      // Regenerated on every focus, not just app startup — idempotent by
      // design (see its own doc comment), so re-running it here whenever
      // the user comes back to this tab is safe and simpler than trying
      // to track whether "today's" generation already happened.
      generatePendingOccurrences()
        .then(() =>
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
            getPendingOccurrences(),
            getAccounts(),
            getInstallmentReminders(),
          ]),
        )
        .then(
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
          pendingOccurrences,
          accounts,
          installmentReminders,
        ]) => {
          // Expense-only, same as getMonthlyTotal — an Income entry
          // filed under a category shouldn't reduce how "spent" it looks.
          // Every Expense still requires a category (only Income can be
          // null, as of the categoryId-nullable migration); the null
          // check here just satisfies that at the type level too.
          // Stage 16a: also skips excludeFromBudget transactions, same as
          // getMonthlyTotal/getCategorySpent — getTransactionsByMonth
          // itself still returns everything (History needs the full
          // record), so this is the one place Dashboard applies the
          // exclusion to its own hand-built category breakdown.
          const spentByCategory = new Map<number, number>();
          for (const transaction of monthTransactions) {
            if (
              transaction.entryType !== 'Expense' ||
              transaction.categoryId == null ||
              transaction.excludeFromBudget
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
              const categoryName = labelForId(
                categories,
                categoryId,
                'name',
                'Unknown category',
              );
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
          // Budgeted categories first (the dashboard preview only makes
          // sense for a "spent X of Y — Z%" reading), then by how much of
          // the budget is used, so the categories closest to (or over)
          // their limit surface first — the ones worth a glance.
          breakdown.sort((a, b) => {
            if (a.budgetAmount == null && b.budgetAmount == null) {
              return a.categoryName.localeCompare(b.categoryName);
            }
            if (a.budgetAmount == null) return 1;
            if (b.budgetAmount == null) return -1;
            const aPct = a.budgetAmount > 0 ? a.spent / a.budgetAmount : 0;
            const bPct = b.budgetAmount > 0 ? b.spent / b.budgetAmount : 0;
            return bPct - aPct;
          });

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

          // Same overdue-through-window shape as upcoming loans just
          // above, narrower window (see INSTALLMENT_REMINDER_WINDOW_DAYS'
          // own comment) — installmentReminders itself already excludes
          // fully-paid plans and plans with no due date set.
          const upcomingInstallmentsList = installmentReminders
            .map(reminder => ({
              ...reminder,
              daysUntilDue: daysUntil(reminder.nextDueDate, today),
            }))
            .filter(
              reminder =>
                reminder.daysUntilDue <= INSTALLMENT_REMINDER_WINDOW_DAYS,
            )
            .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

          // "Dashboard Shortcuts" — each active account's balance in
          // whichever currency it was first opened with. Multi-currency
          // accounts only ever show that one row here; the full picture
          // (every currency) is what "Manage" (Accounts) is for.
          const activeAccounts = accounts.filter(a => a.active);
          const shortcuts = (
            await Promise.all(
              activeAccounts.map(async account => {
                const balances = await getAccountBalances(account.id);
                const first = balances[0];
                if (!first) {
                  return null;
                }
                const liveBalance = await getAccountBalance(
                  account.id,
                  first.currencyId,
                );
                return {
                  accountId: account.id,
                  name: account.name,
                  currencyCode: first.currencyCode,
                  balance: liveBalance,
                };
              }),
            )
          ).filter((row): row is ShortcutAccountRow => row !== null);

          if (!cancelled) {
            setTotal(monthlyTotal);
            setTotalIncome(monthlyIncome);
            setBudget(monthlyBudget);
            setAmountLeft(left);
            setAverageLeftPerDay(avgLeftPerDay);
            setCashInHandByCurrency(cashByCurrency);
            setCreditCardDebt(cardDebt);
            setCategoryBreakdown(breakdown);
            setShortcutAccounts(shortcuts);
            setLiabilityTotals(
              totalsByCurrency(liabilitiesWithTotals, row => row.totalOwed),
            );
            setReceivableTotals(
              totalsByCurrency(receivablesWithTotals, row => row.totalOwed),
            );
            setUpcomingLoans(upcoming);
            setUpcomingInstallments(upcomingInstallmentsList);
            setPendingOccurrenceCount(pendingOccurrences.length);
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
    budget && budget.limitAmount > 0
      ? Math.round((total / budget.limitAmount) * 100)
      : 0;
  const budgetStatusColor = budgetStatusFor(
    total,
    budget?.limitAmount ?? 0,
    colors,
  ).text;

  const month = getCurrentMonthString();

  return (
    // DashboardHome's native-stack header is hidden (see App.tsx) so this
    // screen's own content is what sits directly under the status
    // bar/notch — edges=['top'] only (not 'bottom') because the bottom of
    // the screen already has its own paddingBottom for the floating tab
    // bar/FAB, and SafeAreaView would otherwise add a second, redundant
    // bottom inset on top of that. ScreenBackground (not a plain
    // SafeAreaView) so a gradient palette like Platinum paints its sweep
    // behind this content instead of a flat fill.
    <ScreenBackground colors={colors} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text
          style={[typography.eyebrow, styles.eyebrow, { color: colors.primary }]}>
          {formatEyebrowDate(getCurrentDateString())}
        </Text>
        <Text style={[typography.screenTitle, { color: colors.text }]}>
          Ledger
        </Text>
      </View>

      {/* Non-blocking by design (Stage 13b spec) — a plain row, never a
          modal, so it can't stop the user from seeing anything else on
          this screen. Only shown once loading finishes so it doesn't
          flash before pendingOccurrenceCount has its real value. */}
      {!loading && pendingOccurrenceCount > 0 && !bannerDismissed && (
        <Pressable
          style={[
            styles.banner,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
          onPress={() => navigation.navigate('ReviewOccurrences')}>
          <View style={[styles.bannerDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.bannerText, { color: colors.text }]}>
            <Text style={styles.bannerTextBold}>
              {pendingOccurrenceCount} recurring{' '}
              {pendingOccurrenceCount === 1 ? 'entry' : 'entries'}
            </Text>{' '}
            to review
          </Text>
          <Pressable hitSlop={10} onPress={() => setBannerDismissed(true)}>
            <X size={16} color={colors.textSecondary} />
          </Pressable>
        </Pressable>
      )}

      {loading ? (
        <ActivityIndicator size="large" style={styles.loadingSpinner} />
      ) : (
        <>
          <Text
            style={[
              typography.eyebrow,
              styles.sectionLabel,
              { color: colors.textSecondary },
            ]}>
            This Month's Budget
          </Text>
          {budget && amountLeft !== null ? (
            <Card colors={colors} style={styles.card}>
              <View style={styles.budgetHeaderRow}>
                <Text
                  style={[
                    typography.cardTitle,
                    styles.budgetCardTitle,
                    { color: colors.text },
                  ]}
                  numberOfLines={1}>
                  Overall — {formatMonthTitle(month)}
                </Text>
                <View
                  style={[
                    styles.percentPill,
                    { backgroundColor: colors.successSoft },
                  ]}>
                  <Text
                    style={[
                      styles.percentPillText,
                      typography.amountMono,
                      { color: colors.success },
                    ]}>
                    {percentUsed}% used
                  </Text>
                </View>
              </View>
              <View style={styles.budgetAmountRow}>
                <Text
                  style={[
                    typography.amountLarge,
                    styles.budgetAmountFigure,
                    { color: colors.text },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}>
                  Rs. {formatAmount(total, '', { decimals: 0, hideCode: true })}
                </Text>
                <Text
                  style={[
                    typography.amountMono,
                    styles.budgetAmountOf,
                    { color: colors.textSecondary },
                  ]}>
                  {' '}
                  of{' '}
                  {formatAmount(budget.limitAmount, '', {
                    decimals: 0,
                    hideCode: true,
                  })}
                </Text>
              </View>
              <ProgressBar
                percent={percentUsed}
                color={budgetStatusColor}
                height={8}
                style={styles.progressTrack}
              />
              <View style={styles.budgetFooterRow}>
                <Text
                  style={[
                    typography.amountMono,
                    { color: colors.textSecondary },
                  ]}>
                  Rs.{' '}
                  {formatAmount(Math.max(0, amountLeft), '', {
                    decimals: 0,
                    hideCode: true,
                  })}{' '}
                  left
                </Text>
                {averageLeftPerDay !== null && (
                  <Text
                    style={[
                      typography.amountMono,
                      { color: colors.textSecondary },
                    ]}>
                    Rs.{' '}
                    {formatAmount(Math.round(averageLeftPerDay), '', {
                      decimals: 0,
                      hideCode: true,
                    })}{' '}
                    / day remaining
                  </Text>
                )}
              </View>
            </Card>
          ) : (
            <Card colors={colors} style={styles.card}>
              <Text style={{ color: colors.textSecondary }}>
                No budget set for this month yet.
              </Text>
            </Card>
          )}

          <View style={styles.sectionHeaderRow}>
            <Text
              style={[
                typography.eyebrow,
                styles.sectionLabel,
                styles.sectionLabelInline,
                { color: colors.textSecondary },
              ]}>
              By Category
            </Text>
            <Pressable
              onPress={() =>
                tabNavigation.navigate('Settings', {
                  screen: 'CategoryBudgets',
                })
              }>
              <Text style={[styles.linkText, { color: colors.primary }]}>
                See all →
              </Text>
            </Pressable>
          </View>
          <Card colors={colors} style={[styles.card, styles.listCard]}>
            {categoryBreakdown.filter(c => c.budgetAmount != null).length ===
            0 ? (
              <Text style={{ color: colors.textSecondary }}>
                No category budgets set yet.
              </Text>
            ) : (
              categoryBreakdown
                .filter(c => c.budgetAmount != null)
                .slice(0, CATEGORY_PREVIEW_COUNT)
                .map((item, index, arr) => {
                  const budgetAmount = item.budgetAmount ?? 0;
                  const pct =
                    budgetAmount > 0
                      ? Math.round((item.spent / budgetAmount) * 100)
                      : 0;
                  const status = budgetStatusFor(item.spent, budgetAmount, colors);
                  return (
                    <Pressable
                      key={item.categoryId}
                      style={[
                        styles.listRow,
                        index < arr.length - 1 && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: colors.border,
                        },
                      ]}
                      onPress={() =>
                        tabNavigation.navigate('Settings', {
                          screen: 'CategoryBudgets',
                        })
                      }>
                      <View
                        style={[
                          styles.avatar,
                          { backgroundColor: status.soft },
                        ]}>
                        <Text style={[styles.avatarText, { color: status.text }]}>
                          {item.categoryName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.listRowText}>
                        <Text style={[styles.listRowTitle, { color: colors.text }]}>
                          {item.categoryName}
                        </Text>
                        <Text
                          style={[
                            typography.amountMono,
                            styles.listRowSubtitle,
                            { color: colors.textSecondary },
                          ]}>
                          Rs.{' '}
                          {formatAmount(item.spent, '', {
                            decimals: 0,
                            hideCode: true,
                          })}{' '}
                          of{' '}
                          {formatAmount(budgetAmount, '', {
                            decimals: 0,
                            hideCode: true,
                          })}
                        </Text>
                      </View>
                      <Text
                        style={[
                          typography.amountMono,
                          styles.listRowPercent,
                          { color: status.text },
                        ]}>
                        {pct}%
                      </Text>
                    </Pressable>
                  );
                })
            )}
          </Card>

          <View style={styles.sectionHeaderRow}>
            <Text
              style={[
                typography.eyebrow,
                styles.sectionLabel,
                styles.sectionLabelInline,
                { color: colors.textSecondary },
              ]}>
              Dashboard Shortcuts
            </Text>
            <View style={styles.shortcutHeaderActions}>
              <Pressable
                hitSlop={8}
                style={styles.eyeToggle}
                onPress={() => setBalancesHidden(current => !current)}>
                <Text style={[styles.linkText, { color: colors.textSecondary }]}>
                  {balancesHidden ? 'Show' : 'Hide'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  tabNavigation.navigate('Settings', { screen: 'Accounts' })
                }>
                <Text style={[styles.linkText, { color: colors.primary }]}>
                  Manage →
                </Text>
              </Pressable>
            </View>
          </View>
          {shortcutAccounts.length === 0 ? (
            <Card colors={colors} style={styles.card}>
              <Text style={{ color: colors.textSecondary }}>
                No accounts yet.
              </Text>
            </Card>
          ) : (
            shortcutAccounts.slice(0, SHORTCUT_ACCOUNT_COUNT).map(account => (
              <Card
                key={account.accountId}
                colors={colors}
                style={[styles.card, styles.shortcutRow]}>
                <View style={[styles.avatar, { backgroundColor: colors.primarySoft }]}>
                  <Text style={[styles.avatarText, { color: colors.primary }]}>
                    {account.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.listRowText}>
                  <Text style={[styles.listRowTitle, { color: colors.text }]}>
                    {account.name}
                  </Text>
                  <Text
                    style={[
                      typography.eyebrow,
                      styles.shortcutCurrency,
                      { color: colors.textSecondary },
                    ]}>
                    {account.currencyCode}
                  </Text>
                </View>
                <Text
                  style={[
                    typography.amountMono,
                    styles.listRowPercent,
                    { color: colors.text },
                  ]}>
                  {balancesHidden
                    ? '••••••'
                    : `Rs. ${formatAmount(account.balance, account.currencyCode, {
                        decimals: 0,
                        hideCode: true,
                      })}`}
                </Text>
              </Card>
            ))
          )}

          {upcomingLoans.length > 0 && (
            <>
              <Text
                style={[
                  typography.eyebrow,
                  styles.sectionLabel,
                  { color: colors.textSecondary },
                ]}>
                Due Soon / Overdue
              </Text>
              <Card colors={colors} style={styles.card} borderColor={colors.warning}>
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
                    {loan.counterpartyName} ({loan.type}): {formatAmount(loan.totalOwed, loan.currencyCode)}
                  </Text>
                ))}
              </Card>
            </>
          )}

          {upcomingInstallments.length > 0 && (
            <>
              <Text
                style={[
                  typography.eyebrow,
                  styles.sectionLabel,
                  { color: colors.textSecondary },
                ]}>
                Installment Reminders
              </Text>
              {upcomingInstallments.map(reminder => (
                <Card
                  key={reminder.id}
                  colors={colors}
                  style={[styles.card, styles.reminderRow]}
                  borderColor={colors.warning}>
                  <View style={styles.reminderText}>
                    <Text
                      style={[styles.listRowTitle, { color: colors.text }]}
                      numberOfLines={1}>
                      {reminder.name}
                    </Text>
                    <Text
                      style={[
                        typography.amountMono,
                        styles.listRowSubtitle,
                        { color: colors.textSecondary },
                      ]}>
                      {reminder.daysUntilDue < 0
                        ? `Overdue by ${Math.abs(reminder.daysUntilDue)}d`
                        : reminder.daysUntilDue === 0
                          ? 'Due today'
                          : `Due in ${reminder.daysUntilDue}d`}
                      {' — '}
                      {formatAmount(reminder.nextAmountDue, reminder.currencyCode)} · #
                      {reminder.nextInstallmentNumber} of{' '}
                      {reminder.numberOfMonths}
                    </Text>
                  </View>
                  <Pressable
                    style={[
                      styles.payButton,
                      { backgroundColor: colors.primary },
                    ]}
                    onPress={() =>
                      tabNavigation.navigate('Settings', {
                        screen: 'InstallmentPlans',
                        params: { payPlanId: reminder.id },
                      })
                    }>
                    <Text
                      style={[
                        styles.payButtonText,
                        { color: colors.primaryText },
                      ]}>
                      Pay
                    </Text>
                  </Pressable>
                </Card>
              ))}
            </>
          )}

          <Text
            style={[
              typography.eyebrow,
              styles.sectionLabel,
              { color: colors.textSecondary },
            ]}>
            Cash &amp; Debt
          </Text>
          <Card colors={colors} style={styles.card}>
            <Text style={[styles.row, { color: colors.text }]}>
              Total cash in hand:{' '}
              {Object.keys(cashInHandByCurrency).length > 0
                ? Object.entries(cashInHandByCurrency)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([code, amount]) => formatAmount(amount, code))
                    .join(' · ')
                : 'None'}
            </Text>
            <Text style={[styles.row, { color: colors.danger }]}>
              Credit card debt:{' '}
              {formatAmount(creditCardDebt, '', { hideCode: true })}
            </Text>
            <Text style={[styles.row, { color: colors.success }]}>
              Total income this month:{' '}
              {formatAmount(totalIncome, '', { hideCode: true })}
            </Text>
          </Card>

          <Text
            style={[
              typography.eyebrow,
              styles.sectionLabel,
              { color: colors.textSecondary },
            ]}>
            Liabilities &amp; Receivables
          </Text>
          <Card colors={colors} style={styles.card}>
            <Text style={[styles.row, { color: colors.danger }]}>
              Total owed: {formatCurrencyTotals(liabilityTotals)}
            </Text>
            <Text style={[styles.row, { color: colors.success }]}>
              Total owed to you: {formatCurrencyTotals(receivableTotals)}
            </Text>
          </Card>

          {/* Net Worth deliberately does NOT live here — a single "here's
              everything you own minus everything you owe" figure is
              exactly the kind of thing that shouldn't be one glance away
              on the screen the app opens to. It's its own screen now,
              reached from Accounts ("View Net Worth →" at the bottom of
              that list) rather than a Dashboard card or a flat entry in
              the More list — see screens/NetWorthScreen.tsx. */}
        </>
      )}
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  container: {
    padding: 16,
    // Well past the floating tab bar's own footprint (pill height 64 +
    // its marginBottom of insets.bottom+16, see App.tsx) plus the FAB
    // poking up over it — otherwise the last card or two ends up
    // scrollable-but-hidden behind the pill instead of clearing it.
    paddingBottom: 120,
  },
  header: {
    marginBottom: 16,
  },
  eyebrow: {
    marginBottom: 4,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    gap: 10,
  },
  bannerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  bannerText: {
    flex: 1,
    fontSize: scaleFont(14),
  },
  bannerTextBold: {
    fontWeight: '700',
  },
  loadingSpinner: {
    marginTop: 40,
  },
  sectionLabel: {
    marginTop: 20,
    marginBottom: 10,
  },
  sectionLabelInline: {
    marginTop: 0,
    marginBottom: 0,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  shortcutHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  eyeToggle: {},
  linkText: {
    fontSize: scaleFont(13),
    fontWeight: '700',
  },
  // border/borderRadius/backgroundColor are NOT here — Card (see
  // components/Card.tsx) owns those itself so it can swap in a gradient
  // fill for palettes that define one. This only carries layout.
  card: {
    padding: 16,
    marginBottom: 10,
  },
  listCard: {
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  budgetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    // A long month name ("Overall — September") plus the widest percent
    // reading ("102% used") can add up to more than the card's width,
    // especially on a narrow phone or with the device's own text-size
    // setting turned up — wrapping to a second line (rather than letting
    // the row overflow the card's edge) is what actually fixes that,
    // the title's own flexShrink/numberOfLines below is just a second
    // line of defense.
    flexWrap: 'wrap',
    rowGap: 6,
  },
  budgetCardTitle: {
    flexShrink: 1,
    marginRight: 8,
  },
  percentPill: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexShrink: 0,
  },
  percentPillText: {
    fontSize: scaleFont(12),
    fontWeight: '700',
  },
  budgetAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 10,
    flexWrap: 'wrap',
  },
  budgetAmountFigure: {
    flexShrink: 1,
  },
  budgetAmountOf: {
    fontSize: scaleFont(15),
  },
  progressTrack: {
    marginTop: 14,
  },
  budgetFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  listRowText: {
    flex: 1,
  },
  listRowTitle: {
    fontSize: scaleFont(15),
    fontWeight: '600',
  },
  listRowSubtitle: {
    fontSize: scaleFont(12),
    marginTop: 2,
  },
  listRowPercent: {
    fontSize: scaleFont(14),
    fontWeight: '700',
  },
  shortcutRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shortcutCurrency: {
    marginTop: 2,
  },
  row: {
    fontSize: scaleFont(15),
    marginBottom: 6,
  },
  dueSoonRow: {
    fontSize: scaleFont(13),
    marginTop: 2,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reminderText: {
    flex: 1,
    marginRight: 12,
  },
  payButton: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  payButtonText: {
    fontSize: scaleFont(13),
    fontWeight: '700',
  },
});

export default DashboardScreen;
