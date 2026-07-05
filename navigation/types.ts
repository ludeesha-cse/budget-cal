import type { NavigatorScreenParams } from '@react-navigation/native';

export type HistoryStackParamList = {
  HistoryList: undefined;
  EditTransaction: { id: number };
};

export type DashboardStackParamList = {
  DashboardHome: undefined;
  ReviewOccurrences: undefined;
};

export type SettingsStackParamList = {
  SettingsHome: undefined;
  BudgetSettings: undefined;
  Accounts: { openTransfer?: boolean; withdrawMode?: boolean } | undefined;
  LiabilitiesReceivables: { type?: 'Liability' | 'Receivable' } | undefined;
  Categories: undefined;
  CategoryBudgets: undefined;
  Currencies: undefined;
  AppSettings: undefined;
  InstallmentPlans: { payPlanId?: number } | undefined;
  RecurringRules: undefined;
  SavingsGoals: undefined;
  Tags: undefined;
  ExpensesByType: undefined;
  NetWorth: undefined;
  Account: undefined;
  HelpSupport: undefined;
};

export type RootTabParamList = {
  Dashboard: NavigatorScreenParams<DashboardStackParamList> | undefined;
  History: NavigatorScreenParams<HistoryStackParamList> | undefined;
  Reports: undefined;
  Add: { initialTab?: 'Expense' | 'Income' } | undefined;
  Settings: NavigatorScreenParams<SettingsStackParamList> | undefined;
};
