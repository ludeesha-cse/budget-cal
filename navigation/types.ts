import type { NavigatorScreenParams } from '@react-navigation/native';

export type HistoryStackParamList = {
  HistoryList: undefined;
  EditTransaction: { id: number };
};

export type SettingsStackParamList = {
  SettingsHome: undefined;
  BudgetSettings: undefined;
  Accounts: undefined;
  LiabilitiesReceivables: undefined;
  Categories: undefined;
  CategoryBudgets: undefined;
  Currencies: undefined;
};

export type RootTabParamList = {
  Dashboard: undefined;
  History: NavigatorScreenParams<HistoryStackParamList> | undefined;
  Expenses: undefined;
  Add: undefined;
  Settings: NavigatorScreenParams<SettingsStackParamList> | undefined;
};
