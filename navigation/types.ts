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
  // Optional preset for the FAB's "Liability Repayment" / "Receivable
  // Income" shortcuts (see App.tsx's AddEntrySheet) — undefined/omitted
  // still defaults to 'Liability', same as navigating here any other way.
  LiabilitiesReceivables: { type?: 'Liability' | 'Receivable' } | undefined;
  Categories: undefined;
  CategoryBudgets: undefined;
  Currencies: undefined;
  AppSettings: undefined;
  // payPlanId is optional — set only when Dashboard's installment
  // reminder "Pay" button navigates here, so this screen can jump
  // straight into that plan's pay modal instead of just landing on the
  // list. Consumed once (see InstallmentPlansScreen's own effect) so
  // navigating back here later via the tab/list never reopens it.
  InstallmentPlans: { payPlanId?: number } | undefined;
  RecurringRules: undefined;
  SavingsGoals: undefined;
  Tags: undefined;
  ExpensesByType: undefined;
  // Reached only via a link on AccountsScreen, never listed on
  // SettingsHome directly — see NetWorthScreen's own header comment for
  // why it's kept a deliberate extra tap away.
  NetWorth: undefined;
};

export type RootTabParamList = {
  Dashboard: NavigatorScreenParams<DashboardStackParamList> | undefined;
  History: NavigatorScreenParams<HistoryStackParamList> | undefined;
  Reports: undefined;
  // Kept as a real (if hidden) tab rather than folded into a modal stack
  // — AddScreen already manages its own Expense/Income sub-tabs as local
  // state, so this just needed a way to preset which one on arrival. The
  // FAB (App.tsx) navigates here instead of rendering a tab-bar button
  // for it.
  Add: { initialTab?: 'Expense' | 'Income' } | undefined;
  Settings: NavigatorScreenParams<SettingsStackParamList> | undefined;
};
