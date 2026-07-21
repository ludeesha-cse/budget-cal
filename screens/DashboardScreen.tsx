import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import ScreenBackground from '../components/ScreenBackground';
import PendingReviewBanner from '../components/dashboard/PendingReviewBanner';
import BudgetSummaryCard from '../components/dashboard/BudgetSummaryCard';
import CategoryBreakdownList from '../components/dashboard/CategoryBreakdownList';
import AccountShortcuts from '../components/dashboard/AccountShortcuts';
import DueSoonSection from '../components/dashboard/DueSoonSection';
import CashDebtSummary from '../components/dashboard/CashDebtSummary';
import LiabilitiesReceivablesSummary from '../components/dashboard/LiabilitiesReceivablesSummary';
import type { DashboardStackParamList, RootTabParamList } from '../navigation/types';
import { useDashboardData } from '../hooks/useDashboardData';
import { useDismissibleBanner } from '../hooks/useDismissibleBanner';
import { getCurrentDateString, getCurrentMonthString } from '../utils/date';
import { formatEyebrowDate } from '../utils/dateUtils';
import { budgetStatusFor } from '../utils/statusColor';
import { useTheme } from '../contexts/ThemeContext';
import { typography, scaleFont } from '../theme/typography';

type Props = NativeStackScreenProps<DashboardStackParamList, 'DashboardHome'>;

function DashboardScreen({ navigation }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const tabNavigation =
    useNavigation<BottomTabNavigationProp<RootTabParamList, 'Dashboard'>>();
  const data = useDashboardData();
  const banner = useDismissibleBanner();
  const [balancesHidden, setBalancesHidden] = useState(false);

  const month = getCurrentMonthString();
  const VISIBLE_BUDGET_CARDS = 2;
  const visibleBudgetCards = data.budgetCards.slice(0, VISIBLE_BUDGET_CARDS);
  const hiddenBudgetCardCount = Math.max(
    0,
    data.budgetCards.length - VISIBLE_BUDGET_CARDS,
  );

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
          <Text style={[typography.screenTitle, { color: colors.text }]}>Dashboard</Text>
        </View>

        {!data.loading && data.pendingScheduledCount > 0 && !banner.dismissed && (
          <PendingReviewBanner
            count={data.pendingScheduledCount}
            onPress={() => navigation.navigate('ReviewOccurrences')}
            onDismiss={banner.dismiss}
          />
        )}

        {data.loading ? (
          <ActivityIndicator size="large" style={styles.loadingSpinner} />
        ) : (
          <>
            <View style={styles.sectionHeaderRow}>
              <Text
                style={[
                  typography.eyebrow,
                  styles.sectionLabel,
                  styles.sectionLabelInline,
                  { color: colors.textSecondary },
                ]}>
                This Month's Budget
              </Text>
              {hiddenBudgetCardCount > 0 && (
                <Pressable
                  onPress={() =>
                    tabNavigation.navigate('Settings', { screen: 'BudgetSettings' })
                  }>
                  <Text style={[styles.linkText, { color: colors.primary }]}>
                    +{hiddenBudgetCardCount} more · Manage →
                  </Text>
                </Pressable>
              )}
            </View>
            {visibleBudgetCards.length === 0 ? (
              <BudgetSummaryCard
                month={month}
                currencyCode=""
                total={0}
                budget={null}
                amountLeft={null}
                averageLeftPerDay={null}
                percentUsed={0}
                statusColor={colors.textSecondary}
              />
            ) : (
              visibleBudgetCards.map(card => (
                <BudgetSummaryCard
                  key={card.currencyId}
                  month={month}
                  currencyCode={card.currencyCode}
                  total={card.total}
                  budget={card.budget}
                  amountLeft={card.amountLeft}
                  averageLeftPerDay={card.averageLeftPerDay}
                  percentUsed={
                    card.budget.limitAmount > 0
                      ? Math.round((card.total / card.budget.limitAmount) * 100)
                      : 0
                  }
                  statusColor={
                    budgetStatusFor(card.total, card.budget.limitAmount, colors).text
                  }
                />
              ))
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
              Debt &amp; Income
            </Text>
            <CashDebtSummary
              creditCardDebt={data.creditCardDebt}
              totalIncome={data.totalIncome}
            />

            <Text style={[typography.eyebrow, styles.sectionLabel, { color: colors.textSecondary }]}>
              Liabilities &amp; Receivables
            </Text>
            <LiabilitiesReceivablesSummary
              liabilityTotals={data.liabilityTotals}
              receivableTotals={data.receivableTotals}
            />
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
});

export default DashboardScreen;
