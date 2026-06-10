import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import ScreenBackground from '../components/ScreenBackground';
import Card from '../components/Card';
import PendingReviewBanner from '../components/dashboard/PendingReviewBanner';
import BudgetSummaryCard from '../components/dashboard/BudgetSummaryCard';
import CategoryBreakdownList from '../components/dashboard/CategoryBreakdownList';
import AccountShortcuts from '../components/dashboard/AccountShortcuts';
import DueSoonSection from '../components/dashboard/DueSoonSection';
import CashDebtSummary from '../components/dashboard/CashDebtSummary';
import type { DashboardStackParamList, RootTabParamList } from '../navigation/types';
import { useDashboardData } from '../hooks/useDashboardData';
import { useDismissibleBanner } from '../hooks/useDismissibleBanner';
import { getCurrentDateString, getCurrentMonthString } from '../utils/date';
import { formatEyebrowDate } from '../utils/dateUtils';
import { budgetStatusFor } from '../utils/statusColor';
import { formatCurrencyTotals } from '../utils/currencyTotals';
import { useTheme } from '../contexts/ThemeContext';
import { typography, scaleFont } from '../theme/typography';

type Props = NativeStackScreenProps<DashboardStackParamList, 'DashboardHome'>;

function DashboardScreen({ navigation }: Props): React.JSX.Element {
  const { colors } = useTheme();
  // Cross-tab navigation (Settings, Add) needs the tab navigator's own
  // prop, not DashboardStack's — same pattern AddTransactionScreen's
  // "Liabilities & Receivables" shortcut already uses.
  const tabNavigation =
    useNavigation<BottomTabNavigationProp<RootTabParamList, 'Dashboard'>>();

  const data = useDashboardData();
  const banner = useDismissibleBanner();
  // Also session-only, same reasoning as the banner — hiding balances is
  // a glance-privacy toggle for right now, not a saved preference. Too
  // small on its own to be worth a matching hook.
  const [balancesHidden, setBalancesHidden] = useState(false);

  const percentUsed =
    data.budget && data.budget.limitAmount > 0
      ? Math.round((data.total / data.budget.limitAmount) * 100)
      : 0;
  const budgetStatusColor = budgetStatusFor(
    data.total,
    data.budget?.limitAmount ?? 0,
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
          <Text style={[typography.eyebrow, styles.eyebrow, { color: colors.primary }]}>
            {formatEyebrowDate(getCurrentDateString())}
          </Text>
          <Text style={[typography.screenTitle, { color: colors.text }]}>Ledger</Text>
        </View>

        {!data.loading && data.pendingOccurrenceCount > 0 && !banner.dismissed && (
          <PendingReviewBanner
            count={data.pendingOccurrenceCount}
            onPress={() => navigation.navigate('ReviewOccurrences')}
            onDismiss={banner.dismiss}
          />
        )}

        {data.loading ? (
          <ActivityIndicator size="large" style={styles.loadingSpinner} />
        ) : (
          <>
            <Text style={[typography.eyebrow, styles.sectionLabel, { color: colors.textSecondary }]}>
              This Month's Budget
            </Text>
            <BudgetSummaryCard
              month={month}
              total={data.total}
              budget={data.budget}
              amountLeft={data.amountLeft}
              averageLeftPerDay={data.averageLeftPerDay}
              percentUsed={percentUsed}
              statusColor={budgetStatusColor}
            />

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
                  tabNavigation.navigate('Settings', { screen: 'CategoryBudgets' })
                }>
                <Text style={[styles.linkText, { color: colors.primary }]}>See all →</Text>
              </Pressable>
            </View>
            <CategoryBreakdownList
              categoryBreakdown={data.categoryBreakdown}
              onPressRow={() =>
                tabNavigation.navigate('Settings', { screen: 'CategoryBudgets' })
              }
            />

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
                  onPress={() => tabNavigation.navigate('Settings', { screen: 'Accounts' })}>
                  <Text style={[styles.linkText, { color: colors.primary }]}>Manage →</Text>
                </Pressable>
              </View>
            </View>
            <AccountShortcuts
              shortcutAccounts={data.shortcutAccounts}
              balancesHidden={balancesHidden}
            />

            <DueSoonSection
              upcomingLoans={data.upcomingLoans}
              upcomingInstallments={data.upcomingInstallments}
              onPayInstallment={installmentId =>
                tabNavigation.navigate('Settings', {
                  screen: 'InstallmentPlans',
                  params: { payPlanId: installmentId },
                })
              }
            />

            <Text style={[typography.eyebrow, styles.sectionLabel, { color: colors.textSecondary }]}>
              Cash &amp; Debt
            </Text>
            <CashDebtSummary
              cashInHandByCurrency={data.cashInHandByCurrency}
              creditCardDebt={data.creditCardDebt}
              totalIncome={data.totalIncome}
            />

            <Text style={[typography.eyebrow, styles.sectionLabel, { color: colors.textSecondary }]}>
              Liabilities &amp; Receivables
            </Text>
            <Card colors={colors} style={styles.card}>
              <Text style={[styles.row, { color: colors.danger }]}>
                Total owed: {formatCurrencyTotals(data.liabilityTotals)}
              </Text>
              <Text style={[styles.row, { color: colors.success }]}>
                Total owed to you: {formatCurrencyTotals(data.receivableTotals)}
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
  row: {
    fontSize: scaleFont(15),
    marginBottom: 6,
  },
});

export default DashboardScreen;
