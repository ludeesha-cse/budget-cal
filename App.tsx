/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
  NavigationContainer,
} from '@react-navigation/native';
import type { Theme as NavigationTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  ChartColumn,
  House,
  MoreHorizontal,
  Plus,
  TrendingUp,
  X,
} from 'lucide-react-native';
import { runMigrations } from './db';
import { createQueryClient } from './db/queryClient';
import { reportError, toUserMessage } from './utils/appErrors';
import { ensureDefaultAccount, getAppMeta } from './db/queries';
import DashboardScreen from './screens/DashboardScreen';
import HistoryListScreen from './screens/HistoryListScreen';
import EditTransactionScreen from './screens/EditTransactionScreen';
import ExpensesByTypeScreen from './screens/ExpensesByTypeScreen';
import ReportsScreen from './screens/ReportsScreen';
import AddTransactionScreen from './screens/AddTransactionScreen';
import SettingsHomeScreen from './screens/SettingsHomeScreen';
import AppSettingsScreen from './screens/AppSettingsScreen';
import BudgetSettingsScreen from './screens/BudgetSettingsScreen';
import AccountsScreen from './screens/AccountsScreen';
import NetWorthScreen from './screens/NetWorthScreen';
import LiabilitiesReceivablesScreen from './screens/LiabilitiesReceivablesScreen';
import CategoriesScreen from './screens/CategoriesScreen';
import CategoryBudgetsScreen from './screens/CategoryBudgetsScreen';
import CurrenciesScreen from './screens/CurrenciesScreen';
import ExchangeRatesScreen from './screens/ExchangeRatesScreen';
import InstallmentPlansScreen from './screens/InstallmentPlansScreen';
import InstallmentPlanDetailsScreen from './screens/InstallmentPlanDetailsScreen';
import RecurringRulesScreen from './screens/RecurringRulesScreen';
import SavingsGoalsScreen from './screens/SavingsGoalsScreen';
import SavingsGoalDetailsScreen from './screens/SavingsGoalDetailsScreen';
import TagsScreen from './screens/TagsScreen';
import ReviewOccurrencesScreen from './screens/ReviewOccurrencesScreen';
import AccountScreen from './screens/AccountScreen';
import HelpSupportScreen from './screens/HelpSupportScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import DefaultCurrencyScreen from './screens/DefaultCurrencyScreen';
import PaywallModal from './screens/PaywallModal';
import AddEntrySheet, { AddEntryKind } from './components/AddEntrySheet';
import { EntitlementProvider } from './hooks/useEntitlement';
import { useContentWidth } from './hooks/useContentWidth';
import { PaywallProvider } from './contexts/PaywallContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { generatePendingOccurrences } from './db/queries';
import {
  FAB_OVERLAP_INTO_BAR,
  FAB_SIZE,
  TAB_BAR_BOTTOM_GAP,
  TAB_BAR_HEIGHT,
  tabBarSideMargin,
} from './theme/layout';
import type {
  DashboardStackParamList,
  HistoryStackParamList,
  RootTabParamList,
  SettingsStackParamList,
} from './navigation/types';

const Tab = createBottomTabNavigator<RootTabParamList>();
const DashboardStack = createNativeStackNavigator<DashboardStackParamList>();
const HistoryStack = createNativeStackNavigator<HistoryStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

function DashboardStackNavigator(): React.JSX.Element {
  return (
    <DashboardStack.Navigator>
      <DashboardStack.Screen
        name="DashboardHome"
        component={DashboardScreen}
        options={{ headerShown: false }}
      />
      <DashboardStack.Screen
        name="ReviewOccurrences"
        component={ReviewOccurrencesScreen}
        // Not "Review Recurring" any more — this screen lists recurring
        // occurrences AND installment occurrences in one queue.
        options={{ title: 'Review Scheduled' }}
      />
    </DashboardStack.Navigator>
  );
}

function HistoryStackNavigator(): React.JSX.Element {
  return (
    <HistoryStack.Navigator>
      <HistoryStack.Screen
        name="HistoryList"
        component={HistoryListScreen}
        options={{ headerShown: false }}
      />
      <HistoryStack.Screen
        name="EditTransaction"
        component={EditTransactionScreen}
        options={{ title: 'Edit Transaction' }}
      />
    </HistoryStack.Navigator>
  );
}

function SettingsStackNavigator(): React.JSX.Element {
  return (
    <SettingsStack.Navigator>
      <SettingsStack.Screen
        name="SettingsHome"
        component={SettingsHomeScreen}
        options={{ title: 'More' }}
      />
      <SettingsStack.Screen
        name="BudgetSettings"
        component={BudgetSettingsScreen}
        options={{ title: 'Budget' }}
      />
      <SettingsStack.Screen
        name="Accounts"
        component={AccountsScreen}
        options={{ title: 'Accounts' }}
      />
      {/* Not reachable from SettingsHome's own list — only from a link at
          the bottom of Accounts (see AccountsScreen.tsx) — see
          NetWorthScreen's header comment for why. */}
      <SettingsStack.Screen
        name="NetWorth"
        component={NetWorthScreen}
        options={{ title: 'Net Worth' }}
      />
      <SettingsStack.Screen
        name="LiabilitiesReceivables"
        component={LiabilitiesReceivablesScreen}
        options={{ title: 'Liabilities & Receivables' }}
      />
      <SettingsStack.Screen
        name="ExpensesByType"
        component={ExpensesByTypeScreen}
        options={{ title: 'Expenses by Type' }}
      />
      <SettingsStack.Screen
        name="Categories"
        component={CategoriesScreen}
        options={{ title: 'Categories' }}
      />
      <SettingsStack.Screen
        name="CategoryBudgets"
        component={CategoryBudgetsScreen}
        options={{ title: 'Category Budgets' }}
      />
      <SettingsStack.Screen
        name="Currencies"
        component={CurrenciesScreen}
        options={{ title: 'Currencies' }}
      />
      <SettingsStack.Screen
        name="ExchangeRates"
        component={ExchangeRatesScreen}
        options={{ title: 'Exchange Rates' }}
      />
      <SettingsStack.Screen
        name="AppSettings"
        component={AppSettingsScreen}
        options={{ title: 'App Settings' }}
      />
      <SettingsStack.Screen
        name="InstallmentPlans"
        component={InstallmentPlansScreen}
        options={{ title: 'Installment Plans' }}
      />
      <SettingsStack.Screen
        name="InstallmentPlanDetails"
        component={InstallmentPlanDetailsScreen}
        options={{ title: 'Plan Details' }}
      />
      <SettingsStack.Screen
        name="RecurringRules"
        component={RecurringRulesScreen}
        options={{ title: 'Recurring' }}
      />
      <SettingsStack.Screen
        name="SavingsGoals"
        component={SavingsGoalsScreen}
        options={{ title: 'Savings Goals' }}
      />
      <SettingsStack.Screen
        name="SavingsGoalDetails"
        component={SavingsGoalDetailsScreen}
        options={{ title: 'Goal Details' }}
      />
      <SettingsStack.Screen
        name="Tags"
        component={TagsScreen}
        options={{ title: 'Tags' }}
      />
      <SettingsStack.Screen
        name="Account"
        component={AccountScreen}
        options={{ title: 'Account' }}
      />
      <SettingsStack.Screen
        name="HelpSupport"
        component={HelpSupportScreen}
        options={{ title: 'Help & Support' }}
      />
    </SettingsStack.Navigator>
  );
}

type TabIconProps = { color: string; size: number };
function makeTabIcon(
  Icon: React.ComponentType<{ color: string; size: number }>,
): (props: TabIconProps) => React.JSX.Element {
  return function TabIcon({ color, size }: TabIconProps) {
    return <Icon color={color} size={size} />;
  };
}
const DashboardTabIcon = makeTabIcon(House);
const HistoryTabIcon = makeTabIcon(TrendingUp);
const ReportsTabIcon = makeTabIcon(ChartColumn);
const SettingsTabIcon = makeTabIcon(MoreHorizontal);

// Replaces the library's default label so it can't outgrow the pill. The
// pill is a fixed TAB_BAR_HEIGHT, so an uncapped label at a large system
// font size (common on Android phones that ship with a bigger default)
// pushes itself out through the bottom of the bar. Capped at 1.3x, and
// shrinks to fit rather than truncating where four tabs plus the FAB
// share a narrow (320-360dp) screen.
function TabLabel({
  color,
  position,
  children,
}: {
  color: string;
  position: 'beside-icon' | 'below-icon';
  children: string;
}): React.JSX.Element {
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.8}
      maxFontSizeMultiplier={1.3}
      style={[
        styles.tabBarLabel,
        position === 'beside-icon' && styles.tabBarLabelBeside,
        { color },
      ]}>
      {children}
    </Text>
  );
}

function AppShell(): React.JSX.Element {
  const { scheme } = useTheme();

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'}
      />
      <RootFlow />
    </SafeAreaProvider>
  );
}

type FirstLaunchPhase = 'loading' | 'onboarding' | 'currency' | 'app';

function RootFlow(): React.JSX.Element {
  const [phase, setPhase] = useState<FirstLaunchPhase>('loading');

  useEffect(() => {
    let cancelled = false;
    getAppMeta()
      .then(meta => {
        if (cancelled) {
          return;
        }
        const next: FirstLaunchPhase = !meta?.onboardingCompleted
          ? 'onboarding'
          : !meta.defaultCurrencyConfirmed
          ? 'currency'
          : 'app';
        console.log(
          `[first launch] app_meta onboardingCompleted=${meta?.onboardingCompleted} ` +
            `defaultCurrencyConfirmed=${meta?.defaultCurrencyConfirmed} -> phase=${next}`,
        );
        setPhase(next);
      })
      .catch(error => {
        console.error(
          'RootFlow: could not read app_meta, showing the app',
          error,
        );
        if (!cancelled) {
          setPhase('app');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (phase === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (phase === 'onboarding') {
    return <OnboardingScreen onDone={() => setPhase('currency')} />;
  }

  if (phase === 'currency') {
    return <DefaultCurrencyScreen onDone={() => setPhase('app')} />;
  }

  return (
    <>
      <AppNavigator />
      <PaywallModal />
    </>
  );
}

// The floating tab bar and FAB are two separately-drawn elements that
// have to line up as one visual unit, so their positions are derived from
// the shared constants in theme/layout.ts rather than each carrying its
// own independently-tuned "bottom" number — the two can't drift apart.
function AppNavigator(): React.JSX.Element {
  const { scheme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const tabBarBottomOffset = insets.bottom + TAB_BAR_BOTTOM_GAP;
  const fabBottom = tabBarBottomOffset + TAB_BAR_HEIGHT - FAB_OVERLAP_INTO_BAR;
  const tabBarMarginHorizontal = tabBarSideMargin(windowWidth, insets);
  // Every screen's column: full width on a phone in portrait, capped and
  // centered on tablets / in landscape, and always clear of a landscape
  // notch or cut-out on either side (see hooks/useContentWidth.ts).
  const { marginLeft, marginRight } = useContentWidth();
  const sceneStyle = { marginLeft, marginRight };
  const [sheetOpen, setSheetOpen] = useState(false);
  const [navigationRef, setNavigationRef] = useState<
    | import('@react-navigation/native').NavigationContainerRef<RootTabParamList>
    | null
  >(null);

  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () =>
      setKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener(hideEvent, () =>
      setKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const navigationTheme: NavigationTheme = useMemo(() => {
    const base =
      scheme === 'dark' ? NavigationDarkTheme : NavigationDefaultTheme;
    return {
      ...base,
      dark: scheme === 'dark',
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: colors.primary,
      },
    };
  }, [scheme, colors]);

  const handleSelectEntry = (kind: AddEntryKind) => {
    if (!navigationRef) {
      return;
    }
    switch (kind) {
      case 'Expense':
        navigationRef.navigate('Add', { initialTab: 'Expense' });
        return;
      case 'Income':
        navigationRef.navigate('Add', { initialTab: 'Income' });
        return;
      case 'LiabilityRepayment':
        // Not openAdd — "Liability Repayment"/"Receivable Income" mean
        // paying down or collecting on a loan that already exists, not
        // creating a new one. Landing on the list (with the right tab
        // preset) is enough; every existing loan card already has its own
        // Settle button.
        navigationRef.navigate('Settings', {
          screen: 'LiabilitiesReceivables',
          params: { type: 'Liability' },
        });
        return;
      case 'ReceivableIncome':
        navigationRef.navigate('Settings', {
          screen: 'LiabilitiesReceivables',
          params: { type: 'Receivable' },
        });
        return;
      case 'Withdraw':
        navigationRef.navigate('Settings', {
          screen: 'Accounts',
          params: { withdrawMode: true },
        });
        return;
      case 'Transfer':
        navigationRef.navigate('Settings', {
          screen: 'Accounts',
          params: { openTransfer: true },
        });
        return;
    }
  };

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <NavigationContainer theme={navigationTheme} ref={setNavigationRef}>
        <Tab.Navigator
          screenOptions={{
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.chevron,
            tabBarHideOnKeyboard: true,
            tabBarLabel: TabLabel,
            tabBarItemStyle: styles.tabItem,
            sceneStyle,
            tabBarStyle: {
              backgroundColor: colors.card,
              borderTopWidth: 0,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
              borderRadius: 28,
              height: TAB_BAR_HEIGHT,
              // The library pads the bar's INSIDE by the safe-area insets
              // by default. With a fixed height that padding comes out of
              // the icon/label area — on edge-to-edge Android with
              // 3-button navigation (insets.bottom ~48dp) it left ~16dp
              // and clipped every label. The insets are carried OUTSIDE
              // the pill instead, by the margins below.
              paddingTop: 0,
              paddingBottom: 0,
              paddingHorizontal: 0,
              marginHorizontal: tabBarMarginHorizontal,
              marginBottom: tabBarBottomOffset,
              shadowColor: '#000',
              shadowOpacity: 0.15,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
              elevation: 8,
            },
          }}
        >
          <Tab.Screen
            name="Dashboard"
            component={DashboardStackNavigator}
            options={{ headerShown: false, tabBarIcon: DashboardTabIcon }}
          />
          <Tab.Screen
            name="History"
            component={HistoryStackNavigator}
            options={{
              headerShown: false,
              tabBarIcon: HistoryTabIcon,
              // The FAB floats centered over the whole bar, i.e. right at
              // the boundary between these two middle tabs — nudge their
              // content away from that boundary (History left, Reports
              // right) so neither sits directly under it.
              tabBarItemStyle: [styles.tabItem, styles.middleTabLeft],
            }}
          />
          <Tab.Screen
            name="Reports"
            component={ReportsScreen}
            options={{
              headerShown: false,
              tabBarIcon: ReportsTabIcon,
              tabBarItemStyle: [styles.tabItem, styles.middleTabRight],
            }}
          />
          <Tab.Screen
            name="Add"
            component={AddTransactionScreen}
            options={{
              tabBarButton: () => null,
              tabBarItemStyle: styles.hiddenTabItem,
              headerShown: false,
            }}
          />
          <Tab.Screen
            name="Settings"
            component={SettingsStackNavigator}
            options={{
              headerShown: false,
              // `title` rather than a string tabBarLabel: the label is a
              // render function (TabLabel), which reads its text from here.
              title: 'More',
              tabBarIcon: SettingsTabIcon,
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>

      {/* Floating action button*/}
      {!keyboardVisible && (
        <Pressable
          style={[
            styles.fab,
            {
              backgroundColor: colors.primary,
              bottom: fabBottom,
            },
          ]}
          onPress={() => setSheetOpen(open => !open)}
        >
          {sheetOpen ? (
            <X size={26} color={colors.primaryText} strokeWidth={2.5} />
          ) : (
            <Plus size={26} color={colors.primaryText} strokeWidth={2.5} />
          )}
        </Pressable>
      )}

      <AddEntrySheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSelect={handleSelectEntry}
      />
    </View>
  );
}

function StartupErrorScreen({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): React.JSX.Element {
  const dark = useColorScheme() === 'dark';
  return (
    <View
      style={[
        styles.center,
        styles.startupError,
        dark ? styles.startupErrorDark : styles.startupErrorLight,
      ]}>
      <Text
        style={[
          styles.startupErrorText,
          dark ? styles.startupErrorTextDark : styles.startupErrorTextLight,
        ]}>
        {message}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={styles.startupRetryButton}>
        <Text style={styles.startupRetryText}>Try again</Text>
      </Pressable>
    </View>
  );
}

function App(): React.JSX.Element {
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState<Error | null>(null);
  // Created exactly once for the app's lifetime — passing the factory
  // (not createQueryClient()) means React only calls it on the first
  // render, so a re-render can never swap in a fresh, empty cache and
  // silently drop everything that was already loaded.
  const [queryClient] = useState(createQueryClient);

  const [startupAttempt, setStartupAttempt] = useState(0);

  useEffect(() => {
    setStartupError(null);
    runMigrations()
      .then(() => ensureDefaultAccount())
      .then(() => generatePendingOccurrences())
      .then(() => setReady(true))
      .catch(error => {
        // Logged in full; the screen gets a sentence (see
        // utils/appErrors.ts), never the raw SQLite text.
        reportError(error, { operation: 'App startup' });
        setStartupError(error instanceof Error ? error : new Error(String(error)));
      });
  }, [startupAttempt]);

  if (startupError) {
    // Rendered outside ThemeProvider (the database it reads from is what
    // failed), so this uses the system scheme directly.
    return (
      <StartupErrorScreen
        message={toUserMessage(startupError, {
          fallback:
            "The app couldn't open your data. Nothing has been lost — please try again. If this keeps happening, restart your phone.",
        })}
        onRetry={() => setStartupAttempt(attempt => attempt + 1)}
      />
    );
  }

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Setting up database...</Text>
      </View>
    );
  }

  // QueryClientProvider goes outside the existing provider stack rather
  // than replacing any part of it: the navigation root, and every
  // provider above it, keep working exactly as before — they can now
  // just also read from the cache.
  return (
    <QueryClientProvider client={queryClient}>
      {/* Order matters and is not cosmetic. AuthProvider is outermost
          because SubscriptionProvider reads the signed-in uid;
          SubscriptionProvider comes next because EntitlementProvider now
          derives free/premium from it instead of from a constant; and
          PaywallProvider sits inside all three so the paywall it opens
          can both read the entitlement and start a purchase. Moving any
          of these up or down throws "must be used within a ..." at
          launch. */}
      <AuthProvider>
        <SubscriptionProvider>
          <EntitlementProvider>
            <PaywallProvider>
              <ThemeProvider>
                <AppShell />
              </ThemeProvider>
            </PaywallProvider>
          </EntitlementProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  startupError: {
    paddingHorizontal: 28,
  },
  // Plain light/dark pair rather than theme tokens: this screen is shown
  // when the database (which stores the chosen theme) failed to open, so
  // ThemeProvider is not mounted yet.
  startupErrorLight: {
    backgroundColor: '#FFFFFF',
  },
  startupErrorDark: {
    backgroundColor: '#0F1115',
  },
  startupErrorTextLight: {
    color: '#1A1D23',
  },
  startupErrorTextDark: {
    color: '#F2F4F7',
  },
  startupErrorText: {
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
  },
  startupRetryButton: {
    marginTop: 18,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 26,
    backgroundColor: '#2F6FED',
  },
  startupRetryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  fill: {
    flex: 1,
  },
  tabBarLabel: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  tabBarLabelBeside: {
    marginStart: 12,
  },
  // Centers icon + label vertically in the fixed-height pill (the
  // library's default is top-aligned, which only looked centered while
  // its inset padding was squeezing the item from below). Repeated in
  // the middle tabs' own tabBarItemStyle, which replaces this one.
  tabItem: {
    justifyContent: 'center',
  },
  hiddenTabItem: {
    flex: 0,
    width: 0,
    padding: 0,
  },
  // See the Tab.Screen options above: pushes each middle tab's centered
  // content away from the bar's midpoint (where the FAB floats), one on
  // each side, rather than leaving both crowded directly under it.
  middleTabLeft: {
    marginRight: 20,
  },
  middleTabRight: {
    marginLeft: 20,
  },
  fab: {
    position: 'absolute',
    alignSelf: 'center',
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});

export default App;
