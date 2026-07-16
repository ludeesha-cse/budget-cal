// Barrel re-export so existing `import { ... } from '../db/queries'` call
// sites keep working unchanged after the split of the old monolithic
// db/queries.ts into one file per domain area below.
//
// Every value export is now passed through `instrument()` on its way out.
// That is a __DEV__-only pass-through logger that counts how many times
// each database entry point is actually called — see
// ./instrumentation.ts for what it does and how to remove it. Nothing in
// the domain modules themselves changed: same bodies, same return types,
// same NETWORK-READY comments. Types are re-exported directly (they have
// no runtime representation to wrap).
import { instrument } from './instrumentation';
import * as transactionsModule from './transactions';
import * as budgetsModule from './budgets';
import * as accountsModule from './accounts';
import * as creditCardsModule from './creditCards';
import * as loansModule from './loans';
import * as transfersModule from './transfers';
import * as categoriesModule from './categories';
import * as currenciesModule from './currencies';
import * as settingsModule from './settings';
import * as installmentsModule from './installments';
import * as recurringModule from './recurring';
import * as savingsGoalsModule from './savingsGoals';
import * as tagsModule from './tags';
import * as reportsModule from './reports';
import * as dataExportModule from './dataExport';
import * as exchangeRatesModule from './exchangeRates';

export { getDbHitReport, resetDbHitReport, logDbHitReport } from './instrumentation';
export type { DbHitReport } from './instrumentation';

export type {
  NewTransaction,
  NewIncome,
  ExpenseCurrencyOption,
} from './transactions';
export type {
  BudgetWithCurrency,
  CurrencyOption,
} from './budgets';
export type {
  Account,
  NewAccount,
  AccountBalanceWithCurrent,
} from './accounts';
export type {
  PayOffCreditCardParams,
} from './creditCards';
export type {
  LoanAccountType,
  LoanTerms,
  NewLoanAccount,
  ReactivatedLoanAccount,
  SettleLoanParams,
} from './loans';
export type {
  CreateTransferParams,
  UpdateTransferParams,
  TransferSides,
  TransferListRow,
} from './transfers';
export type { ExchangeRateRow } from './exchangeRates';
export type {
  ThemeMode,
  AppMeta,
} from './settings';
export type {
  NewInstallmentPlanParams,
  InstallmentReminderRow,
  PayInstallmentParams,
} from './installments';
export type {
  NewRecurringRuleParams,
  ConfirmOccurrenceParams,
} from './recurring';
export type {
  NewSavingsGoalParams,
  CreateSavingsTransferParams,
  SavingsGoalListRow,
} from './savingsGoals';
export type {
  SearchTransactionsParams,
  ReportSummary,
  CategorySpendingRow,
  AccountTypeSpendingRow,
  MonthlyTrendRow,
} from './reports';
export type {
  ImportMode,
  ImportWorkbookData,
} from './dataExport';

// One flat object of every domain module's value exports, wrapped once,
// then destructured back out under their original names. The generator
// that produced this list fails loudly on a duplicate export name across
// modules, which is the one thing a spread (unlike `export *`) would
// otherwise resolve silently.
export const {
  // --- transactions ---
  getTransactions,
  addTransaction,
  addIncome,
  getTransactionsByMonth,
  getTransactionsByYear,
  getExpensesByType,
  getExpenseCurrenciesForMonth,
  getMonthlyTotal,
  getMonthlyIncome,
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  // --- budgets ---
  getBudgetForMonth,
  getBudgetsForMonth,
  upsertBudget,
  deleteBudget,
  getAllBudgetsForCurrency,
  getCategoryBudget,
  getCategoryBudgetsForMonth,
  upsertCategoryBudget,
  getBudgetCurrencyOptions,
  // --- accounts ---
  ensureDefaultAccount,
  getAccounts,
  addAccountWithBalance,
  addCurrencyToAccount,
  addAccount,
  updateAccount,
  deleteAccount,
  CREDIT_CARD_TYPE,
  getNetSpentForAccount,
  getAccountBalance,
  getTotalCashInHandByCurrency,
  updateAccountBalanceWithAudit,
  getAccountBalances,
  getAllAccountBalances,
  getAccountTotalBalance,
  closeAccount,
  reactivateAccount,
  getActiveAccountCountByType,
  // --- creditCards ---
  getTotalCreditCardDebt,
  getCreditCardDebt,
  settleCreditCardAccount,
  payOffCreditCard,
  // --- loans ---
  shiftAccountBaselineWithin,
  upsertAccountBalanceWithin,
  getInactiveLoanAccounts,
  getActiveLoanAccounts,
  createLoanAccount,
  reactivateLoanAccount,
  getLoanTotalOwed,
  settleLoan,
  getLoanPaymentsByMonth,
  getLoanPaymentsByYear,
  // --- transfers ---
  getTransferableAccounts,
  createTransfer,
  updateTransfer,
  deleteTransfer,
  getTransfers,
  getTransfersByYear,
  // --- categories ---
  getCategories,
  addCategory,
  updateCategory,
  deleteCategory,
  getUserCategoryCount,
  // --- currencies ---
  getCurrencies,
  getActiveCurrencies,
  addCurrency,
  setCurrencyActive,
  getDefaultCurrency,
  setDefaultCurrency,
  confirmDefaultCurrency,
  deleteCurrency,
  // --- settings ---
  getThemeMode,
  setThemeMode,
  getPaletteId,
  setPaletteId,
  getAppMeta,
  setOnboardingCompleted,
  setDefaultCurrencyConfirmed,
  // --- installments ---
  createInstallmentPlan,
  getInstallmentPlans,
  getInstallmentReminders,
  updateInstallmentPlan,
  deleteInstallmentPlan,
  getInstallmentPayments,
  getNextUnpaidInstallmentNumber,
  payInstallment,
  unpayInstallment,
  getRemainingInstallmentBalance,
  // --- recurring ---
  getRecurringRules,
  createRecurringRule,
  updateRecurringRule,
  setRecurringRuleActive,
  deleteRecurringRule,
  generatePendingOccurrences,
  getPendingOccurrences,
  confirmOccurrence,
  skipOccurrence,
  getOccurrenceHistory,
  // --- savingsGoals ---
  getSavingsGoals,
  createSavingsGoal,
  updateSavingsGoal,
  setSavingsGoalStatus,
  deleteSavingsGoal,
  createSavingsTransfer,
  getContributions,
  deleteContribution,
  getSavingsGoalsForAccount,
  // --- exchangeRates ---
  getExchangeRates,
  getCurrencyRates,
  setExchangeRate,
  resetExchangeRate,
  // --- tags ---
  getTags,
  addTag,
  updateTag,
  deleteTag,
  setTransactionTags,
  getTagsForTransaction,
  // --- reports ---
  searchTransactions,
  getReportSummary,
  getSpendingByCategory,
  getSpendingByAccountType,
  getMonthlyTrend,
  // --- dataExport ---
  getAllDataForExport,
  wipeAllData,
  importData,
} = instrument({
  ...transactionsModule,
  ...budgetsModule,
  ...accountsModule,
  ...creditCardsModule,
  ...loansModule,
  ...transfersModule,
  ...categoriesModule,
  ...currenciesModule,
  ...settingsModule,
  ...installmentsModule,
  ...recurringModule,
  ...savingsGoalsModule,
  ...tagsModule,
  ...reportsModule,
  ...dataExportModule,
  ...exchangeRatesModule,
});
