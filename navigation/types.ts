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
  Accounts:
    | {
        openTransfer?: boolean;
        withdrawMode?: boolean;
        // Opens the "add a currency" form under this account — from the
        // Dashboard's "Cash in wallet has no currency yet" banner.
        setupAccountId?: number;
      }
    | undefined;
  LiabilitiesReceivables: { type?: 'Liability' | 'Receivable' } | undefined;
  Categories: undefined;
  CategoryBudgets: undefined;
  Currencies: undefined;
  ExchangeRates: undefined;
  AppSettings: undefined;
  InstallmentPlans: { payPlanId?: number } | undefined;
  // Each plan's and each goal's own screen — the payment/contribution
  // history with its per-row corrections, plus the actions that are used
  // rarely enough not to earn a place on the card. These used to be an
  // in-card expansion, which meant a long history pushed every other
  // card off the screen and left no room for a row to carry its own
  // edit/undo controls.
  InstallmentPlanDetails: { planId: number };
  RecurringRules: undefined;
  SavingsGoals: undefined;
  SavingsGoalDetails: { goalId: number };
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
