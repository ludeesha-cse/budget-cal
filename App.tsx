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
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
  NavigationContainer,
  useNavigation,
} from '@react-navigation/native';
import type { Theme as NavigationTheme } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChartColumn,
  House,
  MoreHorizontal,
  Plus,
  TrendingUp,
  X,
} from 'lucide-react-native';
import { runMigrations } from './db';
import { ensureDefaultAccount } from './db/queries';
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
import InstallmentPlansScreen from './screens/InstallmentPlansScreen';
import RecurringRulesScreen from './screens/RecurringRulesScreen';
import SavingsGoalsScreen from './screens/SavingsGoalsScreen';
import TagsScreen from './screens/TagsScreen';
import ReviewOccurrencesScreen from './screens/ReviewOccurrencesScreen';
import AccountScreen from './screens/AccountScreen';
import PaywallModal from './screens/PaywallModal';
import AddEntrySheet, { AddEntryKind } from './components/AddEntrySheet';
import { EntitlementProvider } from './hooks/useEntitlement';
import { PaywallProvider } from './contexts/PaywallContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { generatePendingOccurrences } from './db/queries';
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

// Dashboard's own stack (Stage 13b) — exists solely so the pending-
// occurrences banner can push ReviewOccurrences, the same way History
// pushes EditTransaction. headerShown is left on for DashboardHome (title
// 'Dashboard') since, unlike History/Settings, nothing before this stack
// existed already showing its own header.
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
        options={{ title: 'Review Recurring' }}
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
        name="Tags"
        component={TagsScreen}
        options={{ title: 'Tags' }}
      />
      <SettingsStack.Screen
        name="Account"
        component={AccountScreen}
        options={{ title: 'Account' }}
      />
    </SettingsStack.Navigator>
  );
}

// The Add tab's own header — a plain X rather than a real back arrow,
// since Add is a tab (not a stack push) and there's nowhere to "go back"
// to; tapping it just switches to Dashboard, same as any other tab
// button would.
function AddScreenCloseButton(): React.JSX.Element {
  const { colors } = useTheme();
  const navigation =
    useNavigation<BottomTabNavigationProp<RootTabParamList, 'Add'>>();
  return (
    <Pressable
      hitSlop={12}
      style={styles.closeButton}
      onPress={() => navigation.navigate('Dashboard')}>
      <X size={22} color={colors.text} />
    </Pressable>
  );
}

// Module-scope, not defined inside AppShell — react/no-unstable-nested-components
// would otherwise flag these (and rightly so: a JSX-returning function
// declared inside a component's render body is a brand-new component
// type on every render, remounting its subtree). Same reasoning ReportsScreen's
// PieCenterLabel already follows.
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

function renderAddScreenCloseButton(): React.JSX.Element {
  return <AddScreenCloseButton />;
}

// Split out from App so it can call useTheme() — that hook only works
// inside ThemeProvider, which itself can only mount once the DB is ready
// (see App's `ready` gate below), so this can't just live at the top of
// App() alongside the loading-screen early returns.
function AppShell(): React.JSX.Element {
  const { scheme } = useTheme();

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />
      <AppNavigator />
      <PaywallModal />
    </SafeAreaProvider>
  );
}

// Split out from AppShell specifically so useSafeAreaInsets() (the FAB's
// bottom offset) has a real value to read — that hook only works inside
// <SafeAreaProvider>, and AppShell is the component that RENDERS the
// provider, not a descendant of it. Calling the hook directly in AppShell
// (as this used to) throws "No safe area value available" at runtime,
// even though the JSX below the hook looks like it's "inside" the
// provider — the provider's context isn't established until React
// actually mounts a component underneath it, which AppShell itself never
// is.
function AppNavigator(): React.JSX.Element {
  const { scheme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [sheetOpen, setSheetOpen] = useState(false);
  // Set by AppShell's own <NavigationContainer>, read by the FAB — see
  // the ref callback below. A plain module-level navigation object isn't
  // available here the way screens get one from useNavigation(), since
  // the FAB lives as a sibling of <Tab.Navigator> rather than inside one
  // of its screens.
  const [navigationRef, setNavigationRef] =
    useState<import('@react-navigation/native').NavigationContainerRef<RootTabParamList> | null>(
      null,
    );

  // The floating tab bar/FAB below are positioned with a fixed
  // `marginBottom`/`bottom` measured from THIS view's own bottom edge —
  // fine normally, but AndroidManifest.xml sets windowSoftInputMode to
  // adjustResize, which shrinks this entire view's height by the
  // keyboard's height whenever a TextInput is focused. A bottom-anchored
  // margin inside a view that just got shorter means the bar/FAB end up
  // sitting right above the keyboard instead of at the real screen
  // bottom — exactly the "tab bar chases the keyboard" bug reported.
  // Hiding both while the keyboard is visible (rather than trying to
  // re-anchor them) is the simplest fix that also matches what a user
  // actually wants here: neither is useful to tap while typing anyway.
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () =>
      setKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener('keyboardDidHide', () =>
      setKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Maps our own token palette onto React Navigation's theme shape so the
  // tab bar / header chrome and screen backgrounds follow the same
  // light/dark choice as everything else, instead of defaulting to
  // Navigation's built-in light theme regardless of `scheme`. Based on
  // Navigation's own Default/Dark themes (rather than built from scratch)
  // so the required `fonts` block comes along for free.
  const navigationTheme: NavigationTheme = useMemo(() => {
    const base = scheme === 'dark' ? NavigationDarkTheme : NavigationDefaultTheme;
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
    // backgroundColor here (not just flex:1) matters specifically because
    // of the floating tab bar: its marginHorizontal/marginBottom leave a
    // visible gap on all sides between the pill and the real screen
    // edges, and without an explicit color here that gap fell through to
    // this View's default transparent fill — showing whatever's behind
    // it (effectively black) instead of the app's own background tone.
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <NavigationContainer theme={navigationTheme} ref={setNavigationRef}>
        <Tab.Navigator
          screenOptions={{
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.chevron,
            // A floating pill, not a flush-bottom bar: inset from the
            // left/right/bottom screen edges (marginHorizontal +
            // marginBottom, the last built on insets.bottom so it clears
            // the home indicator) with its own rounded corners and
            // shadow. Deliberately no marginTop/borderTopWidth — "not to
            // top" per spec, the bar sits flush at the top of its own
            // pill rather than getting extra headroom there. An explicit
            // `height` is required for React Navigation's own content-area
            // math (see getTabBarHeight in bottom-tabs) to reserve the
            // right amount of space above it — without one it reserves
            // less than this pill actually occupies once margin is added,
            // and the last bit of scrollable content would sit behind it.
            tabBarStyle: {
              backgroundColor: colors.card,
              borderTopWidth: 0,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
              borderRadius: 28,
              height: 64,
              marginHorizontal: 16,
              marginBottom: insets.bottom + 16,
              shadowColor: '#000',
              shadowOpacity: 0.15,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
              elevation: 8,
              // See keyboardVisible's own comment above — this is what
              // actually keeps the bar off the keyboard, both hiding it
              // and giving its reserved layout space back to the screen
              // content while a field is focused.
              display: keyboardVisible ? 'none' : 'flex',
            },
            tabBarLabelStyle: styles.tabBarLabel,
          }}>
          <Tab.Screen
            name="Dashboard"
            component={DashboardStackNavigator}
            options={{ headerShown: false, tabBarIcon: DashboardTabIcon }}
          />
          <Tab.Screen
            name="History"
            component={HistoryStackNavigator}
            options={{ headerShown: false, tabBarIcon: HistoryTabIcon }}
          />
          <Tab.Screen
            name="Reports"
            component={ReportsScreen}
            options={{ headerShown: false, tabBarIcon: ReportsTabIcon }}
          />
          {/* Hidden from the tab bar — reached only via the floating +
              button below (see AddEntrySheet). Still a normal tab under
              the hood so AddTransactionScreen keeps its existing
              navigation type and Expense/Income sub-tab behavior. */}
          <Tab.Screen
            name="Add"
            component={AddTransactionScreen}
            options={{
              tabBarButton: () => null,
              // tabBarButton: () => null only voids what's rendered INSIDE
              // this tab's slot — the tab bar always lays out one flex:1
              // item per route (see BottomTabBar.js), so without this the
              // hidden Add tab still reserved an equal share of the row,
              // pushing Settings/"More" out to the far right and leaving a
              // visible gap after Reports. Zeroing this tab's own item
              // width removes it from the row's flex distribution
              // entirely, so Dashboard/History/Reports/More share the full
              // width evenly, matching the mockup.
              tabBarItemStyle: styles.hiddenTabItem,
              title: 'Add',
              headerRight: renderAddScreenCloseButton,
            }}
          />
          <Tab.Screen
            name="Settings"
            component={SettingsStackNavigator}
            options={{
              headerShown: false,
              tabBarLabel: 'More',
              tabBarIcon: SettingsTabIcon,
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>

      {/* Floating action button — absolutely positioned over the tab
          bar rather than one of its buttons, matching the mockup. Icon
          swaps + ↔ × depending on whether the sheet is open, and the
          same tap target both opens and closes it.
          bottom = insets.bottom + 56 lifts the FAB mostly clear above the
          pill (pill top edge sits at insets.bottom+80 — see tabBarStyle
          above), dipping into it by only ~24px so it still reads as
          docked to the bar rather than floating independently, without
          sinking down far enough to cover the History/Reports labels the
          way a lower value did. */}
      {/* Same fixed-from-bottom positioning problem as tabBarStyle above,
          so the same fix: just don't render it while a field is focused
          — there's nothing useful to tap here while typing anyway, and
          it would otherwise float up and sit on top of the keyboard. */}
      {!keyboardVisible && (
        <Pressable
          style={[
            styles.fab,
            {
              backgroundColor: colors.primary,
              bottom: insets.bottom + 56,
            },
          ]}
          onPress={() => setSheetOpen(open => !open)}>
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

function App(): React.JSX.Element {
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState<Error | null>(null);

  useEffect(() => {
    runMigrations()
      .then(() => ensureDefaultAccount())
      // Stage 13b: generated once here on every cold start, and again on
      // every Dashboard focus (see DashboardScreen). Safe to call this
      // often — generatePendingOccurrences is idempotent by design (see
      // its own doc comment) — so there's no "did startup already do
      // this today" flag to maintain.
      .then(() => generatePendingOccurrences())
      .then(() => setReady(true))
      .catch(setStartupError);
  }, []);

  if (startupError) {
    return (
      <View style={styles.center}>
        <Text>Database setup failed: {startupError.message}</Text>
      </View>
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

  return (
    // EntitlementProvider and PaywallProvider wrap the whole navigator so
    // any screen can call useEntitlement()/usePaywall() without prop
    // drilling. ThemeProvider is mounted here (not earlier) because its
    // initial getThemeMode() read assumes app_settings has already been
    // seeded, which only happens once runMigrations() above has resolved.
    <EntitlementProvider>
      <PaywallProvider>
        <AuthProvider>
          <ThemeProvider>
            <AppShell />
          </ThemeProvider>
        </AuthProvider>
      </PaywallProvider>
    </EntitlementProvider>
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
  fill: {
    flex: 1,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  hiddenTabItem: {
    flex: 0,
    width: 0,
    padding: 0,
  },
  fab: {
    position: 'absolute',
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  closeButton: {
    paddingHorizontal: 4,
  },
});

export default App;
