import type { NavigatorScreenParams } from '@react-navigation/native';

export type HistoryStackParamList = {
  HistoryList: undefined;
  EditTransaction: { id: number };
};

// Dashboard needed its own stack (Stage 13b) purely so it can push
// ReviewOccurrences the same way History pushes EditTransaction — before
// this, Dashboard was a bare Tab.Screen with nowhere to navigate to.
export type DashboardStackParamList = {
  DashboardHome: undefined;
  ReviewOccurrences: undefined;
};

export type SettingsStackParamList = {
  SettingsHome: undefined;
  BudgetSettings: undefined;
  Accounts: undefined;
  LiabilitiesReceivables: undefined;
  Categories: undefined;
  CategoryBudgets: undefined;
  Currencies: undefined;
  AppSettings: undefined;
  InstallmentPlans: undefined;
  RecurringRules: undefined;
  SavingsGoals: undefined;
  Tags: undefined;
};

export type RootTabParamList = {
  Dashboard: NavigatorScreenParams<DashboardStackParamList> | undefined;
  History: NavigatorScreenParams<HistoryStackParamList> | undefined;
  Expenses: undefined;
  Add: undefined;
  Settings: NavigatorScreenParams<SettingsStackParamList> | undefined;
};
