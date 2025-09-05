/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { runMigrations } from './db';
import { ensureDefaultAccount } from './db/queries';
import DashboardScreen from './screens/DashboardScreen';
import HistoryListScreen from './screens/HistoryListScreen';
import EditTransactionScreen from './screens/EditTransactionScreen';
import ExpensesByTypeScreen from './screens/ExpensesByTypeScreen';
import AddTransactionScreen from './screens/AddTransactionScreen';
import SettingsHomeScreen from './screens/SettingsHomeScreen';
import BudgetSettingsScreen from './screens/BudgetSettingsScreen';
import AccountsScreen from './screens/AccountsScreen';
import type {
  HistoryStackParamList,
  RootTabParamList,
  SettingsStackParamList,
} from './navigation/types';

const Tab = createBottomTabNavigator<RootTabParamList>();
const HistoryStack = createNativeStackNavigator<HistoryStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

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
        options={{ title: 'Settings' }}
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
    </SettingsStack.Navigator>
  );
}

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState<Error | null>(null);

  useEffect(() => {
    runMigrations()
      .then(() => ensureDefaultAccount())
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
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <NavigationContainer>
        <Tab.Navigator>
          <Tab.Screen name="Dashboard" component={DashboardScreen} />
          <Tab.Screen
            name="History"
            component={HistoryStackNavigator}
            options={{ headerShown: false }}
          />
          <Tab.Screen name="Expenses" component={ExpensesByTypeScreen} />
          <Tab.Screen name="Add" component={AddTransactionScreen} />
          <Tab.Screen
            name="Settings"
            component={SettingsStackNavigator}
            options={{ headerShown: false }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
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
