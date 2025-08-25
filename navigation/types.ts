import type { NavigatorScreenParams } from '@react-navigation/native';

export type HistoryStackParamList = {
  HistoryList: undefined;
  EditTransaction: { id: number };
};

export type RootTabParamList = {
  Dashboard: undefined;
  History: NavigatorScreenParams<HistoryStackParamList> | undefined;
  Expenses: undefined;
  Add: undefined;
  Budget: undefined;
};
