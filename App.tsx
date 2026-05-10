/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from 'react-native';
import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
  NavigationContainer,
} from '@react-navigation/native';
import type { Theme as NavigationTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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
import LiabilitiesReceivablesScreen from './screens/LiabilitiesReceivablesScreen';
import CategoriesScreen from './screens/CategoriesScreen';
import CategoryBudgetsScreen from './screens/CategoryBudgetsScreen';
import CurrenciesScreen from './screens/CurrenciesScreen';
import InstallmentPlansScreen from './screens/InstallmentPlansScreen';
import RecurringRulesScreen from './screens/RecurringRulesScreen';
import SavingsGoalsScreen from './screens/SavingsGoalsScreen';
import TagsScreen from './screens/TagsScreen';
import ReviewOccurrencesScreen from './screens/ReviewOccurrencesScreen';
import PaywallModal from './screens/PaywallModal';
import { EntitlementProvider } from './hooks/useEntitlement';
import { PaywallProvider } from './contexts/PaywallContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
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
        options={{ title: 'Dashboard' }}
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
        options={{ title: 'History' }}
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
      <SettingsStack.Screen
        name="LiabilitiesReceivables"
        component={LiabilitiesReceivablesScreen}
        options={{ title: 'Liabilities & Receivables' }}
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
    </SettingsStack.Navigator>
  );
}

// Split out from App so it can call useTheme() — that hook only works
// inside ThemeProvider, which itself can only mount once the DB is ready
// (see App's `ready` gate below), so this can't just live at the top of
// App() alongside the loading-screen early returns.
function AppShell(): React.JSX.Element {
  const { scheme, colors } = useTheme();

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

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />
      <NavigationContainer theme={navigationTheme}>
        <Tab.Navigator>
          <Tab.Screen
            name="Dashboard"
            component={DashboardStackNavigator}
            options={{ headerShown: false }}
          />
          <Tab.Screen
            name="History"
            component={HistoryStackNavigator}
            options={{ headerShown: false }}
          />
          <Tab.Screen name="Expenses" component={ExpensesByTypeScreen} />
          <Tab.Screen name="Reports" component={ReportsScreen} />
          <Tab.Screen name="Add" component={AddTransactionScreen} />
          <Tab.Screen
            name="Settings"
            component={SettingsStackNavigator}
            options={{ headerShown: false, tabBarLabel: 'More' }}
          />
        </Tab.Navigator>
      </NavigationContainer>
      <PaywallModal />
    </SafeAreaProvider>
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
        <ThemeProvider>
          <AppShell />
        </ThemeProvider>
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
});

export default App;
