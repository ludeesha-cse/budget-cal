import { and, desc, eq, gte, inArray, like, lte, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db } from './index';
import {
  accountBalances,
  accounts,
  appSettings,
  budgets,
  categories,
  categoryBudgets,
  creditCardPayoffs,
  currencies,
  installmentPayments,
  installmentPlans,
  loanDetails,
  loanPayments,
  recurringOccurrences,
  recurringRules,
  savingsContributions,
  savingsGoals,
  tags,
  transactionTags,
  transactions,
  transfers,
} from './schema';
import {
  formatDateString,
  getCurrentDateString,
  getNextOccurrenceDate,
  getOccurrenceDatesBetween,
} from '../utils/date';
import { getTotalOwed } from '../utils/interestCalculations';
import { getBalanceDelta } from '../utils/balanceMath';
import {
  calculateFromMonthly,
  calculateFromPrincipal,
} from '../utils/installmentMath';
import {
  SCHEMA_VERSION,
  type ExportRow,
  type ExportWorkbookData,
  type SheetName,
} from '../utils/exportFormat';
import { DEFAULT_PALETTE_ID } from '../theme/palettes';
import { version as APP_VERSION } from '../package.json';

const RESERVED_BANK_CATEGORY_NAME = 'Bank';

type Budget = typeof budgets.$inferSelect;
type Transaction = typeof transactions.$inferSelect;
type Account = typeof accounts.$inferSelect;
type Category = typeof categories.$inferSelect;
type CategoryBudget = typeof categoryBudgets.$inferSelect;
type Currency = typeof currencies.$inferSelect;
type InstallmentPlan = typeof installmentPlans.$inferSelect;
type RecurringRule = typeof recurringRules.$inferSelect;
type SavingsGoal = typeof savingsGoals.$inferSelect;
type Tag = typeof tags.$inferSelect;

export type NewTransaction = {
  accountId: number;
  amount: number;
  categoryId: number;
  description?: string;
  date: string; // 'YYYY-MM-DD'
  entryType: 'Expense' | 'Income';
  currencyId: number;
  excludeFromBudget?: boolean; // Stage 16a — defaults to false when omitted
};

// No categoryId — Income entries carry no category at all, by design
// (the dedicated Income tab has no category picker anywhere in it).
export type NewIncome = {
  date: string; // 'YYYY-MM-DD'
  amount: number;
  description?: string;
  accountId: number;
  currencyId: number;
  excludeFromBudget?: boolean; // Stage 16a — defaults to false when omitted
};

export type NewAccount = {
  name: string;
  type: string;
  openingBalance: number;
};

//If a backend is added later, replace this with a fetch() call
// to GET /api/transactions, keeping the same return type.
export async function getTransactions() {
  try {
    return await db.select().from(transactions);
  } catch (error) {
    console.error('getTransactions: failed to load all transactions', error);
    throw error;
  }
}

//  If a backend is added later, replace this with a fetch() call
// to POST /api/transactions, keeping the same input/return shape. Used
// for Expense entries; Income goes through addIncome instead, even
// though the two share the same underlying insert shape — kept as
// separate named functions per Stage 8's spec. No balance arithmetic
// happens here — this just records the row; getNetSpentForAccount is
// the only place that later decides what effect entryType has on the
// balance (via getBalanceDelta in utils/balanceMath.ts), so there's
// nothing here that could disagree with it.
export async function addTransaction(data: NewTransaction) {
  try {
    return await db
      .insert(transactions)
      .values({
        ...data,
        excludeFromBudget: data.excludeFromBudget ?? false,
        createdAt: Date.now(),
      })
      .returning();
  } catch (error) {
    console.error('addTransaction: failed to insert transaction', data, error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to POST /api/transactions/income, keeping the same input/return
// shape. This is the single insert for the whole operation — account
// balances are never stored as a running total, they're always derived
// on read (getAccountBalance nets every transaction for the account
// against its stored baseline via getBalanceDelta), so there's no second
// write to account_balances that could fall out of sync with this one:
// the "balance effect" and "recording the transaction" are the same write.
// categoryId is always written as null — Income never gets a category.
export async function addIncome(data: NewIncome) {
  try {
    return await db
      .insert(transactions)
      .values({
        accountId: data.accountId,
        amount: data.amount,
        categoryId: null,
        description: data.description,
        date: data.date,
        currencyId: data.currencyId,
        entryType: 'Income',
        excludeFromBudget: data.excludeFromBudget ?? false,
        createdAt: Date.now(),
      })
      .returning();
  } catch (error) {
    console.error('addIncome: failed to insert income transaction', data, error);
    throw error;
  }
}

// If a backend is added later, replace this with a fetch() call
// to GET/POST /api/accounts/default, keeping the same
// return shape.
export async function ensureDefaultAccount() {
  const existing = await db.select().from(accounts).limit(1);
  if (existing.length > 0) {
    return existing[0];
  }
  const [account] = await db
    .insert(accounts)
    .values({
      name: 'Cash',
      type: 'Cash',
      createdAt: Date.now(),
    })
    .returning();
  return account;
}

//  If a backend is added later, replace this with a fetch() call
// to GET /api/transactions?month=YYYY-MM, keeping the same return type.
export async function getTransactionsByMonth(month: string) {
  try {
    return await db
      .select({
        id: transactions.id,
        accountId: transactions.accountId,
        // Joined in (Stage: History account display) so HistoryListScreen
        // can show which account each expense/income actually moved
        // through, the same way it already shows from/to for transfers
        // and loan payments — accountId alone meant looking that up meant
        // a second round trip per row.
        accountName: accounts.name,
        amount: transactions.amount,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        description: transactions.description,
        date: transactions.date,
        entryType: transactions.entryType,
        currencyId: transactions.currencyId,
        excludeFromBudget: transactions.excludeFromBudget,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(like(transactions.date, `${month}%`));
  } catch (error) {
    console.error(
      `getTransactionsByMonth: failed to load transactions for month=${month}`,
      error,
    );
    throw error;
  }
}

//If a backend is added later, replace this with a fetch() call
// to GET /api/transactions?year=YYYY, keeping the same return type.
export async function getTransactionsByYear(year: string) {
  try {
    return await db
      .select({
        id: transactions.id,
        accountId: transactions.accountId,
        // See getTransactionsByMonth's own comment on this same join.
        accountName: accounts.name,
        amount: transactions.amount,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        description: transactions.description,
        date: transactions.date,
        entryType: transactions.entryType,
        currencyId: transactions.currencyId,
        excludeFromBudget: transactions.excludeFromBudget,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(like(transactions.date, `${year}%`));
  } catch (error) {
    console.error(
      `getTransactionsByYear: failed to load transactions for year=${year}`,
      error,
    );
    throw error;
  }
}

//If a backend is added later, replace this with a fetch() call
// to GET /api/transactions/summary?month=YYYY-MM&groupBy=category, keeping
// the same return shape. Expense-only — Income entries are tracked
// separately (getMonthlyIncome) rather than netted into "expenses by type".
export async function getExpensesByType(month: string) {
  try {
    return await db
      .select({
        type: categories.name,
        total: sql<number>`sum(${transactions.amount})`,
      })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        and(
          like(transactions.date, `${month}%`),
          eq(transactions.entryType, 'Expense'),
        ),
      )
      .groupBy(categories.name);
  } catch (error) {
    console.error(
      `getExpensesByType: failed to summarize expenses by category for month=${month}`,
      error,
    );
    throw error;
  }
}

//If a backend is added later, replace this with a fetch() call
// to GET /api/transactions/summary?month=YYYY-MM&total=1, keeping the same
// return shape. Expense-only, so Income entries don't mask how much was
// actually spent — see getMonthlyIncome for the income-side figure.
// Stage 16a: excludeFromBudget transactions are always left out here —
// this function backs the Dashboard/Budget screens, which have no
// "include excluded" toggle at all (that's a Reports-only concept). A
// transaction marked excludeFromBudget still exists and still shows up
// in History; it just never contributes to what "spent this month" means.
export async function getMonthlyTotal(month: string): Promise<number> {
  try {
    const [row] = await db
      .select({ total: sql<number>`sum(${transactions.amount})` })
      .from(transactions)
      .where(
        and(
          like(transactions.date, `${month}%`),
          eq(transactions.entryType, 'Expense'),
          eq(transactions.excludeFromBudget, false),
        ),
      );
    return row?.total ?? 0;
  } catch (error) {
    console.error(
      `getMonthlyTotal: failed to sum expenses for month=${month}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/transactions/summary?month=YYYY-MM&total=1&entryType=Income,
// keeping the same return shape. Mirrors getMonthlyTotal but for Income —
// same Stage 16a excludeFromBudget exclusion, same reasoning.
export async function getMonthlyIncome(month: string): Promise<number> {
  try {
    const [row] = await db
      .select({ total: sql<number>`sum(${transactions.amount})` })
      .from(transactions)
      .where(
        and(
          like(transactions.date, `${month}%`),
          eq(transactions.entryType, 'Income'),
          eq(transactions.excludeFromBudget, false),
        ),
      );
    return row?.total ?? 0;
  } catch (error) {
    console.error(
      `getMonthlyIncome: failed to sum income for month=${month}`,
      error,
    );
    throw error;
  }
}

//If a backend is added later, replace this with a fetch() call
// to GET /api/budgets?month=YYYY-MM, keeping the same return type.
export async function getBudgetForMonth(month: string): Promise<Budget | null> {
  const [budget] = await db
    .select()
    .from(budgets)
    .where(eq(budgets.month, month))
    .limit(1);
  return budget ?? null;
}

//If a backend is added later, replace this with a fetch() call
// to GET /api/transactions/:id, keeping the same return type.
export async function getTransactionById(
  id: number,
): Promise<Transaction | null> {
  const [row] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, id))
    .limit(1);
  return row ?? null;
}

// If a backend is added later, replace this with fetch(PATCH
// /api/transactions/:id), keeping the same input/return shape. There's no
// "reverse the old effect, apply the new one" step here — unlike a stored
// running-total balance, this app's balance is recomputed from scratch on
// every read (getAccountBalance -> getNetSpentForAccount), so editing this
// row is itself the entire update: the next read just nets a different
// set of transactions and gets the right answer for free, through the
// same getBalanceDelta direction logic as everything else.
export async function updateTransaction(
  id: number,
  data: Partial<NewTransaction>,
) {
  return db
    .update(transactions)
    .set(data)
    .where(eq(transactions.id, id))
    .returning();
}

// If a backend is added later, replace this with fetch(DELETE
// /api/transactions/:id), keeping the same return shape. Same reasoning
// as updateTransaction above — deleting the row removes its effect from
// the next getNetSpentForAccount computation automatically, since nothing
// about the balance is ever stored per-transaction.
export async function deleteTransaction(id: number) {
  return db.delete(transactions).where(eq(transactions.id, id)).returning();
}

function monthStartEpoch(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber - 1, 1).getTime();
}

// If a backend is added later, replace this with fetch(POST or PATCH
// /api/budgets), keeping the same input/return shape.
export async function upsertBudget(
  month: string,
  amount: number,
): Promise<Budget> {
  const existing = await getBudgetForMonth(month);
  if (existing) {
    const [updated] = await db
      .update(budgets)
      .set({ limitAmount: amount })
      .where(eq(budgets.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(budgets)
    .values({
      category: 'Overall',
      limitAmount: amount,
      period: 'monthly',
      startDate: monthStartEpoch(month),
      month,
      createdAt: Date.now(),
    })
    .returning();
  return created;
}

// If a backend is added later, replace this with fetch(GET /api/budgets),
// keeping the same return type.
export async function getAllBudgets(): Promise<Budget[]> {
  return db.select().from(budgets).orderBy(desc(budgets.month));
}

// If a backend is added later, replace this with a fetch() call to GET
// /api/accounts, keeping the same return type.
export async function getAccounts(): Promise<Account[]> {
  return db.select().from(accounts);
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// or PATCH /api/accounts/:id/balances), keeping the same input/return
// shape. Inserts or updates the (accountId, currencyId) balance row.
async function upsertAccountBalance(
  accountId: number,
  currencyId: number,
  balance: number,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(accountBalances)
    .where(
      and(
        eq(accountBalances.accountId, accountId),
        eq(accountBalances.currencyId, currencyId),
      ),
    )
    .limit(1);
  if (existing) {
    await db
      .update(accountBalances)
      .set({ balance })
      .where(eq(accountBalances.id, existing.id));
  } else {
    await db.insert(accountBalances).values({ accountId, currencyId, balance });
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/accounts), keeping the same input/return shape. Creates the
// account and its first account_balances row together, in the given
// currency.
export async function addAccountWithBalance(
  name: string,
  type: string,
  currencyId: number,
  initialBalance: number,
): Promise<Account> {
  const [account] = await db
    .insert(accounts)
    .values({ name, type, createdAt: Date.now() })
    .returning();
  await db.insert(accountBalances).values({
    accountId: account.id,
    currencyId,
    balance: initialBalance,
  });
  return account;
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/accounts/:id/balances), keeping the same input/return shape. Adds
// an additional currency balance to an existing account; rejects if the
// account already has a balance in this currency (the unique
// (accountId, currencyId) constraint from Stage 7a).
export async function addCurrencyToAccount(
  accountId: number,
  currencyId: number,
  initialBalance: number,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(accountBalances)
    .where(
      and(
        eq(accountBalances.accountId, accountId),
        eq(accountBalances.currencyId, currencyId),
      ),
    )
    .limit(1);
  if (existing) {
    throw new Error('This account already has a balance in this currency.');
  }
  await db.insert(accountBalances).values({
    accountId,
    currencyId,
    balance: initialBalance,
  });
}

// If a backend is added later, replace this with a fetch() call to POST
// /api/accounts, keeping the same input/return shape. The opening balance
// is stored in account_balances under the default currency.
export async function addAccount(data: NewAccount): Promise<Account> {
  const [account] = await db
    .insert(accounts)
    .values({
      name: data.name,
      type: data.type,
      createdAt: Date.now(),
    })
    .returning();
  const defaultCurrency = await getDefaultCurrency();
  if (defaultCurrency) {
    await upsertAccountBalance(account.id, defaultCurrency.id, data.openingBalance);
  }
  return account;
}

// If a backend is added later, replace this with fetch(PATCH
// /api/accounts/:id), keeping the same input/return shape. An updated
// opening balance is written to account_balances under the default
// currency.
export async function updateAccount(
  id: number,
  data: Partial<NewAccount>,
): Promise<Account> {
  const { openingBalance, ...rest } = data;
  if (Object.keys(rest).length > 0) {
    await db.update(accounts).set(rest).where(eq(accounts.id, id));
  }
  if (openingBalance !== undefined) {
    const defaultCurrency = await getDefaultCurrency();
    if (defaultCurrency) {
      await upsertAccountBalance(id, defaultCurrency.id, openingBalance);
    }
  }
  const [updated] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, id))
    .limit(1);
  return updated;
}

// If a backend is added later, replace this with fetch(DELETE
// /api/accounts/:id), keeping the same return shape.
export async function deleteAccount(id: number): Promise<Account[]> {
  const referencing = await db
    .select()
    .from(transactions)
    .where(eq(transactions.accountId, id))
    .limit(1);
  if (referencing.length > 0) {
    throw new Error(
      'Cannot delete this account because it has existing transactions.',
    );
  }
  await db.delete(accountBalances).where(eq(accountBalances.accountId, id));
  return db.delete(accounts).where(eq(accounts.id, id)).returning();
}

const CREDIT_CARD_TYPE = 'CreditCard';

// Liability/Receivable accounts never carry ordinary transactions (their
// balances belong entirely to createLoanAccount()/settleLoan()), so
// getBalanceDelta refuses to answer for them. Both call sites below check
// this first so a stray loan-type account never reaches getBalanceDelta
// and throws where nothing used to throw.
function isLoanManagedAccountType(accountType: string): boolean {
  return accountType === 'Liability' || accountType === 'Receivable';
}

// getBalanceDelta speaks in real-world terms: for a CreditCard, "Expense"
// means "you owe more," which it represents as a *positive* number. But
// this app stores every account's balance as a single signed number in
// account_balances, and for a CreditCard that stored number is the
// negative of what's owed (see getTotalCreditCardDebt's final negation
// below) — not the debt itself. So the real-world delta from
// getBalanceDelta has to be flipped before it's applied to that stored
// number. This is the only place that conversion happens; getBalanceDelta
// is still the only place that decides which direction Expense/Income go
// — this just translates that decision into the storage representation.
function getStoredBalanceDelta(
  accountType: string,
  entryType: 'Expense' | 'Income',
  amount: number,
): number {
  const realWorldDelta = getBalanceDelta(accountType, entryType, amount);
  return accountType === CREDIT_CARD_TYPE ? -realWorldDelta : realWorldDelta;
}

// Net "spent" for one (account, currency) pair: Expense entries add to
// it, Income entries subtract from it, so getAccountBalance can do a
// single subtraction (openingBalance - netSpent) and have Income
// correctly increase the resulting balance instead of reducing it like
// an Expense would. Now filtered by currencyId too — closing the "known
// simplification" flagged back in Stage 7b/7c now that transactions
// finally carry their own currency.
//
// Computed in JS (fetch rows, then reduce) rather than a SQL CASE
// expression as before, specifically so the sign decision goes through
// getStoredBalanceDelta/getBalanceDelta instead of being re-typed here —
// this and updateAccountBalanceWithAudit are the only two places in the
// app that ever decide which way an Expense/Income moves a balance, and
// both now defer to the same function. netSpent is kept as its own
// quantity (the negative of the total balance effect) purely because
// getAccountBalance's "openingBalance - netSpent" shape, and
// settleCreditCardAccount's use of this same return value as a new
// baseline, both predate this refactor and still expect it.
async function getNetSpentForAccount(
  accountId: number,
  currencyId: number,
): Promise<number> {
  try {
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);
    // Falls back to a plain asset account if the account row is somehow
    // missing — matches the old SQL formula's behavior, which never
    // looked at account type at all.
    const accountType = account?.type ?? 'Bank';
    const rows = await db
      .select({
        entryType: transactions.entryType,
        amount: transactions.amount,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, accountId),
          eq(transactions.currencyId, currencyId),
        ),
      );
    const netBalanceEffect = rows.reduce(
      (sum, row) =>
        sum + getStoredBalanceDelta(accountType, row.entryType, row.amount),
      0,
    );
    return -netBalanceEffect;
  } catch (error) {
    console.error(
      `getNetSpentForAccount: failed to compute net expense/income for account id=${accountId} currency id=${currencyId}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/accounts/:id/balance?currencyId=, keeping the same
// return type. Replaces the single-currency version from Stage 4b/7a —
// returns the balance for one specific (account, currency) pair: that
// currency's stored balance minus everything net-spent from the account
// in that same currency (Income adds, Expense subtracts — see
// getNetSpentForAccount).
export async function getAccountBalance(
  accountId: number,
  currencyId: number,
): Promise<number> {
  try {
    const [balanceRow] = await db
      .select()
      .from(accountBalances)
      .where(
        and(
          eq(accountBalances.accountId, accountId),
          eq(accountBalances.currencyId, currencyId),
        ),
      )
      .limit(1);
    const openingBalance = balanceRow?.balance ?? 0;
    const netSpent = await getNetSpentForAccount(accountId, currencyId);
    return openingBalance - netSpent;
  } catch (error) {
    console.error(
      `getAccountBalance: failed to compute balance for account id=${accountId} currency id=${currencyId}`,
      error,
    );
    throw error;
  }
}

const CASH_LIKE_ACCOUNT_TYPES = [
  'Bank',
  'Cash',
  'CryptoWallet',
  'Receivable',
] as const;

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/accounts/cash-in-hand-by-currency, keeping the same
// return shape. Sums Bank + Cash + CryptoWallet + Receivable account
// balances (Liability and CreditCard are debts, not cash), grouped by
// currency code. Currencies are never summed together — the result is a
// map of currency code to that currency's total only.
export async function getTotalCashInHandByCurrency(): Promise<
  Record<string, number>
> {
  const rows = await db
    .select({
      currencyCode: currencies.code,
      total: sql<number>`sum(${accountBalances.balance})`,
    })
    .from(accountBalances)
    .innerJoin(accounts, eq(accountBalances.accountId, accounts.id))
    .innerJoin(currencies, eq(accountBalances.currencyId, currencies.id))
    .where(inArray(accounts.type, CASH_LIKE_ACCOUNT_TYPES))
    .groupBy(currencies.code);

  const totals: Record<string, number> = {};
  for (const row of rows) {
    totals[row.currencyCode] = row.total;
  }
  return totals;
}

// If a backend is added later, replace this with a fetch() call to GET
// /api/accounts/credit-card-debt, keeping the same return type. Card
// balances are negative (owed to the bank); debt is shown as the positive
// amount you owe. Computed in the default currency only — multi-currency
// credit card debt isn't tracked separately yet.
export async function getTotalCreditCardDebt(): Promise<number> {
  const defaultCurrency = await getDefaultCurrency();
  if (!defaultCurrency) {
    return 0;
  }
  const cardAccounts = (await getAccounts()).filter(
    account => account.type === CREDIT_CARD_TYPE,
  );
  const balances = await Promise.all(
    cardAccounts.map(account =>
      getAccountBalance(account.id, defaultCurrency.id),
    ),
  );
  const totalBalance = balances.reduce((sum, balance) => sum + balance, 0);
  return -totalBalance;
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/accounts/:id/credit-card-debt?currencyId=, keeping the
// same return type. Single-card, single-currency version of
// getTotalCreditCardDebt — same "stored balance is the negative of what's
// owed" convention (see getStoredBalanceDelta above), just for one card
// instead of summed across every card in the default currency.
export async function getCreditCardDebt(
  accountId: number,
  currencyId: number,
): Promise<number> {
  try {
    const balance = await getAccountBalance(accountId, currencyId);
    return -balance;
  } catch (error) {
    console.error(
      `getCreditCardDebt: failed to compute debt for account id=${accountId} currency id=${currencyId}`,
      error,
    );
    throw error;
  }
}

// If a backend is added later, replace this with fetch(POST
// /api/accounts/:id/settle), keeping the same return type. Settling a
// credit card doesn't delete its transaction history — it raises the
// account's opening balance (in the default currency, same as the rest
// of the credit-card-debt flow) to match what's been net-spent so far,
// so the computed balance (and debt) resets to zero going forward.
export async function settleCreditCardAccount(
  accountId: number,
): Promise<Account> {
  try {
    const defaultCurrency = await getDefaultCurrency();
    const netSpent = defaultCurrency
      ? await getNetSpentForAccount(accountId, defaultCurrency.id)
      : 0;
    return await updateAccount(accountId, { openingBalance: netSpent });
  } catch (error) {
    console.error(
      `settleCreditCardAccount: failed to settle account id=${accountId}`,
      error,
    );
    throw error;
  }
}

// The reserved category from db/index.ts's seedReservedBankCategory
// should already exist by the time this runs, but this falls back to
// creating it rather than crash-failing a balance correction just
// because the one-time seed somehow hasn't happened yet.
async function getOrCreateBankCategoryId(): Promise<number> {
  const [existing] = await db
    .select()
    .from(categories)
    .where(eq(categories.name, RESERVED_BANK_CATEGORY_NAME))
    .limit(1);
  if (existing) {
    return existing.id;
  }
  const [created] = await db
    .insert(categories)
    .values({ name: RESERVED_BANK_CATEGORY_NAME, createdAt: Date.now() })
    .returning();
  return created.id;
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/accounts/:id/balances/:currencyId/correct), keeping the same
// input/return shape. Reconciles a (account, currency) balance to
// newBalance by posting a dated, categorized, described audit
// transaction for the difference — the same mechanism whether it's
// triggered by a month-start prompt or run anytime by hand.
//
// Why this doesn't just overwrite account_balances.balance to newBalance:
// getAccountBalance always recomputes as
// "stored baseline − every transaction ever recorded for this account
// and currency" (see getNetSpentForAccount) — it doesn't reset that
// history at a point in time. So the only way to make the *computed*
// balance come out to newBalance, without corrupting it the next time
// it's read, is to let the inserted audit transaction carry the entire
// delta and leave the stored baseline exactly as it was (the same trick
// settleCreditCardAccount uses to zero out a balance without a
// transaction). This function still explicitly touches account_balances
// so the row exists (relevant if this account/currency somehow has none
// yet) — for an existing row that's a same-value write, not a bug.
export async function updateAccountBalanceWithAudit(
  accountId: number,
  currencyId: number,
  newBalance: number,
  description: string,
): Promise<void> {
  try {
    if (!description.trim()) {
      throw new Error(
        'A description is required to correct a balance — that record is the whole point of the audit trail.',
      );
    }
    const current = await getAccountBalance(accountId, currencyId);
    const delta = newBalance - current;
    if (delta === 0) {
      return;
    }
    const bankCategoryId = await getOrCreateBankCategoryId();
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);
    const accountType = account?.type ?? 'Bank';
    // Same direction rule getNetSpentForAccount reads forward (entryType
    // -> stored delta), used backward here (desired delta -> entryType):
    // whichever entryType makes getStoredBalanceDelta produce this exact
    // signed delta is the one that belongs on the audit transaction.
    // Liability/Receivable accounts are excluded from that lookup — same
    // accounts getBalanceDelta refuses to handle — and fall back to the
    // plain sign check so a stray loan-type account (never expected here,
    // but not guarded against before this refactor either) keeps behaving
    // exactly as it did before, instead of suddenly throwing.
    const amount = Math.abs(delta);
    const entryType: 'Expense' | 'Income' = isLoanManagedAccountType(
      accountType,
    )
      ? delta > 0
        ? 'Income'
        : 'Expense'
      : getStoredBalanceDelta(accountType, 'Income', amount) === delta
        ? 'Income'
        : 'Expense';
    await db.insert(transactions).values({
      accountId,
      amount,
      categoryId: bankCategoryId,
      description: description.trim(),
      date: getCurrentDateString(),
      currencyId,
      entryType,
      createdAt: Date.now(),
    });
    const [existingBalanceRow] = await db
      .select()
      .from(accountBalances)
      .where(
        and(
          eq(accountBalances.accountId, accountId),
          eq(accountBalances.currencyId, currencyId),
        ),
      )
      .limit(1);
    await upsertAccountBalance(
      accountId,
      currencyId,
      existingBalanceRow?.balance ?? 0,
    );
  } catch (error) {
    console.error(
      `updateAccountBalanceWithAudit: failed to correct balance for account id=${accountId} currency id=${currencyId} to ${newBalance}`,
      error,
    );
    throw error;
  }
}

// If a backend is added later, replace this with a fetch() call to GET
// /api/categories, keeping the same return type.
export async function getCategories(): Promise<Category[]> {
  return db.select().from(categories);
}

// If a backend is added later, replace this with a fetch() call to POST
// /api/categories, keeping the same input/return shape.
export async function addCategory(name: string): Promise<Category> {
  const [category] = await db
    .insert(categories)
    .values({ name, createdAt: Date.now() })
    .returning();
  return category;
}

// If a backend is added later, replace this with fetch(PATCH
// /api/categories/:id), keeping the same input/return shape.
export async function updateCategory(
  id: number,
  name: string,
): Promise<Category> {
  const [updated] = await db
    .update(categories)
    .set({ name })
    .where(eq(categories.id, id))
    .returning();
  return updated;
}

// If a backend is added later, replace this with fetch(DELETE
// /api/categories/:id), keeping the same return shape.
export async function deleteCategory(id: number): Promise<Category[]> {
  const referencing = await db
    .select()
    .from(transactions)
    .where(eq(transactions.categoryId, id))
    .limit(1);
  if (referencing.length > 0) {
    throw new Error(
      'Cannot delete this category because it has existing transactions.',
    );
  }
  return db.delete(categories).where(eq(categories.id, id)).returning();
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/category-budgets?month=YYYY-MM&categoryId=, keeping the
// same return type.
export async function getCategoryBudget(
  month: string,
  categoryId: number,
): Promise<CategoryBudget | null> {
  const [row] = await db
    .select()
    .from(categoryBudgets)
    .where(
      and(
        eq(categoryBudgets.month, month),
        eq(categoryBudgets.categoryId, categoryId),
      ),
    )
    .limit(1);
  return row ?? null;
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/category-budgets?month=YYYY-MM, keeping the same
// return shape.
export async function getCategoryBudgetsForMonth(month: string) {
  return db
    .select({
      id: categoryBudgets.id,
      month: categoryBudgets.month,
      categoryId: categoryBudgets.categoryId,
      categoryName: categories.name,
      amount: categoryBudgets.amount,
    })
    .from(categoryBudgets)
    .innerJoin(categories, eq(categoryBudgets.categoryId, categories.id))
    .where(eq(categoryBudgets.month, month));
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// or PATCH /api/category-budgets), keeping the same input/return shape.
export async function upsertCategoryBudget(
  month: string,
  categoryId: number,
  amount: number,
): Promise<CategoryBudget> {
  const existing = await getCategoryBudget(month, categoryId);
  if (existing) {
    const [updated] = await db
      .update(categoryBudgets)
      .set({ amount })
      .where(eq(categoryBudgets.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(categoryBudgets)
    .values({ month, categoryId, amount })
    .returning();
  return created;
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/currencies, keeping the same return type.
export async function getCurrencies(): Promise<Currency[]> {
  return db.select().from(currencies);
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to POST /api/currencies, keeping the same input/return shape. New
// currencies are never created as the default.
export async function addCurrency(
  code: string,
  name: string,
): Promise<Currency> {
  const [currency] = await db
    .insert(currencies)
    .values({ code, name, isDefault: false, createdAt: Date.now() })
    .returning();
  return currency;
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/accounts/:id/balances, keeping the same return shape.
export async function getAccountBalances(accountId: number) {
  return db
    .select({
      id: accountBalances.id,
      accountId: accountBalances.accountId,
      currencyId: accountBalances.currencyId,
      currencyCode: currencies.code,
      currencyName: currencies.name,
      balance: accountBalances.balance,
    })
    .from(accountBalances)
    .innerJoin(currencies, eq(accountBalances.currencyId, currencies.id))
    .where(eq(accountBalances.accountId, accountId));
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/currencies/default, keeping the same return type.
export async function getDefaultCurrency(): Promise<Currency | null> {
  const [row] = await db
    .select()
    .from(currencies)
    .where(eq(currencies.isDefault, true))
    .limit(1);
  return row ?? null;
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/currencies/:id/set-default), keeping the same input/return shape.
// Runs inside a single DB transaction so there's never a moment with zero
// or two default currencies — if the second update failed after the
// first succeeded outside a transaction, the app would be left with no
// default at all.
export async function setDefaultCurrency(currencyId: number): Promise<void> {
  try {
    await db.transaction(async tx => {
      await tx
        .update(currencies)
        .set({ isDefault: false })
        .where(eq(currencies.isDefault, true));
      await tx
        .update(currencies)
        .set({ isDefault: true })
        .where(eq(currencies.id, currencyId));
    });
  } catch (error) {
    console.error(
      `setDefaultCurrency: failed to move the default flag to currency id=${currencyId}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(DELETE
// /api/currencies/:id), keeping the same return shape.
export async function deleteCurrency(currencyId: number): Promise<void> {
  try {
    const referencing = await db
      .select()
      .from(accountBalances)
      .where(eq(accountBalances.currencyId, currencyId))
      .limit(1);
    if (referencing.length > 0) {
      throw new Error(
        'This currency is used in an existing account. Cannot be deleted.',
      );
    }
    await db.delete(currencies).where(eq(currencies.id, currencyId));
  } catch (error) {
    console.error(
      `deleteCurrency: failed to delete currency id=${currencyId}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/accounts/:id/is-zero-balance, keeping the same return
// type. Despite the name, this returns a boolean, not a number — currency
// balances are never summed together, so "total balance" here means
// "every currency balance is exactly zero," which is all account closure
// actually needs to know.
export async function getAccountTotalBalance(
  accountId: number,
): Promise<boolean> {
  try {
    const balances = await db
      .select()
      .from(accountBalances)
      .where(eq(accountBalances.accountId, accountId));
    return balances.every(balance => balance.balance === 0);
  } catch (error) {
    console.error(
      `getAccountTotalBalance: failed to check zero-balance status for account id=${accountId}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/accounts/:id/close), keeping the same input/return shape. Throws
// rather than silently proceeding if any currency balance is still
// nonzero — closing is meant to be a hard gate, not a soft hide.
export async function closeAccount(accountId: number): Promise<Account> {
  try {
    const isZeroBalance = await getAccountTotalBalance(accountId);
    if (!isZeroBalance) {
      throw new Error(
        'This account still has a nonzero balance in at least one currency. Transfer the remainder elsewhere or log a transaction accounting for it before closing.',
      );
    }
    const [updated] = await db
      .update(accounts)
      .set({ active: false })
      .where(eq(accounts.id, accountId))
      .returning();
    return updated;
  } catch (error) {
    console.error(`closeAccount: failed to close account id=${accountId}`, error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/accounts/:id/reactivate), keeping the same input/return shape.
// Used by Stage 9a's reactivateLoanAccount, which reopens a closed
// Liability/Receivable account instead of creating a new one once its old
// loan is settled.
export async function reactivateAccount(accountId: number): Promise<Account> {
  try {
    const [updated] = await db
      .update(accounts)
      .set({ active: true })
      .where(eq(accounts.id, accountId))
      .returning();
    return updated;
  } catch (error) {
    console.error(
      `reactivateAccount: failed to reactivate account id=${accountId}`,
      error,
    );
    throw error;
  }
}

export type LoanAccountType = 'Liability' | 'Receivable';

export type LoanTerms = {
  dueDate?: string; // 'YYYY-MM-DD'
  interestRate?: number; // rate × 100, e.g. 5.5% is 550
  interestPeriod?: 'monthly' | 'annual';
};

export type NewLoanAccount = LoanTerms & {
  type: LoanAccountType;
  counterpartyName: string;
  principal: number;
  currencyId: number;
  counterpartAccountId: number;
};

export type ReactivatedLoanAccount = LoanTerms & {
  accountId: number;
  principal: number;
  currencyId: number;
  counterpartAccountId: number;
};

// The drizzle transaction handle, so the balance helper below can run
// inside the same transaction as the rest of a loan's writes.
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Borrowing puts money into the counterpart account; lending takes it out.
// Both directions follow from `type` alone, the same way a credit card's
// sign is inferred from its account type rather than stored separately.
function counterpartDeltaSign(type: LoanAccountType): 1 | -1 {
  return type === 'Liability' ? 1 : -1;
}

// Shifts a (account, currency) balance by `delta` by moving the stored
// baseline, not by posting a transaction. Deliberate: getAccountBalance
// computes "baseline − net transactions", so bumping the baseline moves
// the balance by exactly delta. Posting a transaction instead would work
// arithmetically but would make borrowed money show up as Income and lent
// money as an Expense on the Dashboard, which it isn't — a loan moves
// money between accounts, it doesn't earn or spend it.
async function shiftAccountBaselineWithin(
  tx: DbTransaction,
  accountId: number,
  currencyId: number,
  delta: number,
): Promise<void> {
  const [existing] = await tx
    .select()
    .from(accountBalances)
    .where(
      and(
        eq(accountBalances.accountId, accountId),
        eq(accountBalances.currencyId, currencyId),
      ),
    )
    .limit(1);
  if (existing) {
    await tx
      .update(accountBalances)
      .set({ balance: existing.balance + delta })
      .where(eq(accountBalances.id, existing.id));
  } else {
    await tx
      .insert(accountBalances)
      .values({ accountId, currencyId, balance: delta });
  }
}

// Transaction-scoped twin of upsertAccountBalance: sets the balance
// outright rather than shifting it by a delta.
async function upsertAccountBalanceWithin(
  tx: DbTransaction,
  accountId: number,
  currencyId: number,
  balance: number,
): Promise<void> {
  const [existing] = await tx
    .select()
    .from(accountBalances)
    .where(
      and(
        eq(accountBalances.accountId, accountId),
        eq(accountBalances.currencyId, currencyId),
      ),
    )
    .limit(1);
  if (existing) {
    await tx
      .update(accountBalances)
      .set({ balance })
      .where(eq(accountBalances.id, existing.id));
  } else {
    await tx.insert(accountBalances).values({ accountId, currencyId, balance });
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/loans?type=&active=false, keeping the same return
// shape. Powers the "reuse an existing account" step — inner-joined on
// loan_details because an account with no loan row has no counterparty
// name to reuse and nothing for reactivateLoanAccount to update.
export async function getInactiveLoanAccounts(type: LoanAccountType) {
  try {
    return await db
      .select({
        accountId: accounts.id,
        accountName: accounts.name,
        counterpartyName: loanDetails.counterpartyName,
        dateCreated: loanDetails.dateCreated,
      })
      .from(accounts)
      .innerJoin(loanDetails, eq(loanDetails.accountId, accounts.id))
      .where(and(eq(accounts.type, type), eq(accounts.active, false)));
  } catch (error) {
    console.error(
      `getInactiveLoanAccounts: failed to load inactive ${type} accounts`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/loans?type=&active=true, keeping the same return
// shape. currentBalance is the derived outstanding principal (see
// getAccountBalance); `principal` is the stored baseline it was opened at.
export async function getActiveLoanAccounts(type: LoanAccountType) {
  try {
    const rows = await db
      .select({
        accountId: accounts.id,
        accountName: accounts.name,
        counterpartyName: loanDetails.counterpartyName,
        dateCreated: loanDetails.dateCreated,
        lastAccrualAnchorDate: loanDetails.lastAccrualAnchorDate,
        dueDate: loanDetails.dueDate,
        interestRate: loanDetails.interestRate,
        interestPeriod: loanDetails.interestPeriod,
        currencyId: accountBalances.currencyId,
        currencyCode: currencies.code,
        principal: accountBalances.balance,
      })
      .from(accounts)
      .innerJoin(loanDetails, eq(loanDetails.accountId, accounts.id))
      .innerJoin(accountBalances, eq(accountBalances.accountId, accounts.id))
      .innerJoin(currencies, eq(accountBalances.currencyId, currencies.id))
      .where(and(eq(accounts.type, type), eq(accounts.active, true)));
    return await Promise.all(
      rows.map(async row => ({
        ...row,
        currentBalance: await getAccountBalance(row.accountId, row.currencyId),
      })),
    );
  } catch (error) {
    console.error(
      `getActiveLoanAccounts: failed to load active ${type} accounts`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/loans), keeping the same input/return shape. Creates the account,
// its loan_details row, its principal balance, and the counterpart
// account's offsetting adjustment as one atomic unit — a half-created
// loan would leave the counterpart account's balance silently wrong.
export async function createLoanAccount(
  params: NewLoanAccount,
): Promise<Account> {
  try {
    if (!params.counterpartyName.trim()) {
      throw new Error('A counterparty name is required to create a loan.');
    }
    const today = getCurrentDateString();
    return await db.transaction(async tx => {
      const [account] = await tx
        .insert(accounts)
        .values({
          name: params.counterpartyName.trim(),
          type: params.type,
          active: true,
          createdAt: Date.now(),
        })
        .returning();
      await tx.insert(loanDetails).values({
        accountId: account.id,
        counterpartyName: params.counterpartyName.trim(),
        dateCreated: today,
        lastAccrualAnchorDate: today,
        dueDate: params.dueDate,
        interestRate: params.interestRate,
        interestPeriod: params.interestPeriod,
      });
      await tx.insert(accountBalances).values({
        accountId: account.id,
        currencyId: params.currencyId,
        balance: params.principal,
      });
      await shiftAccountBaselineWithin(
        tx,
        params.counterpartAccountId,
        params.currencyId,
        counterpartDeltaSign(params.type) * params.principal,
      );
      return account;
    });
  } catch (error) {
    console.error(
      `createLoanAccount: failed to create ${params.type} loan for counterparty="${params.counterpartyName}"`,
      params,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/loans/:accountId/reactivate), keeping the same input/return shape.
// Reuses a closed loan account for a brand new loan with the same
// counterparty: dateCreated and lastAccrualAnchorDate both reset to today,
// because for accrual purposes this is a new loan, not a continuation of
// the settled one. Updates the existing loan_details row rather than
// inserting — the accountId unique constraint allows only one.
export async function reactivateLoanAccount(
  params: ReactivatedLoanAccount,
): Promise<Account> {
  try {
    const today = getCurrentDateString();
    const [existingAccount] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, params.accountId))
      .limit(1);
    if (!existingAccount) {
      throw new Error('That loan account no longer exists.');
    }
    // Terms and balances are committed before the account is flipped back
    // to active, so a failure part-way leaves it closed and untouched
    // rather than active with a half-applied new loan on it.
    await db.transaction(async tx => {
      const updated = await tx
        .update(loanDetails)
        .set({
          dateCreated: today,
          lastAccrualAnchorDate: today,
          dueDate: params.dueDate ?? null,
          interestRate: params.interestRate ?? null,
          interestPeriod: params.interestPeriod ?? null,
        })
        .where(eq(loanDetails.accountId, params.accountId))
        .returning();
      if (updated.length === 0) {
        throw new Error(
          'This account has no loan details to reuse. Create a new loan account instead.',
        );
      }
      // A settled loan's principal row is zeroed, not deleted, so this
      // sets the new principal outright instead of adding to the old one.
      await upsertAccountBalanceWithin(
        tx,
        params.accountId,
        params.currencyId,
        params.principal,
      );
      await shiftAccountBaselineWithin(
        tx,
        params.counterpartAccountId,
        params.currencyId,
        counterpartDeltaSign(existingAccount.type as LoanAccountType) *
          params.principal,
      );
    });
    return await reactivateAccount(params.accountId);
  } catch (error) {
    console.error(
      `reactivateLoanAccount: failed to reactivate loan account id=${params.accountId}`,
      params,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/loans/:id/total-owed?asOf=YYYY-MM-DD, keeping the same
// return type. Composes the stored principal + loan_details with the pure
// getTotalOwed math — this is what live "total owed" figures on screen
// (and settleLoan's payment split below) always call instead of trusting
// any stored number, since accrued interest is never written back into
// the database. Assumes one balance row per loan account (true for every
// loan created via createLoanAccount/reactivateLoanAccount, which only
// ever set up a single currency) — takes the first if that assumption is
// ever violated by hand-editing accounts outside this flow.
export async function getLoanTotalOwed(
  accountId: number,
  asOfDate: string,
): Promise<number> {
  try {
    const [details] = await db
      .select()
      .from(loanDetails)
      .where(eq(loanDetails.accountId, accountId))
      .limit(1);
    if (!details) {
      throw new Error('No loan details found for this account.');
    }
    const [balanceRow] = await db
      .select()
      .from(accountBalances)
      .where(eq(accountBalances.accountId, accountId))
      .limit(1);
    const principal = balanceRow?.balance ?? 0;
    return getTotalOwed(
      principal,
      details.interestRate,
      details.interestPeriod,
      details.lastAccrualAnchorDate,
      asOfDate,
    );
  } catch (error) {
    console.error(
      `getLoanTotalOwed: failed to compute total owed for account id=${accountId} as of ${asOfDate}`,
      error,
    );
    throw error;
  }
}

export type SettleLoanParams = {
  loanAccountId: number;
  counterpartAccountId: number;
  paymentAmount: number;
  currencyId: number;
  date: string; // 'YYYY-MM-DD'
};

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/loans/:id/settle), keeping the same input/return shape. A payment
// is applied against interest-inclusive total owed (getLoanTotalOwed),
// not principal alone — otherwise accrued-but-unpaid interest would just
// vanish on a full payoff, or never get collected on a partial one.
// Everything below runs in a single DB transaction: a partial failure
// here (say, the loan closes but the counterpart account never moves)
// would be a real accounting bug, not a cosmetic one, so there's no
// sequencing that leaves it half-applied.
export async function settleLoan(params: SettleLoanParams): Promise<void> {
  try {
    if (params.paymentAmount <= 0) {
      throw new Error('Enter a payment amount greater than zero.');
    }
    const [loanAccount] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, params.loanAccountId))
      .limit(1);
    if (!loanAccount) {
      throw new Error('That loan account no longer exists.');
    }
    const totalOwed = await getLoanTotalOwed(params.loanAccountId, params.date);
    const isFullPayoff = params.paymentAmount >= totalOwed;

    await db.transaction(async tx => {
      if (isFullPayoff) {
        // Set directly, computed by us moments ago — this bypasses
        // closeAccount()'s zero-balance gate (and its user-facing prompt)
        // on purpose, per the Stage 9b spec: there's nothing to ask about
        // when we've just zeroed the balance ourselves in this same
        // transaction.
        await upsertAccountBalanceWithin(
          tx,
          params.loanAccountId,
          params.currencyId,
          0,
        );
        await tx
          .update(accounts)
          .set({ active: false })
          .where(eq(accounts.id, params.loanAccountId));
      } else {
        // The new, smaller principal absorbs whatever interest wasn't
        // covered by this payment — accrual then restarts from `date`
        // against that new principal, not from the loan's original date,
        // which is exactly what resetting lastAccrualAnchorDate does.
        const newPrincipal = totalOwed - params.paymentAmount;
        await upsertAccountBalanceWithin(
          tx,
          params.loanAccountId,
          params.currencyId,
          newPrincipal,
        );
        await tx
          .update(loanDetails)
          .set({ lastAccrualAnchorDate: params.date })
          .where(eq(loanDetails.accountId, params.loanAccountId));
      }
      // Liability settlement pays down what you owe, so the counterpart
      // account drains; Receivable settlement is someone paying you back,
      // so it fills up — the exact opposite direction of
      // counterpartDeltaSign at loan creation, since money is now flowing
      // back across the same edge it originally crossed.
      await shiftAccountBaselineWithin(
        tx,
        params.counterpartAccountId,
        params.currencyId,
        -counterpartDeltaSign(loanAccount.type as LoanAccountType) *
          params.paymentAmount,
      );
      await tx.insert(loanPayments).values({
        loanAccountId: params.loanAccountId,
        counterpartAccountId: params.counterpartAccountId,
        amount: params.paymentAmount,
        currencyId: params.currencyId,
        date: params.date,
        createdAt: Date.now(),
      });
    });
  } catch (error) {
    console.error(
      `settleLoan: failed to settle a payment of ${params.paymentAmount} against loan account id=${params.loanAccountId}`,
      params,
      error,
    );
    throw error;
  }
}

export type PayOffCreditCardParams = {
  creditCardAccountId: number;
  payingAccountId: number;
  amount: number;
  currencyId: number;
  date: string; // 'YYYY-MM-DD'
};

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/credit-cards/:id/payoffs), keeping the same input/return shape.
// Moves `amount` off the card's debt and out of the paying account in one
// atomic step, using the same baseline-shifting trick as settleLoan
// (shiftAccountBaselineWithin) rather than posting an Expense/Income
// transaction — a payoff isn't new spending or income, it's money moving
// between two accounts the user already owns, and the purchases it's
// paying down were already expensed (and already counted toward a
// budget) when they happened. Recording this as a transaction too would
// double-count them. Never closes the card even if this pays it off
// exactly to zero — unlike a settled loan, a paid-off credit card's
// normal resting state is active, ready for the next purchase.
export async function payOffCreditCard(
  params: PayOffCreditCardParams,
): Promise<void> {
  try {
    if (params.amount <= 0) {
      throw new Error('Enter a payment amount greater than zero.');
    }
    const [creditCardAccount] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, params.creditCardAccountId))
      .limit(1);
    if (!creditCardAccount || creditCardAccount.type !== CREDIT_CARD_TYPE) {
      throw new Error('That account is not a credit card.');
    }
    const [payingAccount] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, params.payingAccountId))
      .limit(1);
    if (!payingAccount) {
      throw new Error('The paying account no longer exists.');
    }
    if (payingAccount.type === CREDIT_CARD_TYPE) {
      throw new Error(
        'You cannot pay off a credit card with another credit card.',
      );
    }
    const currentDebt = await getCreditCardDebt(
      params.creditCardAccountId,
      params.currencyId,
    );
    if (params.amount > currentDebt) {
      throw new Error(
        `That payment (${params.amount.toFixed(2)}) is more than the ` +
          `current debt (${currentDebt.toFixed(2)}). Overpaying a card ` +
          'into a credit balance is not supported.',
      );
    }
    await db.transaction(async tx => {
      // Paying down debt raises the card's stored balance toward zero
      // (that balance is the negative of what's owed — see
      // getStoredBalanceDelta above) and drains the paying account by the
      // same amount, the same two-sided move settleLoan makes for a loan
      // repayment.
      await shiftAccountBaselineWithin(
        tx,
        params.creditCardAccountId,
        params.currencyId,
        params.amount,
      );
      await shiftAccountBaselineWithin(
        tx,
        params.payingAccountId,
        params.currencyId,
        -params.amount,
      );
      await tx.insert(creditCardPayoffs).values({
        creditCardAccountId: params.creditCardAccountId,
        payingAccountId: params.payingAccountId,
        amount: params.amount,
        currencyId: params.currencyId,
        date: params.date,
        createdAt: Date.now(),
      });
    });
  } catch (error) {
    console.error(
      `payOffCreditCard: failed to pay off ${params.amount} against credit card account id=${params.creditCardAccountId}`,
      params,
      error,
    );
    throw error;
  }
}

const TRANSFERABLE_ACCOUNT_TYPES = ['Bank', 'Cash', 'CryptoWallet'];

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/accounts/transferable?currencyId=, keeping the same
// return shape. Only ordinary asset accounts can send or receive a
// transfer — CreditCard, Liability, and Receivable balances are all
// managed by their own dedicated flows (payOffCreditCard, settleLoan),
// never by moving money directly between accounts. When currencyId is
// given, the result is further filtered to accounts that already hold a
// balance row in that currency — a transfer can only move money within a
// currency both accounts already hold, never create a new holding.
export async function getTransferableAccounts(
  currencyId?: number,
): Promise<Account[]> {
  try {
    const rows = await db
      .select()
      .from(accounts)
      .where(
        and(
          inArray(accounts.type, TRANSFERABLE_ACCOUNT_TYPES),
          eq(accounts.active, true),
        ),
      );
    if (currencyId === undefined) {
      return rows;
    }
    const balanceRows = await db
      .select({ accountId: accountBalances.accountId })
      .from(accountBalances)
      .where(eq(accountBalances.currencyId, currencyId));
    const accountIdsWithCurrency = new Set(
      balanceRows.map(row => row.accountId),
    );
    return rows.filter(row => accountIdsWithCurrency.has(row.id));
  } catch (error) {
    console.error(
      `getTransferableAccounts: failed to load transferable accounts${
        currencyId !== undefined ? ` for currency id=${currencyId}` : ''
      }`,
      error,
    );
    throw error;
  }
}

// Shared by createTransfer and updateTransfer — every rule here is
// enforced in the query layer, not just the transfer form, so a future
// caller (another screen, a backend replacement) can't move money
// between disallowed account types or into a currency an account never
// actually held just by skipping the UI.
async function validateTransferAccounts(
  fromAccountId: number,
  toAccountId: number,
  currencyId: number,
): Promise<{ fromAccount: Account; toAccount: Account }> {
  if (fromAccountId === toAccountId) {
    throw new Error('Choose two different accounts to transfer between.');
  }
  const [fromAccount] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, fromAccountId))
    .limit(1);
  if (!fromAccount || !TRANSFERABLE_ACCOUNT_TYPES.includes(fromAccount.type)) {
    throw new Error('The source account is not a transferable account type.');
  }
  const [toAccount] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, toAccountId))
    .limit(1);
  if (!toAccount || !TRANSFERABLE_ACCOUNT_TYPES.includes(toAccount.type)) {
    throw new Error('The destination account is not a transferable account type.');
  }
  const [fromBalanceRow] = await db
    .select()
    .from(accountBalances)
    .where(
      and(
        eq(accountBalances.accountId, fromAccountId),
        eq(accountBalances.currencyId, currencyId),
      ),
    )
    .limit(1);
  if (!fromBalanceRow) {
    throw new Error('The source account has no balance in this currency.');
  }
  const [toBalanceRow] = await db
    .select()
    .from(accountBalances)
    .where(
      and(
        eq(accountBalances.accountId, toAccountId),
        eq(accountBalances.currencyId, currencyId),
      ),
    )
    .limit(1);
  if (!toBalanceRow) {
    throw new Error('The destination account has no balance in this currency.');
  }
  return { fromAccount, toAccount };
}

export type CreateTransferParams = {
  fromAccountId: number;
  toAccountId: number;
  amount: number;
  currencyId: number;
  date: string; // 'YYYY-MM-DD'
};

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/transfers), keeping the same input/return shape. Routes both
// balance changes through getBalanceDelta (Stage 10a) — the from-side as
// an 'Expense', the to-side as an 'Income' — even though direct
// arithmetic would give the same answer today (every account type this
// function allows is a plain asset account, never CreditCard), so
// there's still exactly one place that ever decides which direction
// money moves. Creates no `transactions` row: a transfer is money moving
// between two accounts the user already owns, not spending or income, so
// it must never carry a category or affect a budget.
export async function createTransfer(
  params: CreateTransferParams,
): Promise<void> {
  try {
    if (params.amount <= 0) {
      throw new Error('Enter a transfer amount greater than zero.');
    }
    const { fromAccount, toAccount } = await validateTransferAccounts(
      params.fromAccountId,
      params.toAccountId,
      params.currencyId,
    );
    await db.transaction(async tx => {
      const fromDelta = getBalanceDelta(
        fromAccount.type,
        'Expense',
        params.amount,
      );
      const toDelta = getBalanceDelta(toAccount.type, 'Income', params.amount);
      await shiftAccountBaselineWithin(
        tx,
        params.fromAccountId,
        params.currencyId,
        fromDelta,
      );
      await shiftAccountBaselineWithin(
        tx,
        params.toAccountId,
        params.currencyId,
        toDelta,
      );
      await tx.insert(transfers).values({
        fromAccountId: params.fromAccountId,
        toAccountId: params.toAccountId,
        amount: params.amount,
        currencyId: params.currencyId,
        date: params.date,
        createdAt: Date.now(),
      });
    });
  } catch (error) {
    console.error(
      `createTransfer: failed to transfer ${params.amount} from account id=${params.fromAccountId} to account id=${params.toAccountId}`,
      params,
      error,
    );
    throw error;
  }
}

export type UpdateTransferParams = {
  fromAccountId: number;
  toAccountId: number;
  amount: number;
  currencyId: number;
  date: string; // 'YYYY-MM-DD'
};

// NETWORK-READY: If a backend is added later, replace this with fetch(PATCH
// /api/transfers/:id), keeping the same input/return shape.
//
// Unlike updateTransaction (whose balance effect is entirely recomputed
// from scratch on every read via getAccountBalance, so editing that row
// alone is the whole update), a transfer's balance effect was applied
// directly to account_balances via shiftAccountBaselineWithin at
// creation time — nothing ever recomputes that later from the transfers
// table. So editing a transfer must explicitly undo the ORIGINAL
// amount/accounts/currency first — negating exactly what createTransfer
// applied — before applying the new values, or the old effect would
// still be sitting in two balances, silently doubled up alongside the
// new one. Both the reversal and the reapplication run inside the same
// DB transaction as the row update, so a failure partway through never
// leaves one side reversed and the other not.
export async function updateTransfer(
  id: number,
  params: UpdateTransferParams,
): Promise<void> {
  try {
    const [original] = await db
      .select()
      .from(transfers)
      .where(eq(transfers.id, id))
      .limit(1);
    if (!original) {
      throw new Error('That transfer no longer exists.');
    }
    if (params.amount <= 0) {
      throw new Error('Enter a transfer amount greater than zero.');
    }
    const { fromAccount, toAccount } = await validateTransferAccounts(
      params.fromAccountId,
      params.toAccountId,
      params.currencyId,
    );
    const [originalFromAccount] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, original.fromAccountId))
      .limit(1);
    const [originalToAccount] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, original.toAccountId))
      .limit(1);

    await db.transaction(async tx => {
      // Reverse the ORIGINAL transfer's effect first, using its own
      // stored account/currency/amount fields (these may differ from the
      // new params if the user changed accounts or currency, not just
      // the amount) — the negative of exactly what createTransfer/the
      // previous updateTransfer applied.
      const reverseFromDelta = -getBalanceDelta(
        originalFromAccount?.type ?? 'Bank',
        'Expense',
        original.amount,
      );
      const reverseToDelta = -getBalanceDelta(
        originalToAccount?.type ?? 'Bank',
        'Income',
        original.amount,
      );
      await shiftAccountBaselineWithin(
        tx,
        original.fromAccountId,
        original.currencyId,
        reverseFromDelta,
      );
      await shiftAccountBaselineWithin(
        tx,
        original.toAccountId,
        original.currencyId,
        reverseToDelta,
      );

      // Apply the new transfer's effect.
      const newFromDelta = getBalanceDelta(
        fromAccount.type,
        'Expense',
        params.amount,
      );
      const newToDelta = getBalanceDelta(
        toAccount.type,
        'Income',
        params.amount,
      );
      await shiftAccountBaselineWithin(
        tx,
        params.fromAccountId,
        params.currencyId,
        newFromDelta,
      );
      await shiftAccountBaselineWithin(
        tx,
        params.toAccountId,
        params.currencyId,
        newToDelta,
      );

      await tx
        .update(transfers)
        .set({
          fromAccountId: params.fromAccountId,
          toAccountId: params.toAccountId,
          amount: params.amount,
          currencyId: params.currencyId,
          date: params.date,
        })
        .where(eq(transfers.id, id));
    });
  } catch (error) {
    console.error(
      `updateTransfer: failed to update transfer id=${id}`,
      params,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(DELETE
// /api/transfers/:id), keeping the same return shape. Reverses both
// balance effects the same way updateTransfer's reversal step does —
// negating exactly what was originally applied — before removing the
// row, otherwise the money the transfer moved would stay moved even
// though the record of it moving is gone.
export async function deleteTransfer(id: number): Promise<void> {
  try {
    const [original] = await db
      .select()
      .from(transfers)
      .where(eq(transfers.id, id))
      .limit(1);
    if (!original) {
      throw new Error('That transfer no longer exists.');
    }
    const [fromAccount] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, original.fromAccountId))
      .limit(1);
    const [toAccount] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, original.toAccountId))
      .limit(1);
    await db.transaction(async tx => {
      const reverseFromDelta = -getBalanceDelta(
        fromAccount?.type ?? 'Bank',
        'Expense',
        original.amount,
      );
      const reverseToDelta = -getBalanceDelta(
        toAccount?.type ?? 'Bank',
        'Income',
        original.amount,
      );
      await shiftAccountBaselineWithin(
        tx,
        original.fromAccountId,
        original.currencyId,
        reverseFromDelta,
      );
      await shiftAccountBaselineWithin(
        tx,
        original.toAccountId,
        original.currencyId,
        reverseToDelta,
      );
      await tx.delete(transfers).where(eq(transfers.id, id));
    });
  } catch (error) {
    console.error(`deleteTransfer: failed to delete transfer id=${id}`, error);
    throw error;
  }
}

// Aliased twice because a loan_payments row references `accounts` from
// both sides (the loan account and the counterpart account) — a plain
// join can't disambiguate two references to the same table.
const loanAccountAlias = alias(accounts, 'loan_account_alias');
const counterpartAccountAlias = alias(accounts, 'counterpart_account_alias');

function selectLoanPaymentColumns() {
  return {
    id: loanPayments.id,
    loanAccountId: loanPayments.loanAccountId,
    loanAccountName: loanAccountAlias.name,
    loanAccountType: loanAccountAlias.type,
    counterpartAccountId: loanPayments.counterpartAccountId,
    counterpartAccountName: counterpartAccountAlias.name,
    amount: loanPayments.amount,
    currencyId: loanPayments.currencyId,
    currencyCode: currencies.code,
    date: loanPayments.date,
    createdAt: loanPayments.createdAt,
  };
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/loan-payments?month=YYYY-MM, keeping the same return
// shape. Mirrors getTransactionsByMonth's month-prefix filter so
// HistoryListScreen can fetch both with the same `month` value and merge
// them into one list.
export async function getLoanPaymentsByMonth(month: string) {
  try {
    return await db
      .select(selectLoanPaymentColumns())
      .from(loanPayments)
      .innerJoin(
        loanAccountAlias,
        eq(loanPayments.loanAccountId, loanAccountAlias.id),
      )
      .innerJoin(
        counterpartAccountAlias,
        eq(loanPayments.counterpartAccountId, counterpartAccountAlias.id),
      )
      .innerJoin(currencies, eq(loanPayments.currencyId, currencies.id))
      .where(like(loanPayments.date, `${month}%`));
  } catch (error) {
    console.error(
      `getLoanPaymentsByMonth: failed to load loan payments for month=${month}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/loan-payments?year=YYYY, keeping the same return shape.
export async function getLoanPaymentsByYear(year: string) {
  try {
    return await db
      .select(selectLoanPaymentColumns())
      .from(loanPayments)
      .innerJoin(
        loanAccountAlias,
        eq(loanPayments.loanAccountId, loanAccountAlias.id),
      )
      .innerJoin(
        counterpartAccountAlias,
        eq(loanPayments.counterpartAccountId, counterpartAccountAlias.id),
      )
      .innerJoin(currencies, eq(loanPayments.currencyId, currencies.id))
      .where(like(loanPayments.date, `${year}%`));
  } catch (error) {
    console.error(
      `getLoanPaymentsByYear: failed to load loan payments for year=${year}`,
      error,
    );
    throw error;
  }
}

// Aliased twice for the same reason as loanAccountAlias/counterpartAccountAlias
// above — a transfer row references `accounts` from both the sending and
// receiving side, so a plain join can't tell them apart.
const transferFromAccountAlias = alias(accounts, 'transfer_from_account_alias');
const transferToAccountAlias = alias(accounts, 'transfer_to_account_alias');

function selectTransferColumns() {
  return {
    id: transfers.id,
    fromAccountId: transfers.fromAccountId,
    fromAccountName: transferFromAccountAlias.name,
    toAccountId: transfers.toAccountId,
    toAccountName: transferToAccountAlias.name,
    amount: transfers.amount,
    currencyId: transfers.currencyId,
    currencyCode: currencies.code,
    date: transfers.date,
    createdAt: transfers.createdAt,
  };
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/transfers?month=YYYY-MM, keeping the same return
// shape. Mirrors getTransactionsByMonth/getLoanPaymentsByMonth's
// month-prefix filter so HistoryListScreen can fetch all three with the
// same `month` value and merge them into one list.
export async function getTransfers(month: string) {
  try {
    return await db
      .select(selectTransferColumns())
      .from(transfers)
      .innerJoin(
        transferFromAccountAlias,
        eq(transfers.fromAccountId, transferFromAccountAlias.id),
      )
      .innerJoin(
        transferToAccountAlias,
        eq(transfers.toAccountId, transferToAccountAlias.id),
      )
      .innerJoin(currencies, eq(transfers.currencyId, currencies.id))
      .where(like(transfers.date, `${month}%`));
  } catch (error) {
    console.error(
      `getTransfers: failed to load transfers for month=${month}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/transfers?year=YYYY, keeping the same return shape.
// Sibling of getTransfers the same way getLoanPaymentsByYear is a sibling
// of getLoanPaymentsByMonth — HistoryListScreen's "whole year" view needs
// this exact shape to merge transfers in alongside everything else.
export async function getTransfersByYear(year: string) {
  try {
    return await db
      .select(selectTransferColumns())
      .from(transfers)
      .innerJoin(
        transferFromAccountAlias,
        eq(transfers.fromAccountId, transferFromAccountAlias.id),
      )
      .innerJoin(
        transferToAccountAlias,
        eq(transfers.toAccountId, transferToAccountAlias.id),
      )
      .innerJoin(currencies, eq(transfers.currencyId, currencies.id))
      .where(like(transfers.date, `${year}%`));
  } catch (error) {
    console.error(
      `getTransfersByYear: failed to load transfers for year=${year}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/accounts/active-count?type=, keeping the same return
// type. Counts ACTIVE accounts only — canAddAccount()'s free-tier slot
// must not be occupied by a closed account, since closing one was the
// user deliberately giving that slot back.
export async function getActiveAccountCountByType(
  type: string,
): Promise<number> {
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(accounts)
      .where(and(eq(accounts.type, type), eq(accounts.active, true)));
    return row?.count ?? 0;
  } catch (error) {
    console.error(
      `getActiveAccountCountByType: failed to count active accounts of type=${type}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/categories/user-count, keeping the same return type.
// Excludes isSystemReserved categories (currently just "Bank") — the
// free-tier category limit only ever counts categories the user actually
// created.
export async function getUserCategoryCount(): Promise<number> {
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(categories)
      .where(eq(categories.isSystemReserved, false));
    return row?.count ?? 0;
  } catch (error) {
    console.error(
      'getUserCategoryCount: failed to count user (non-reserved) categories',
      error,
    );
    throw error;
  }
}

export type ThemeMode = 'light' | 'dark' | 'system';

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/settings, keeping the same return type. app_settings
// is seeded with exactly one row (id=1) by ensureAppSettingsRow() in
// db/index.ts, so this always resolves — the 'system' fallback only
// covers the theoretical case where that seeding hasn't run yet.
export async function getThemeMode(): Promise<ThemeMode> {
  try {
    const [row] = await db.select().from(appSettings).limit(1);
    return row?.themeMode ?? 'system';
  } catch (error) {
    console.error('getThemeMode: failed to read theme mode', error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to PATCH /api/settings, keeping the same input shape. Updates the
// singleton row in place; falls back to inserting it if seeding somehow
// hasn't run yet, so this never silently no-ops.
export async function setThemeMode(mode: ThemeMode): Promise<void> {
  try {
    const [row] = await db.select().from(appSettings).limit(1);
    if (row) {
      await db
        .update(appSettings)
        .set({ themeMode: mode })
        .where(eq(appSettings.id, row.id));
    } else {
      await db.insert(appSettings).values({ themeMode: mode });
    }
  } catch (error) {
    console.error('setThemeMode: failed to save theme mode', mode, error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/settings, keeping the same return type. Mirrors
// getThemeMode exactly, just for the other independent preference
// (which entry of theme/palettes.ts's PALETTES is active) — kept as its
// own column/function rather than folded into ThemeMode since "light vs
// dark" and "which palette" are separate choices.
export async function getPaletteId(): Promise<string> {
  try {
    const [row] = await db.select().from(appSettings).limit(1);
    return row?.paletteId ?? DEFAULT_PALETTE_ID;
  } catch (error) {
    console.error('getPaletteId: failed to read palette id', error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to PATCH /api/settings, keeping the same input shape. Mirrors
// setThemeMode exactly.
export async function setPaletteId(paletteId: string): Promise<void> {
  try {
    const [row] = await db.select().from(appSettings).limit(1);
    if (row) {
      await db
        .update(appSettings)
        .set({ paletteId })
        .where(eq(appSettings.id, row.id));
    } else {
      await db.insert(appSettings).values({ paletteId });
    }
  } catch (error) {
    console.error('setPaletteId: failed to save palette id', paletteId, error);
    throw error;
  }
}

// Mode A (principal + rate) and Mode B (a known flat monthly amount)
// share every field except how the schedule is derived — a tagged union
// keeps the two call shapes from being confused with each other (e.g.
// passing a rate that gets silently ignored in Mode B).
export type NewInstallmentPlanParams = {
  name: string;
  numberOfMonths: number;
  categoryId: number;
  currencyId: number;
  startDate: string; // 'YYYY-MM-DD'
  // 1-31, optional — no due day set means this plan never surfaces as a
  // Dashboard reminder (see getInstallmentReminders). Same
  // clamp-to-shorter-month convention as recurring_rules.dayOfMonth.
  dueDayOfMonth?: number | null;
} & (
  | { mode: 'principal'; principalAmount: number; interestRate: number }
  | { mode: 'monthly'; monthlyAmount: number }
);

function scheduleForInstallmentPlan(params: NewInstallmentPlanParams) {
  return params.mode === 'principal'
    ? calculateFromPrincipal(
        params.principalAmount,
        params.interestRate,
        params.numberOfMonths,
      )
    : calculateFromMonthly(params.monthlyAmount, params.numberOfMonths);
}

// Real check as of Stage 12b — installment_payments now exists, so
// updateInstallmentPlan and deleteInstallmentPlan's "reject if payments
// exist" guard actually enforces something. Both call sites were already
// written against this exact function in Stage 12a, so neither needed to
// change; only this implementation did.
async function installmentPlanHasPayments(planId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: installmentPayments.id })
    .from(installmentPayments)
    .where(eq(installmentPayments.installmentPlanId, planId))
    .limit(1);
  return row != null;
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/installment-plans), keeping the same input/return shape. Computes
// the schedule once via utils/installmentMath.ts and stores every
// resulting number — see installment_plans' schema comment for why that
// beats recomputing on every read. Creates NO transaction and changes NO
// account balance: Stage 12a is schedule-only, nothing has been paid yet.
export async function createInstallmentPlan(
  params: NewInstallmentPlanParams,
): Promise<InstallmentPlan> {
  try {
    if (!params.name.trim()) {
      throw new Error('A name is required for the installment plan.');
    }
    if (!Number.isInteger(params.numberOfMonths) || params.numberOfMonths <= 0) {
      throw new Error('Number of months must be a whole number greater than zero.');
    }
    if (
      params.dueDayOfMonth != null &&
      (!Number.isInteger(params.dueDayOfMonth) ||
        params.dueDayOfMonth < 1 ||
        params.dueDayOfMonth > 31)
    ) {
      throw new Error('Due date must be a day between 1 and 31.');
    }
    const schedule = scheduleForInstallmentPlan(params);
    const [plan] = await db
      .insert(installmentPlans)
      .values({
        name: params.name.trim(),
        principalAmount:
          params.mode === 'principal' ? params.principalAmount : null,
        interestRate: params.mode === 'principal' ? params.interestRate : null,
        numberOfMonths: params.numberOfMonths,
        monthlyAmount: schedule.monthlyAmount,
        finalInstallmentAmount: schedule.finalInstallmentAmount,
        totalRepayable: schedule.totalRepayable,
        categoryId: params.categoryId,
        currencyId: params.currencyId,
        startDate: params.startDate,
        dueDayOfMonth: params.dueDayOfMonth ?? null,
        createdAt: Date.now(),
      })
      .returning();
    return plan;
  } catch (error) {
    console.error(
      'createInstallmentPlan: failed to create installment plan',
      params,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/installment-plans, keeping the same return shape.
// "Paid 0 of N" (Stage 12a always shows 0 — payment tracking is Stage
// 12b) is computed by the screen from numberOfMonths, not stored here.
export async function getInstallmentPlans() {
  try {
    return await db
      .select({
        id: installmentPlans.id,
        name: installmentPlans.name,
        principalAmount: installmentPlans.principalAmount,
        interestRate: installmentPlans.interestRate,
        numberOfMonths: installmentPlans.numberOfMonths,
        monthlyAmount: installmentPlans.monthlyAmount,
        finalInstallmentAmount: installmentPlans.finalInstallmentAmount,
        totalRepayable: installmentPlans.totalRepayable,
        categoryId: installmentPlans.categoryId,
        categoryName: categories.name,
        currencyId: installmentPlans.currencyId,
        currencyCode: currencies.code,
        startDate: installmentPlans.startDate,
        dueDayOfMonth: installmentPlans.dueDayOfMonth,
        createdAt: installmentPlans.createdAt,
      })
      .from(installmentPlans)
      .innerJoin(categories, eq(installmentPlans.categoryId, categories.id))
      .innerJoin(currencies, eq(installmentPlans.currencyId, currencies.id))
      .orderBy(desc(installmentPlans.createdAt));
  } catch (error) {
    console.error(
      'getInstallmentPlans: failed to load installment plans',
      error,
    );
    throw error;
  }
}

export type InstallmentReminderRow = {
  id: number;
  name: string;
  currencyCode: string;
  nextInstallmentNumber: number;
  numberOfMonths: number;
  nextAmountDue: number;
  nextDueDate: string; // 'YYYY-MM-DD'
};

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/installment-plans/reminders, keeping the same return
// shape. Dashboard-facing — only plans with a dueDayOfMonth set AND not
// yet fully paid ever show up here; the "within N days" cutoff itself is
// left to the caller (DashboardScreen), same as upcomingLoans' own
// daysUntil filtering, so both reminder types share one filtering
// convention instead of each baking its own window into the query layer.
//
// Fetches every installment_payments row in one query and counts paid
// installments per plan in JS rather than a SQL GROUP BY — same
// "plan/payment counts are small in a personal tracker" reasoning
// InstallmentPlansScreen's own load() already leans on.
export async function getInstallmentReminders(): Promise<
  InstallmentReminderRow[]
> {
  try {
    const plans = await db
      .select({
        id: installmentPlans.id,
        name: installmentPlans.name,
        numberOfMonths: installmentPlans.numberOfMonths,
        monthlyAmount: installmentPlans.monthlyAmount,
        finalInstallmentAmount: installmentPlans.finalInstallmentAmount,
        dueDayOfMonth: installmentPlans.dueDayOfMonth,
        currencyCode: currencies.code,
      })
      .from(installmentPlans)
      .innerJoin(currencies, eq(installmentPlans.currencyId, currencies.id));

    const plansWithDueDate = plans.filter(
      (plan): plan is typeof plan & { dueDayOfMonth: number } =>
        plan.dueDayOfMonth != null,
    );
    if (plansWithDueDate.length === 0) {
      return [];
    }

    const allPayments = await db
      .select({ installmentPlanId: installmentPayments.installmentPlanId })
      .from(installmentPayments);
    const paidCountByPlan = new Map<number, number>();
    for (const payment of allPayments) {
      paidCountByPlan.set(
        payment.installmentPlanId,
        (paidCountByPlan.get(payment.installmentPlanId) ?? 0) + 1,
      );
    }

    const today = getCurrentDateString();
    const reminders: InstallmentReminderRow[] = [];
    for (const plan of plansWithDueDate) {
      const paidCount = paidCountByPlan.get(plan.id) ?? 0;
      if (paidCount >= plan.numberOfMonths) {
        continue;
      }
      const nextInstallmentNumber = paidCount + 1;
      const nextAmountDue =
        nextInstallmentNumber === plan.numberOfMonths
          ? plan.finalInstallmentAmount
          : plan.monthlyAmount;
      reminders.push({
        id: plan.id,
        name: plan.name,
        currencyCode: plan.currencyCode,
        nextInstallmentNumber,
        numberOfMonths: plan.numberOfMonths,
        nextAmountDue,
        nextDueDate: getNextOccurrenceDate(plan.dueDayOfMonth, today),
      });
    }
    return reminders;
  } catch (error) {
    console.error(
      'getInstallmentReminders: failed to load installment reminders',
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(PATCH
// /api/installment-plans/:id), keeping the same input/return shape.
// Recomputes the whole schedule from the new inputs — exactly like
// createInstallmentPlan — but only once installmentPlanHasPayments
// confirms nothing has been paid against this plan yet. Editing a
// schedule that already has recorded payments against the OLD schedule
// would silently corrupt whatever "remaining balance" Stage 12b computes
// from it, so this rejects instead of guessing how to reconcile the two.
export async function updateInstallmentPlan(
  id: number,
  params: NewInstallmentPlanParams,
): Promise<void> {
  try {
    const hasPayments = await installmentPlanHasPayments(id);
    if (hasPayments) {
      throw new Error(
        'This plan already has recorded payments — delete and recreate it instead of editing the schedule.',
      );
    }
    if (!params.name.trim()) {
      throw new Error('A name is required for the installment plan.');
    }
    if (!Number.isInteger(params.numberOfMonths) || params.numberOfMonths <= 0) {
      throw new Error('Number of months must be a whole number greater than zero.');
    }
    if (
      params.dueDayOfMonth != null &&
      (!Number.isInteger(params.dueDayOfMonth) ||
        params.dueDayOfMonth < 1 ||
        params.dueDayOfMonth > 31)
    ) {
      throw new Error('Due date must be a day between 1 and 31.');
    }
    const schedule = scheduleForInstallmentPlan(params);
    await db
      .update(installmentPlans)
      .set({
        name: params.name.trim(),
        principalAmount:
          params.mode === 'principal' ? params.principalAmount : null,
        interestRate: params.mode === 'principal' ? params.interestRate : null,
        numberOfMonths: params.numberOfMonths,
        monthlyAmount: schedule.monthlyAmount,
        finalInstallmentAmount: schedule.finalInstallmentAmount,
        totalRepayable: schedule.totalRepayable,
        categoryId: params.categoryId,
        currencyId: params.currencyId,
        startDate: params.startDate,
        dueDayOfMonth: params.dueDayOfMonth ?? null,
      })
      .where(eq(installmentPlans.id, id));
  } catch (error) {
    console.error(
      `updateInstallmentPlan: failed to update installment plan id=${id}`,
      params,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(DELETE
// /api/installment-plans/:id), keeping the same return shape. Rejects if
// any installment has ever been paid against this plan — deleting it
// would orphan those installment_payments rows (and the real
// transactions they point to) with no plan left to explain what they
// were for.
export async function deleteInstallmentPlan(id: number): Promise<void> {
  try {
    const hasPayments = await installmentPlanHasPayments(id);
    if (hasPayments) {
      throw new Error(
        'This plan has recorded payments and cannot be deleted.',
      );
    }
    await db.delete(installmentPlans).where(eq(installmentPlans.id, id));
  } catch (error) {
    console.error(
      `deleteInstallmentPlan: failed to delete installment plan id=${id}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/installment-plans/:id/payments, keeping the same
// return shape. amount comes from the linked transaction rather than
// being stored redundantly on installment_payments — that transaction
// row is the single source of truth for what was actually paid.
export async function getInstallmentPayments(planId: number) {
  try {
    return await db
      .select({
        id: installmentPayments.id,
        installmentPlanId: installmentPayments.installmentPlanId,
        installmentNumber: installmentPayments.installmentNumber,
        accountId: installmentPayments.accountId,
        accountName: accounts.name,
        transactionId: installmentPayments.transactionId,
        amount: transactions.amount,
        paidDate: installmentPayments.paidDate,
        createdAt: installmentPayments.createdAt,
      })
      .from(installmentPayments)
      .innerJoin(accounts, eq(installmentPayments.accountId, accounts.id))
      .innerJoin(
        transactions,
        eq(installmentPayments.transactionId, transactions.id),
      )
      .where(eq(installmentPayments.installmentPlanId, planId))
      .orderBy(installmentPayments.installmentNumber);
  } catch (error) {
    console.error(
      `getInstallmentPayments: failed to load payments for plan id=${planId}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/installment-plans/:id/next-unpaid, keeping the same
// return type. Walks 1..numberOfMonths looking for the first number with
// no installment_payments row rather than just counting paid rows and
// adding one — that would give the wrong answer the moment undo ever
// creates a gap-free-but-not-just-a-suffix history (it can't today, since
// unpayInstallment only ever removes the latest one, but this stays
// correct even if that rule ever loosens).
export async function getNextUnpaidInstallmentNumber(
  planId: number,
): Promise<number | null> {
  try {
    const [plan] = await db
      .select()
      .from(installmentPlans)
      .where(eq(installmentPlans.id, planId))
      .limit(1);
    if (!plan) {
      throw new Error('That installment plan no longer exists.');
    }
    const paidRows = await db
      .select({ installmentNumber: installmentPayments.installmentNumber })
      .from(installmentPayments)
      .where(eq(installmentPayments.installmentPlanId, planId));
    const paidNumbers = new Set(paidRows.map(row => row.installmentNumber));
    for (let n = 1; n <= plan.numberOfMonths; n++) {
      if (!paidNumbers.has(n)) {
        return n;
      }
    }
    return null;
  } catch (error) {
    console.error(
      `getNextUnpaidInstallmentNumber: failed to compute next unpaid installment for plan id=${planId}`,
      error,
    );
    throw error;
  }
}

export type PayInstallmentParams = {
  planId: number;
  accountId: number;
  date: string; // 'YYYY-MM-DD'
};

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/installment-plans/:id/payments), keeping the same input/return
// shape.
//
// Unlike creditCardPayoffs/transfers/loanPayments, an installment payment
// IS genuine spending — it needs to show up in History and count toward
// its category's budget the same as any ordinary Expense — so this
// inserts a REAL `transactions` row (entryType 'Expense') rather than
// shifting a stored baseline directly the way those other three do.
// Because every account balance is always derived from the transactions
// table (see getAccountBalance / getNetSpentForAccount), that single
// insert IS the entire balance effect: there's no second write to
// account_balances to keep in sync. That's also why paying with a
// CreditCard account correctly increases its debt with no
// installment-specific code for it at all — it goes through the exact
// same getBalanceDelta-based derivation Stage 10a already built for
// every ordinary Expense transaction.
export async function payInstallment(
  params: PayInstallmentParams,
): Promise<void> {
  try {
    const [plan] = await db
      .select()
      .from(installmentPlans)
      .where(eq(installmentPlans.id, params.planId))
      .limit(1);
    if (!plan) {
      throw new Error('That installment plan no longer exists.');
    }
    const nextInstallmentNumber = await getNextUnpaidInstallmentNumber(
      params.planId,
    );
    if (nextInstallmentNumber === null) {
      throw new Error('This plan is already fully paid.');
    }
    // Every installment is the plan's flat monthlyAmount EXCEPT the very
    // last one, which absorbs the rounding remainder — see
    // utils/installmentMath.ts's invariant comment for why that split
    // exists at all.
    const amount =
      nextInstallmentNumber === plan.numberOfMonths
        ? plan.finalInstallmentAmount
        : plan.monthlyAmount;
    const description = `${plan.name} — ${nextInstallmentNumber} of ${plan.numberOfMonths}`;

    await db.transaction(async tx => {
      const [transaction] = await tx
        .insert(transactions)
        .values({
          accountId: params.accountId,
          amount,
          categoryId: plan.categoryId,
          description,
          date: params.date,
          currencyId: plan.currencyId,
          entryType: 'Expense',
          createdAt: Date.now(),
        })
        .returning();
      await tx.insert(installmentPayments).values({
        installmentPlanId: params.planId,
        installmentNumber: nextInstallmentNumber,
        accountId: params.accountId,
        transactionId: transaction.id,
        paidDate: params.date,
        createdAt: Date.now(),
      });
    });
  } catch (error) {
    console.error(
      `payInstallment: failed to pay next installment for plan id=${params.planId}`,
      params,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(DELETE
// /api/installment-payments/:id), keeping the same input/return shape.
//
// Only the MOST RECENT payment for a plan may be undone. Installment
// numbers are meant to stay a gapless 1..N prefix of "paid so far" (the
// plan_installment_unique index only stops the same number being paid
// twice, not a gap from opening up) — deleting an EARLIER payment out of
// order would leave one, e.g. installment 3 gone while 4 and 5 are still
// paid, and there's no sane answer for what
// getNextUnpaidInstallmentNumber should do with that: is 3 "next due"
// again, ahead of the already-paid 4 and 5? Restricting undo to the
// latest payment keeps the paid set always a clean prefix, so that
// question never comes up.
export async function unpayInstallment(paymentId: number): Promise<void> {
  try {
    const [payment] = await db
      .select()
      .from(installmentPayments)
      .where(eq(installmentPayments.id, paymentId))
      .limit(1);
    if (!payment) {
      throw new Error('That payment no longer exists.');
    }
    const [latest] = await db
      .select()
      .from(installmentPayments)
      .where(
        eq(installmentPayments.installmentPlanId, payment.installmentPlanId),
      )
      .orderBy(desc(installmentPayments.installmentNumber))
      .limit(1);
    if (!latest || latest.id !== payment.id) {
      throw new Error(
        'Only the most recent payment for this plan can be undone. Undo later payments first.',
      );
    }
    await db.transaction(async tx => {
      // Deleting the transaction row IS the balance reversal — balances
      // are always derived from the transactions table, so removing this
      // row takes its effect out of that computation on the very next
      // read, exactly the way deleteTransaction works for any other
      // transaction.
      await tx
        .delete(transactions)
        .where(eq(transactions.id, payment.transactionId));
      await tx
        .delete(installmentPayments)
        .where(eq(installmentPayments.id, paymentId));
    });
  } catch (error) {
    console.error(
      `unpayInstallment: failed to undo payment id=${paymentId}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/installment-plans/remaining-balance?currencyId=,
// keeping the same return type. Used by net worth (utils/netWorth.ts).
// Sums, across every plan in this currency, totalRepayable minus what's
// actually been paid so far — the paid amount is read from the linked
// transactions' amounts rather than trusting
// installmentNumber * monthlyAmount, since the final installment is a
// different amount and this needs to stay correct however many
// installments have been paid or undone.
export async function getRemainingInstallmentBalance(
  currencyId: number,
): Promise<number> {
  try {
    const plans = await db
      .select()
      .from(installmentPlans)
      .where(eq(installmentPlans.currencyId, currencyId));
    let remaining = 0;
    for (const plan of plans) {
      const [paidRow] = await db
        .select({
          total: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
        })
        .from(installmentPayments)
        .innerJoin(
          transactions,
          eq(installmentPayments.transactionId, transactions.id),
        )
        .where(eq(installmentPayments.installmentPlanId, plan.id));
      const paid = paidRow?.total ?? 0;
      remaining += plan.totalRepayable - paid;
    }
    return remaining;
  } catch (error) {
    console.error(
      `getRemainingInstallmentBalance: failed to compute remaining installment balance for currency id=${currencyId}`,
      error,
    );
    throw error;
  }
}

// Stage 13a: recurring rules are a schedule/template only — this stage
// never generates an occurrence, never prompts, and never creates a
// transaction or touches a balance. That's Stage 13b. categoryId is
// omitted entirely for an Income rule (mirrors NewIncome above) rather
// than accepted-and-ignored, so a caller can't accidentally attach a
// category to an Income rule by forgetting to leave the field out.
export type NewRecurringRuleParams = {
  name: string;
  ruleType: 'Income' | 'Expense';
  amount: number;
  dayOfMonth: number;
  categoryId?: number; // required for Expense, must be omitted for Income
  accountId: number;
  currencyId: number;
};

// Shared by create/update — 29/30/31 are allowed even though not every
// month has that many days; Stage 13b's occurrence generation is what
// clamps to a shorter month's last day, not this validation. The
// RecurringRulesScreen form tells the user this up front so it isn't a
// surprise the first time a short month comes around.
function validateRecurringRuleParams(params: NewRecurringRuleParams): void {
  if (!params.name.trim()) {
    throw new Error('A name is required for the recurring rule.');
  }
  if (
    !Number.isInteger(params.dayOfMonth) ||
    params.dayOfMonth < 1 ||
    params.dayOfMonth > 31
  ) {
    throw new Error('Day of month must be a whole number between 1 and 31.');
  }
  if (params.ruleType === 'Expense' && params.categoryId == null) {
    throw new Error('Select a category for an Expense rule.');
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/recurring-rules?active=, keeping the same return
// shape. Fetches every rule (the table is small in a personal tracker)
// and filters in JS when activeOnly is set, rather than pushing the
// filter into SQL — keeps this one query shape usable for both "just the
// active ones" (the default screen view) and "everything, including
// deactivated" (nothing currently needs that second case, but the flag
// is here so the screen doesn't need a second query function for it).
export async function getRecurringRules(activeOnly: boolean) {
  try {
    const rows = await db
      .select({
        id: recurringRules.id,
        name: recurringRules.name,
        ruleType: recurringRules.ruleType,
        amount: recurringRules.amount,
        dayOfMonth: recurringRules.dayOfMonth,
        categoryId: recurringRules.categoryId,
        categoryName: categories.name,
        accountId: recurringRules.accountId,
        accountName: accounts.name,
        currencyId: recurringRules.currencyId,
        currencyCode: currencies.code,
        active: recurringRules.active,
        createdAt: recurringRules.createdAt,
      })
      .from(recurringRules)
      .innerJoin(accounts, eq(recurringRules.accountId, accounts.id))
      .innerJoin(currencies, eq(recurringRules.currencyId, currencies.id))
      .leftJoin(categories, eq(recurringRules.categoryId, categories.id))
      .orderBy(desc(recurringRules.createdAt));
    return activeOnly ? rows.filter(row => row.active) : rows;
  } catch (error) {
    console.error('getRecurringRules: failed to load recurring rules', error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/recurring-rules), keeping the same input/return shape. Inserts
// exactly one row — no transaction, no balance change, no budget usage.
// A rule is a template Stage 13b will read from, not a payment.
export async function createRecurringRule(
  params: NewRecurringRuleParams,
): Promise<RecurringRule> {
  try {
    validateRecurringRuleParams(params);
    const [rule] = await db
      .insert(recurringRules)
      .values({
        name: params.name.trim(),
        ruleType: params.ruleType,
        amount: params.amount,
        dayOfMonth: params.dayOfMonth,
        categoryId: params.ruleType === 'Expense' ? params.categoryId : null,
        accountId: params.accountId,
        currencyId: params.currencyId,
        active: true,
        createdAt: Date.now(),
      })
      .returning();
    return rule;
  } catch (error) {
    console.error(
      'createRecurringRule: failed to create recurring rule',
      params,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(PATCH
// /api/recurring-rules/:id), keeping the same input/return shape.
//
// This only ever affects FUTURE occurrences. Stage 13b's occurrence
// table will record each confirmed occurrence's own amount/category/etc.
// at the moment it was confirmed, independent of this row — so editing,
// say, a rule's amount from 1,500 to 2,000 next month must never rewrite
// what a past month's occurrence was actually confirmed at. No
// occurrence table exists yet (nothing is generated in this stage), so
// there's nothing to leave alone yet — this comment exists so that
// invariant is on record before the mechanism that has to honor it does.
export async function updateRecurringRule(
  id: number,
  params: NewRecurringRuleParams,
): Promise<void> {
  try {
    validateRecurringRuleParams(params);
    await db
      .update(recurringRules)
      .set({
        name: params.name.trim(),
        ruleType: params.ruleType,
        amount: params.amount,
        dayOfMonth: params.dayOfMonth,
        categoryId: params.ruleType === 'Expense' ? params.categoryId : null,
        accountId: params.accountId,
        currencyId: params.currencyId,
      })
      .where(eq(recurringRules.id, id));
  } catch (error) {
    console.error(
      `updateRecurringRule: failed to update recurring rule id=${id}`,
      params,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(PATCH
// /api/recurring-rules/:id/active), keeping the same input shape.
// Deactivating is the normal way to stop a rule — the row (and, once
// Stage 13b exists, its occurrence history) stays intact, unlike delete.
export async function setRecurringRuleActive(
  id: number,
  active: boolean,
): Promise<void> {
  try {
    await db
      .update(recurringRules)
      .set({ active })
      .where(eq(recurringRules.id, id));
  } catch (error) {
    console.error(
      `setRecurringRuleActive: failed to set active=${active} for recurring rule id=${id}`,
      error,
    );
    throw error;
  }
}

// Stage 13b: a CONFIRMED occurrence always has a real transaction behind
// it (see confirmOccurrence) — deleting the rule out from under it would
// leave that transaction with no rule left to explain what it was for.
// Pending/skipped occurrences carry no transaction at all, so they're
// safe to cascade-delete along with the rule.
async function recurringRuleHasConfirmedOccurrences(
  ruleId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ id: recurringOccurrences.id })
    .from(recurringOccurrences)
    .where(
      and(
        eq(recurringOccurrences.recurringRuleId, ruleId),
        eq(recurringOccurrences.status, 'confirmed'),
      ),
    )
    .limit(1);
  return row != null;
}

// NETWORK-READY: If a backend is added later, replace this with fetch(DELETE
// /api/recurring-rules/:id), keeping the same input shape. Prefer
// setRecurringRuleActive(id, false) for a rule that's simply done being
// used — this is for rules created by mistake. Rejects when any
// occurrence has been CONFIRMED (see
// recurringRuleHasConfirmedOccurrences); pending/skipped occurrences are
// deleted along with the rule since neither ever created a transaction.
export async function deleteRecurringRule(id: number): Promise<void> {
  try {
    const hasConfirmed = await recurringRuleHasConfirmedOccurrences(id);
    if (hasConfirmed) {
      throw new Error(
        'This rule has confirmed occurrences and cannot be deleted — deactivate it instead so its history is kept.',
      );
    }
    await db.transaction(async tx => {
      await tx
        .delete(recurringOccurrences)
        .where(eq(recurringOccurrences.recurringRuleId, id));
      await tx.delete(recurringRules).where(eq(recurringRules.id, id));
    });
  } catch (error) {
    console.error(
      `deleteRecurringRule: failed to delete recurring rule id=${id}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/recurring-occurrences/generate), keeping the same return shape
// (void — callers just re-fetch getPendingOccurrences afterward).
//
// IDEMPOTENCY: this is designed to be called on every app open and every
// Dashboard focus without any "did I already run this today" tracking.
// Two things make that safe: (1) it only ever walks forward from each
// rule's latest existing occurrence (or its createdAt if it has none) up
// to and including today, so a second call in the same day has nothing
// new to generate; (2) the recurring_occurrences unique index on
// (recurringRuleId, dueDate) means even attempting to regenerate an
// already-existing due date is a harmless no-op via onConflictDoNothing,
// not a duplicate row or a thrown error. Never generates a future-dated
// occurrence — the upper bound is always today, never the rule's next
// theoretical due date.
export async function generatePendingOccurrences(): Promise<void> {
  try {
    const today = getCurrentDateString();
    const activeRules = await db
      .select()
      .from(recurringRules)
      .where(eq(recurringRules.active, true));

    const rowsToInsert: {
      recurringRuleId: number;
      dueDate: string;
      status: 'pending';
    }[] = [];

    for (const rule of activeRules) {
      const [latestExisting] = await db
        .select({ dueDate: recurringOccurrences.dueDate })
        .from(recurringOccurrences)
        .where(eq(recurringOccurrences.recurringRuleId, rule.id))
        .orderBy(desc(recurringOccurrences.dueDate))
        .limit(1);
      const createdAtDate = formatDateString(new Date(rule.createdAt));
      const fromDate = latestExisting?.dueDate ?? createdAtDate;
      const dueDates = getOccurrenceDatesBetween(
        rule.dayOfMonth,
        fromDate,
        today,
      );
      for (const dueDate of dueDates) {
        rowsToInsert.push({
          recurringRuleId: rule.id,
          dueDate,
          status: 'pending',
        });
      }
    }

    if (rowsToInsert.length > 0) {
      await db
        .insert(recurringOccurrences)
        .values(rowsToInsert)
        .onConflictDoNothing();
    }
  } catch (error) {
    console.error(
      'generatePendingOccurrences: failed to generate pending recurring occurrences',
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/recurring-occurrences?status=pending, keeping the same
// return shape. categoryName is null for an Income occurrence (the rule
// itself never has a categoryId) — the review screen uses that nullness
// to decide whether to show a category field at all, the same way the
// Add page's Income tab has no category picker rather than a disabled one.
export async function getPendingOccurrences() {
  try {
    return await db
      .select({
        id: recurringOccurrences.id,
        recurringRuleId: recurringOccurrences.recurringRuleId,
        dueDate: recurringOccurrences.dueDate,
        ruleName: recurringRules.name,
        ruleType: recurringRules.ruleType,
        amount: recurringRules.amount,
        accountId: recurringRules.accountId,
        accountName: accounts.name,
        categoryId: recurringRules.categoryId,
        categoryName: categories.name,
        currencyId: recurringRules.currencyId,
        currencyCode: currencies.code,
      })
      .from(recurringOccurrences)
      .innerJoin(
        recurringRules,
        eq(recurringOccurrences.recurringRuleId, recurringRules.id),
      )
      .innerJoin(accounts, eq(recurringRules.accountId, accounts.id))
      .innerJoin(currencies, eq(recurringRules.currencyId, currencies.id))
      .leftJoin(categories, eq(recurringRules.categoryId, categories.id))
      .where(eq(recurringOccurrences.status, 'pending'))
      .orderBy(recurringOccurrences.dueDate);
  } catch (error) {
    console.error(
      'getPendingOccurrences: failed to load pending recurring occurrences',
      error,
    );
    throw error;
  }
}

export type ConfirmOccurrenceParams = {
  occurrenceId: number;
  amount: number;
  accountId: number;
  date: string; // 'YYYY-MM-DD' — the transaction's effective date, editable by the user, defaults to the due date
};

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/recurring-occurrences/:id/confirm), keeping the same input/return
// shape.
//
// Inserts a REAL transaction — entryType comes from the rule's ruleType,
// categoryId is the rule's categoryId passed through AS-IS (null for an
// Income rule, never substituted with a default category, matching how
// every other Income entry in this app carries no category at all).
// Exactly like payInstallment (Stage 12b) and every ordinary
// addTransaction/addIncome call, this never writes to account_balances
// directly: every account balance is always derived from the
// transactions table via getBalanceDelta, so inserting this one row IS
// the entire balance effect. That's also why confirming an Income
// occurrence into a CreditCard account correctly *reduces* its debt and
// confirming an Expense occurrence into one correctly *increases* it,
// with no recurring-specific balance code at all.
export async function confirmOccurrence(
  params: ConfirmOccurrenceParams,
): Promise<void> {
  try {
    const [occurrence] = await db
      .select()
      .from(recurringOccurrences)
      .where(eq(recurringOccurrences.id, params.occurrenceId))
      .limit(1);
    if (!occurrence) {
      throw new Error('That recurring occurrence no longer exists.');
    }
    if (occurrence.status !== 'pending') {
      throw new Error(
        `This occurrence was already ${occurrence.status} and cannot be confirmed again.`,
      );
    }
    const [rule] = await db
      .select()
      .from(recurringRules)
      .where(eq(recurringRules.id, occurrence.recurringRuleId))
      .limit(1);
    if (!rule) {
      throw new Error('The recurring rule behind this occurrence no longer exists.');
    }
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      throw new Error('Enter a valid amount before confirming.');
    }

    const description = `${rule.name} (recurring)`;

    await db.transaction(async tx => {
      const [transaction] = await tx
        .insert(transactions)
        .values({
          accountId: params.accountId,
          amount: params.amount,
          categoryId: rule.categoryId,
          description,
          date: params.date,
          entryType: rule.ruleType,
          currencyId: rule.currencyId,
          createdAt: Date.now(),
        })
        .returning();
      await tx
        .update(recurringOccurrences)
        .set({
          status: 'confirmed',
          transactionId: transaction.id,
          confirmedAmount: params.amount,
          // The real-world date this occurrence was resolved, distinct
          // from params.date (the transaction's effective date, which
          // the user may have backdated or moved) — same
          // resolved-vs-effective split skipOccurrence uses below.
          resolvedAt: getCurrentDateString(),
        })
        .where(eq(recurringOccurrences.id, params.occurrenceId));
    });
  } catch (error) {
    console.error(
      `confirmOccurrence: failed to confirm recurring occurrence id=${params.occurrenceId}`,
      params,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/recurring-occurrences/:id/skip), keeping the same input shape.
// Creates no transaction and changes no balance — this is deliberately
// the "I know, I'm not paying this one" escape hatch, since without it a
// single missed month would otherwise sit in the pending list forever
// (generatePendingOccurrences never removes a row it already created).
export async function skipOccurrence(occurrenceId: number): Promise<void> {
  try {
    const [occurrence] = await db
      .select()
      .from(recurringOccurrences)
      .where(eq(recurringOccurrences.id, occurrenceId))
      .limit(1);
    if (!occurrence) {
      throw new Error('That recurring occurrence no longer exists.');
    }
    if (occurrence.status !== 'pending') {
      throw new Error(
        `This occurrence was already ${occurrence.status} and cannot be skipped.`,
      );
    }
    await db
      .update(recurringOccurrences)
      .set({ status: 'skipped', resolvedAt: getCurrentDateString() })
      .where(eq(recurringOccurrences.id, occurrenceId));
  } catch (error) {
    console.error(
      `skipOccurrence: failed to skip recurring occurrence id=${occurrenceId}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/recurring-rules/:id/occurrences, keeping the same
// return shape. accountName/description come from the linked transaction
// for a confirmed row (there is none for pending/skipped, hence the left
// join) — recurring_occurrences itself never stores which account an
// occurrence was actually paid from, only the transaction does.
export async function getOccurrenceHistory(ruleId: number) {
  try {
    return await db
      .select({
        id: recurringOccurrences.id,
        dueDate: recurringOccurrences.dueDate,
        status: recurringOccurrences.status,
        confirmedAmount: recurringOccurrences.confirmedAmount,
        resolvedAt: recurringOccurrences.resolvedAt,
        accountName: accounts.name,
      })
      .from(recurringOccurrences)
      .leftJoin(transactions, eq(recurringOccurrences.transactionId, transactions.id))
      .leftJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(eq(recurringOccurrences.recurringRuleId, ruleId))
      .orderBy(desc(recurringOccurrences.dueDate));
  } catch (error) {
    console.error(
      `getOccurrenceHistory: failed to load occurrence history for rule id=${ruleId}`,
      error,
    );
    throw error;
  }
}

// Stage 14: savings goals. A goal and its contributions NEVER touch
// account_balances and NEVER insert into transactions — see the CRITICAL
// note on addContribution below, which is the one place this rule
// actually matters. Everything here is otherwise a plain, independent
// pair of tables with no relationship to the balance-derivation machinery
// used everywhere else in this file (getBalanceDelta,
// getNetSpentForAccount, etc.) — that machinery is deliberately never
// imported into this section.
export type NewSavingsGoalParams = {
  name: string;
  targetAmount: number;
  currencyId: number;
  targetDate?: string; // 'YYYY-MM-DD', optional — no target date means no required-per-month figure either
};

// Shared by create/update. targetAmount must be strictly positive: zero
// or negative targets make getProgress/getRequiredPerMonth's math
// meaningless (a goal with nothing to save toward isn't a goal).
function validateSavingsGoalParams(params: NewSavingsGoalParams): void {
  if (!params.name.trim()) {
    throw new Error('A name is required for the savings goal.');
  }
  if (!Number.isFinite(params.targetAmount) || params.targetAmount <= 0) {
    throw new Error('Target amount must be a positive number.');
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/savings-goals?status=, keeping the same return shape.
// totalContributed is summed here (coalesced to 0 for a goal with no
// contributions yet) so the screen never needs a second round-trip per
// goal just to show progress — it's deliberately left un-clamped and
// un-divided-by-target here; getProgress/getRequiredPerMonth in
// utils/savingsMath.ts are what turn this raw total into a percentage or
// a monthly figure, kept out of the query layer the same way
// InstallmentPlansScreen computes its own remaining/next-due figures from
// raw plan+payment data rather than the query layer doing it. Filtering
// by status happens in JS, matching getRecurringRules' activeOnly
// pattern, since this table is small in a personal tracker.
export async function getSavingsGoals(
  status?: 'active' | 'achieved' | 'abandoned',
) {
  try {
    const rows = await db
      .select({
        id: savingsGoals.id,
        name: savingsGoals.name,
        targetAmount: savingsGoals.targetAmount,
        currencyId: savingsGoals.currencyId,
        currencyCode: currencies.code,
        targetDate: savingsGoals.targetDate,
        status: savingsGoals.status,
        createdAt: savingsGoals.createdAt,
        totalContributed: sql<number>`coalesce(sum(${savingsContributions.amount}), 0)`,
      })
      .from(savingsGoals)
      .innerJoin(currencies, eq(savingsGoals.currencyId, currencies.id))
      .leftJoin(
        savingsContributions,
        eq(savingsContributions.savingsGoalId, savingsGoals.id),
      )
      .groupBy(savingsGoals.id)
      .orderBy(desc(savingsGoals.createdAt));
    return status ? rows.filter(row => row.status === status) : rows;
  } catch (error) {
    console.error('getSavingsGoals: failed to load savings goals', error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/savings-goals), keeping the same input/return shape. Always
// created with status 'active' — a goal can't be born already achieved
// or abandoned.
export async function createSavingsGoal(
  params: NewSavingsGoalParams,
): Promise<SavingsGoal> {
  try {
    validateSavingsGoalParams(params);
    const [goal] = await db
      .insert(savingsGoals)
      .values({
        name: params.name.trim(),
        targetAmount: params.targetAmount,
        currencyId: params.currencyId,
        targetDate: params.targetDate ?? null,
        status: 'active',
        createdAt: Date.now(),
      })
      .returning();
    return goal;
  } catch (error) {
    console.error(
      'createSavingsGoal: failed to create savings goal',
      params,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(PATCH
// /api/savings-goals/:id), keeping the same input/return shape. Does not
// touch status — use setSavingsGoalStatus for achieved/abandoned so an
// ordinary edit (say, correcting a typo in the name) can never
// accidentally flip a goal's status as a side effect.
export async function updateSavingsGoal(
  id: number,
  params: NewSavingsGoalParams,
): Promise<void> {
  try {
    validateSavingsGoalParams(params);
    await db
      .update(savingsGoals)
      .set({
        name: params.name.trim(),
        targetAmount: params.targetAmount,
        currencyId: params.currencyId,
        targetDate: params.targetDate ?? null,
      })
      .where(eq(savingsGoals.id, id));
  } catch (error) {
    console.error(
      `updateSavingsGoal: failed to update savings goal id=${id}`,
      params,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(PATCH
// /api/savings-goals/:id/status), keeping the same input shape. This is
// the preferred way to mark a goal "achieved" or "abandoned" — deletion
// is reserved for goals created by mistake (see deleteSavingsGoal), so
// history (and the goal's contribution log) is kept by default rather
// than as an opt-in.
export async function setSavingsGoalStatus(
  id: number,
  status: 'active' | 'achieved' | 'abandoned',
): Promise<void> {
  try {
    await db
      .update(savingsGoals)
      .set({ status })
      .where(eq(savingsGoals.id, id));
  } catch (error) {
    console.error(
      `setSavingsGoalStatus: failed to set status=${status} for savings goal id=${id}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(DELETE
// /api/savings-goals/:id), keeping the same input shape. Deletes the goal
// and every contribution logged against it — the caller (SavingsGoalsScreen)
// is responsible for a destructive-confirmation prompt before calling
// this, since unlike setSavingsGoalStatus there's no undo. Runs in a
// transaction so a failure partway never leaves orphaned contribution
// rows pointing at a goal that no longer exists.
export async function deleteSavingsGoal(id: number): Promise<void> {
  try {
    await db.transaction(async tx => {
      await tx
        .delete(savingsContributions)
        .where(eq(savingsContributions.savingsGoalId, id));
      await tx.delete(savingsGoals).where(eq(savingsGoals.id, id));
    });
  } catch (error) {
    console.error(
      `deleteSavingsGoal: failed to delete savings goal id=${id}`,
      error,
    );
    throw error;
  }
}

export type NewContributionParams = {
  savingsGoalId: number;
  amount: number;
  date: string; // 'YYYY-MM-DD'
  note?: string;
};

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/savings-goals/:id/contributions), keeping the same input/return
// shape.
//
// CRITICAL: this inserts a savings_contributions row and NOTHING ELSE. It
// must never touch account_balances and must never insert into
// transactions — doing either would make a contribution move real money
// or change net worth, which is exactly what this feature is not allowed
// to do. A contribution is a log of intent ("I'm setting this aside for
// X"), not a movement of money: the money stays exactly where it already
// was, in whatever real account it's in, until the user actually spends
// it — which, if it ever happens, is recorded as an ordinary Expense
// transaction completely independent of this table. If a future edit to
// this function ever references accountBalances or transactions, that is
// a bug being introduced, not a feature.
export async function addContribution(
  params: NewContributionParams,
): Promise<void> {
  try {
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      throw new Error('Enter a contribution amount greater than zero.');
    }
    await db.insert(savingsContributions).values({
      savingsGoalId: params.savingsGoalId,
      amount: params.amount,
      date: params.date,
      note: params.note,
      createdAt: Date.now(),
    });
  } catch (error) {
    console.error(
      'addContribution: failed to add contribution',
      params,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/savings-goals/:id/contributions, keeping the same
// return shape. Most-recent-first by date, tie-broken by id so
// same-day contributions still get a stable, insertion order.
export async function getContributions(savingsGoalId: number) {
  try {
    return await db
      .select()
      .from(savingsContributions)
      .where(eq(savingsContributions.savingsGoalId, savingsGoalId))
      .orderBy(desc(savingsContributions.date), desc(savingsContributions.id));
  } catch (error) {
    console.error(
      `getContributions: failed to load contributions for savings goal id=${savingsGoalId}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(PATCH
// /api/savings-contributions/:id), keeping the same input shape. Same
// CRITICAL constraint as addContribution above applies here too — this
// only ever updates a savings_contributions row.
export async function updateContribution(
  id: number,
  params: { amount: number; date: string; note?: string },
): Promise<void> {
  try {
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      throw new Error('Enter a contribution amount greater than zero.');
    }
    await db
      .update(savingsContributions)
      .set({ amount: params.amount, date: params.date, note: params.note })
      .where(eq(savingsContributions.id, id));
  } catch (error) {
    console.error(
      `updateContribution: failed to update contribution id=${id}`,
      params,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(DELETE
// /api/savings-contributions/:id), keeping the same return shape. Removing
// a contribution simply lowers the goal's totalContributed the next time
// getSavingsGoals sums them — there's no separate running total anywhere
// else that could fall out of sync.
export async function deleteContribution(id: number): Promise<void> {
  try {
    await db
      .delete(savingsContributions)
      .where(eq(savingsContributions.id, id));
  } catch (error) {
    console.error(
      `deleteContribution: failed to delete contribution id=${id}`,
      error,
    );
    throw error;
  }
}

// Stage 15: transaction search and tags. Tags are a flat, user-managed
// vocabulary (like categories); transactionTags is their many-to-many
// join to `transactions`. Nothing in this section is ever allowed to
// delete a transaction — see the CRITICAL note on deleteTag below, which
// is the one place that actually matters.

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/tags, keeping the same return type. Alphabetical, not
// createdAt-ordered — a flat tag list is picked from, not read
// chronologically, unlike most other lists in this app.
export async function getTags(): Promise<Tag[]> {
  try {
    return await db.select().from(tags).orderBy(tags.name);
  } catch (error) {
    console.error('getTags: failed to load tags', error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/tags), keeping the same input/return shape.
export async function addTag(name: string): Promise<Tag> {
  try {
    if (!name.trim()) {
      throw new Error('A name is required for the tag.');
    }
    const [tag] = await db
      .insert(tags)
      .values({ name: name.trim(), createdAt: Date.now() })
      .returning();
    return tag;
  } catch (error) {
    console.error('addTag: failed to add tag', name, error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(PATCH
// /api/tags/:id), keeping the same input/return shape. Renaming a tag
// changes what every transaction already carrying it displays — there's
// no snapshot-at-time-of-tagging the way a recurring rule's amount is
// snapshotted into its occurrence, since a tag is just a label, not a
// value that could roll forward incorrectly.
export async function updateTag(id: number, name: string): Promise<Tag> {
  try {
    if (!name.trim()) {
      throw new Error('A name is required for the tag.');
    }
    const [updated] = await db
      .update(tags)
      .set({ name: name.trim() })
      .where(eq(tags.id, id))
      .returning();
    return updated;
  } catch (error) {
    console.error(`updateTag: failed to update tag id=${id}`, name, error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(DELETE
// /api/tags/:id), keeping the same input shape.
//
// CRITICAL: this deletes the tag itself and its transaction_tags rows —
// and NOTHING ELSE. It must never delete, or even touch, anything in
// `transactions`. db/schema.ts deliberately declares transactionTags'
// foreign keys with no ON DELETE CASCADE specifically so a stray FK
// constraint could never take a real financial record down with a tag; this
// function honors that same boundary in application code, only ever
// issuing deletes against `transactionTags` and `tags`. A cascade that
// deleted transactions here would be catastrophic and exactly the kind of
// bug this comment exists to rule out for anyone touching this later.
export async function deleteTag(id: number): Promise<void> {
  try {
    await db.transaction(async tx => {
      await tx.delete(transactionTags).where(eq(transactionTags.tagId, id));
      await tx.delete(tags).where(eq(tags.id, id));
    });
  } catch (error) {
    console.error(`deleteTag: failed to delete tag id=${id}`, error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(PUT
// /api/transactions/:id/tags), keeping the same input shape. Replaces the
// full tag set in one call — delete every existing transaction_tags row
// for this transaction, then insert the new set — rather than computing
// an add/remove delta. Simpler and less error-prone: the caller (a
// multi-select UI) always already knows the full desired set, so there's
// no reason to make this function reconstruct one from a diff. An empty
// tagIds array is valid and just clears every tag from the transaction.
export async function setTransactionTags(
  transactionId: number,
  tagIds: number[],
): Promise<void> {
  try {
    await db.transaction(async tx => {
      await tx
        .delete(transactionTags)
        .where(eq(transactionTags.transactionId, transactionId));
      if (tagIds.length > 0) {
        await tx
          .insert(transactionTags)
          .values(tagIds.map(tagId => ({ transactionId, tagId })));
      }
    });
  } catch (error) {
    console.error(
      `setTransactionTags: failed to set tags for transaction id=${transactionId}`,
      tagIds,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/transactions/:id/tags, keeping the same return type.
export async function getTagsForTransaction(
  transactionId: number,
): Promise<Tag[]> {
  try {
    return await db
      .select({
        id: tags.id,
        name: tags.name,
        createdAt: tags.createdAt,
      })
      .from(transactionTags)
      .innerJoin(tags, eq(transactionTags.tagId, tags.id))
      .where(eq(transactionTags.transactionId, transactionId))
      .orderBy(tags.name);
  } catch (error) {
    console.error(
      `getTagsForTransaction: failed to load tags for transaction id=${transactionId}`,
      error,
    );
    throw error;
  }
}

export type SearchTransactionsParams = {
  query?: string;
  tagIds?: number[]; // AND, not OR — a matching transaction must carry every one of these
  categoryId?: number;
  accountId?: number;
  limit?: number;
};

const DEFAULT_SEARCH_LIMIT = 200;

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/transactions/search?..., keeping the same input/return
// shape.
//
// Deliberately a plain LIKE over lower()'d text, not SQLite FTS5 — see the
// Stage 15 spec: at this app's data scale (a personal tracker, not a
// company ledger) FTS5's shadow table and sync triggers buy nothing a
// LIKE query doesn't already do fast enough. `query` matches description,
// category name, and account name so "BOC" (an account name) or "Food"
// (a category name) surfaces transactions even when neither word appears
// in the description itself.
//
// tagIds intersection (AND) is computed in JS rather than SQL HAVING —
// same "small table, filter in JS" convention as getRecurringRules and
// getSavingsGoals elsewhere in this file: fetch every transactionTags row
// for the requested tags, group by transactionId, and keep only the
// transactions whose tag set is a superset of every requested tagId.
// Searches every transaction regardless of date — there is no
// month/year restriction anywhere in this function, by design (see
// HistoryListScreen, which is what switches into "searching all
// transactions" mode when this is called).
export async function searchTransactions(params: SearchTransactionsParams) {
  try {
    const limit = params.limit ?? DEFAULT_SEARCH_LIMIT;

    let matchingTransactionIds: number[] | null = null;
    if (params.tagIds && params.tagIds.length > 0) {
      const tagRows = await db
        .select({
          transactionId: transactionTags.transactionId,
          tagId: transactionTags.tagId,
        })
        .from(transactionTags)
        .where(inArray(transactionTags.tagId, params.tagIds));
      const tagIdsByTransaction = new Map<number, Set<number>>();
      for (const row of tagRows) {
        const existingSet = tagIdsByTransaction.get(row.transactionId);
        if (existingSet) {
          existingSet.add(row.tagId);
        } else {
          tagIdsByTransaction.set(row.transactionId, new Set([row.tagId]));
        }
      }
      const requiredTagIds = params.tagIds;
      matchingTransactionIds = Array.from(tagIdsByTransaction.entries())
        .filter(([, tagIdSet]) =>
          requiredTagIds.every(tagId => tagIdSet.has(tagId)),
        )
        .map(([transactionId]) => transactionId);
      // No transaction carries every requested tag — short-circuit rather
      // than run the main query with an inArray([]) that SQLite would
      // otherwise need to evaluate as "matches nothing" anyway.
      if (matchingTransactionIds.length === 0) {
        return [];
      }
    }

    // Always has at least one entry (the trivially-true base condition),
    // so `and(...conditions)` never has to handle an empty spread.
    const conditions = [sql`1 = 1`];
    if (params.query && params.query.trim()) {
      const likePattern = `%${params.query.trim().toLowerCase()}%`;
      conditions.push(
        sql`(
          lower(coalesce(${transactions.description}, '')) LIKE ${likePattern}
          OR lower(coalesce(${categories.name}, '')) LIKE ${likePattern}
          OR lower(coalesce(${accounts.name}, '')) LIKE ${likePattern}
        )`,
      );
    }
    if (params.categoryId != null) {
      conditions.push(eq(transactions.categoryId, params.categoryId));
    }
    if (params.accountId != null) {
      conditions.push(eq(transactions.accountId, params.accountId));
    }
    if (matchingTransactionIds != null) {
      conditions.push(inArray(transactions.id, matchingTransactionIds));
    }

    return await db
      .select({
        id: transactions.id,
        accountId: transactions.accountId,
        accountName: accounts.name,
        amount: transactions.amount,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        description: transactions.description,
        date: transactions.date,
        entryType: transactions.entryType,
        currencyId: transactions.currencyId,
        currencyCode: currencies.code,
        excludeFromBudget: transactions.excludeFromBudget,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .innerJoin(currencies, eq(transactions.currencyId, currencies.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(...conditions))
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(limit);
  } catch (error) {
    console.error(
      'searchTransactions: failed to search transactions',
      params,
      error,
    );
    throw error;
  }
}

// Stage 16a: statistics reports.
//
// These four functions are the ONLY reporting reads in this file, and
// they read from `transactions` exclusively — deliberately never
// `transfers`, `credit_card_payoffs`, `loan_payments`, or
// `savings_contributions`. None of those tables is spending or income:
// a transfer/credit-card payoff moves money between accounts the user
// already owns, a loan payment is debt movement already reflected in the
// loan account's own balance, and a savings contribution never touches a
// real balance at all (Stage 14's addContribution is explicitly a no-op
// against account_balances/transactions). Folding any of them into a
// report would double-count money that's already accounted for through
// its own dedicated flow. This looks like an omission if you're scanning
// for "why doesn't this report include transfers" — it's intentional.
//
// Every function here also takes `includeExcluded` (default false): when
// false, excludeFromBudget transactions are left out, same as
// getMonthlyTotal/getMonthlyIncome/getCategorySpent; when true, they're
// folded back in. One parameterized WHERE clause, not two query bodies.

// Shared by all four report queries below — date range + currency +
// the includeExcluded toggle, as plain-english conditions rather than
// duplicated inline in each function.
function reportWhereConditions(
  startDate: string,
  endDate: string,
  currencyId: number,
  includeExcluded: boolean,
) {
  const conditions = [
    gte(transactions.date, startDate),
    lte(transactions.date, endDate),
    eq(transactions.currencyId, currencyId),
  ];
  if (!includeExcluded) {
    conditions.push(eq(transactions.excludeFromBudget, false));
  }
  return conditions;
}

export type ReportSummary = {
  totalExpenses: number;
  totalIncome: number;
  net: number; // income minus expenses — can be negative
};

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/reports/summary?startDate=&endDate=&currencyId=&includeExcluded=,
// keeping the same return shape.
export async function getReportSummary(
  startDate: string,
  endDate: string,
  currencyId: number,
  includeExcluded: boolean = false,
): Promise<ReportSummary> {
  try {
    const rows = await db
      .select({
        entryType: transactions.entryType,
        total: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .where(
        and(
          ...reportWhereConditions(startDate, endDate, currencyId, includeExcluded),
        ),
      )
      .groupBy(transactions.entryType);
    const totalExpenses =
      rows.find(row => row.entryType === 'Expense')?.total ?? 0;
    const totalIncome =
      rows.find(row => row.entryType === 'Income')?.total ?? 0;
    return {
      totalExpenses,
      totalIncome,
      net: totalIncome - totalExpenses,
    };
  } catch (error) {
    console.error(
      `getReportSummary: failed to summarize ${startDate}..${endDate} currency id=${currencyId}`,
      error,
    );
    throw error;
  }
}

export type CategorySpendingRow = {
  categoryId: number | null;
  categoryName: string;
  total: number;
  percentage: number; // 0-100, of this result set's own total — not of overall net worth or anything else
};

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/reports/by-category?startDate=&endDate=&currencyId=&includeExcluded=,
// keeping the same return shape. Expense-only — an Income entry has no
// place in a spending-by-category breakdown. percentage is computed
// against this query's own grand total (every category's total summed),
// which is exactly getReportSummary's totalExpenses for the same
// parameters — the two are meant to be read together, and the category
// totals + percentages are designed to sum back to that one number.
export async function getSpendingByCategory(
  startDate: string,
  endDate: string,
  currencyId: number,
  includeExcluded: boolean = false,
): Promise<CategorySpendingRow[]> {
  try {
    const rows = await db
      .select({
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        total: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        and(
          ...reportWhereConditions(startDate, endDate, currencyId, includeExcluded),
          eq(transactions.entryType, 'Expense'),
        ),
      )
      .groupBy(transactions.categoryId)
      .orderBy(desc(sql`sum(${transactions.amount})`));
    const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);
    return rows.map(row => ({
      categoryId: row.categoryId,
      // Every Expense requires a category by app convention, so this
      // fallback should never actually be seen — kept only so a legacy
      // or hand-edited row with a dangling categoryId doesn't crash the
      // report with a null label.
      categoryName: row.categoryName ?? 'Uncategorized',
      total: row.total,
      percentage: grandTotal > 0 ? (row.total / grandTotal) * 100 : 0,
    }));
  } catch (error) {
    console.error(
      `getSpendingByCategory: failed to summarize ${startDate}..${endDate} currency id=${currencyId}`,
      error,
    );
    throw error;
  }
}

export type AccountTypeSpendingRow = {
  accountType: string;
  total: number;
};

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/reports/by-account-type?startDate=&endDate=&currencyId=&includeExcluded=,
// keeping the same return shape. Expense-only, same reasoning as
// getSpendingByCategory. Only Bank/Cash/CryptoWallet/CreditCard accounts
// can ever appear here — Liability/Receivable accounts never carry an
// ordinary Expense transaction in the first place (see
// NON_TRANSACTABLE_ACCOUNT_TYPES throughout the UI layer), so there's
// nothing to filter out here that could accidentally include loan
// activity.
export async function getSpendingByAccountType(
  startDate: string,
  endDate: string,
  currencyId: number,
  includeExcluded: boolean = false,
): Promise<AccountTypeSpendingRow[]> {
  try {
    return await db
      .select({
        accountType: accounts.type,
        total: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(
        and(
          ...reportWhereConditions(startDate, endDate, currencyId, includeExcluded),
          eq(transactions.entryType, 'Expense'),
        ),
      )
      .groupBy(accounts.type)
      .orderBy(desc(sql`sum(${transactions.amount})`));
  } catch (error) {
    console.error(
      `getSpendingByAccountType: failed to summarize ${startDate}..${endDate} currency id=${currencyId}`,
      error,
    );
    throw error;
  }
}

export type MonthlyTrendRow = {
  month: string; // 'YYYY-MM'
  totalExpenses: number;
  totalIncome: number;
};

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/reports/trend?months=&currencyId=&includeExcluded=,
// keeping the same return shape.
//
// Zero-fills months with no activity at all: the underlying query only
// ever returns a row for a (month, entryType) pair that actually has a
// matching transaction, so a month with zero transactions simply never
// appears in `rows` below. Silently omitting it from the result would
// look identical to "no data was requested for that month" once this is
// charted (Stage 16b) — there'd be a gap in the x-axis instead of a
// visible zero, which misrepresents "nothing happened" as "unknown."
// Building the result by mapping over the caller's own `months` array
// (rather than over `rows`) is what guarantees every requested month
// comes back, in the caller's own order, with an explicit 0 wherever
// nothing was found.
export async function getMonthlyTrend(
  months: string[],
  currencyId: number,
  includeExcluded: boolean = false,
): Promise<MonthlyTrendRow[]> {
  try {
    if (months.length === 0) {
      return [];
    }
    const sortedMonths = [...months].sort();
    const firstMonth = sortedMonths[0];
    const lastMonth = sortedMonths[sortedMonths.length - 1];
    const conditions = [
      gte(transactions.date, `${firstMonth}-01`),
      // '-31' is never a real calendar date for every month, but it's
      // only ever used here as a lexical upper bound on a 'YYYY-MM-DD'
      // string — every real date within lastMonth sorts before it
      // regardless of that month's actual length, so this is safe
      // without needing getDaysInMonth just to build a comparison string.
      lte(transactions.date, `${lastMonth}-31`),
      eq(transactions.currencyId, currencyId),
    ];
    if (!includeExcluded) {
      conditions.push(eq(transactions.excludeFromBudget, false));
    }
    const monthExpr = sql<string>`substr(${transactions.date}, 1, 7)`;
    const rows = await db
      .select({
        month: monthExpr,
        entryType: transactions.entryType,
        total: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .where(and(...conditions))
      .groupBy(monthExpr, transactions.entryType);

    const byMonth = new Map<
      string,
      { totalExpenses: number; totalIncome: number }
    >();
    for (const row of rows) {
      const entry = byMonth.get(row.month) ?? {
        totalExpenses: 0,
        totalIncome: 0,
      };
      if (row.entryType === 'Expense') {
        entry.totalExpenses = row.total;
      } else {
        entry.totalIncome = row.total;
      }
      byMonth.set(row.month, entry);
    }
    return months.map(month => ({
      month,
      totalExpenses: byMonth.get(month)?.totalExpenses ?? 0,
      totalIncome: byMonth.get(month)?.totalIncome ?? 0,
    }));
  } catch (error) {
    console.error(
      `getMonthlyTrend: failed to build trend for months=${months.join(',')} currency id=${currencyId}`,
      error,
    );
    throw error;
  }
}

// Stage 17a: Excel export. getAllDataForExport is the ONLY place that
// reads every table for the purpose of writing them out — it exists
// purely to hand utils/excelExport.ts already-shaped, already-joined
// rows matching utils/exportFormat.ts's SHEET_COLUMNS exactly, so the
// export layer itself never has to know column order or run a single
// join. NETWORK-READY: if a backend is added later, this becomes a
// fetch(GET /api/export) that the server assembles instead — the shape
// returned to the caller (ExportWorkbookData) would stay the same.

// Epoch-ms createdAt columns are exported as plain 'YYYY-MM-DD' dates
// (matching every other date already shown in this app), not full
// timestamps — the one exception is Meta's own ExportedAt, which is
// deliberately a full ISO instant so a future importer can tell exactly
// when a file was produced, not just what day.
function toDateOnly(epochMs: number): string {
  return formatDateString(new Date(epochMs));
}

export async function getAllDataForExport(): Promise<ExportWorkbookData> {
  try {
    const [
      allCurrencies,
      allAccounts,
      allAccountBalances,
      allCategories,
      allTags,
      allTransactions,
      allTransactionTags,
      allBudgets,
      allCategoryBudgets,
      allTransfers,
      allLoanDetails,
      allLoanPayments,
      allCreditCardPayoffs,
      allInstallmentPlans,
      allInstallmentPayments,
      allRecurringRules,
      allRecurringOccurrences,
      allSavingsGoals,
      allSavingsContributions,
    ] = await Promise.all([
      db.select().from(currencies),
      db.select().from(accounts),
      db.select().from(accountBalances),
      db.select().from(categories),
      db.select().from(tags),
      db.select().from(transactions),
      db.select().from(transactionTags),
      db.select().from(budgets),
      db.select().from(categoryBudgets),
      db.select().from(transfers),
      db.select().from(loanDetails),
      db.select().from(loanPayments),
      db.select().from(creditCardPayoffs),
      db.select().from(installmentPlans),
      db.select().from(installmentPayments),
      db.select().from(recurringRules),
      db.select().from(recurringOccurrences),
      db.select().from(savingsGoals),
      db.select().from(savingsContributions),
    ]);

    // Lookup maps resolve every foreign key to the human-readable value
    // an exported sheet actually shows. Built once in JS rather than
    // joined per-table in SQL — this function already has to load every
    // table into memory to write a full-workbook export, so this is the
    // same "small table, filter/join in JS" convention already used
    // throughout this file (getRecurringRules, searchTransactions, etc.),
    // just applied at whole-app scale instead of one table at a time.
    const accountName = new Map(allAccounts.map(a => [a.id, a.name]));
    const categoryName = new Map(allCategories.map(c => [c.id, c.name]));
    const currencyCode = new Map(allCurrencies.map(c => [c.id, c.code]));
    const tagName = new Map(allTags.map(t => [t.id, t.name]));
    const installmentPlanName = new Map(
      allInstallmentPlans.map(p => [p.id, p.name]),
    );
    const recurringRuleName = new Map(
      allRecurringRules.map(r => [r.id, r.name]),
    );
    const savingsGoalName = new Map(allSavingsGoals.map(g => [g.id, g.name]));
    const transactionById = new Map(allTransactions.map(t => [t.id, t]));

    // Tag names per transaction, comma-joined, for Transactions' own Tags
    // column — built from the exact same transactionTags rows the
    // dedicated TransactionTags sheet below also reads, so the two can
    // never disagree with each other.
    const tagNamesByTransactionId = new Map<number, string[]>();
    for (const row of allTransactionTags) {
      const list = tagNamesByTransactionId.get(row.transactionId) ?? [];
      list.push(tagName.get(row.tagId) ?? '');
      tagNamesByTransactionId.set(row.transactionId, list);
    }

    const data: ExportWorkbookData = {
      Meta: [
        {
          SchemaVersion: SCHEMA_VERSION,
          ExportedAt: new Date().toISOString(),
          AppVersion: APP_VERSION,
        },
      ],
      Currencies: allCurrencies.map(
        (c): ExportRow => ({
          Code: c.code,
          Name: c.name,
          IsDefault: c.isDefault,
          CreatedAt: toDateOnly(c.createdAt),
        }),
      ),
      Accounts: allAccounts.map(
        (a): ExportRow => ({
          Name: a.name,
          Type: a.type,
          Active: a.active,
          CreatedAt: toDateOnly(a.createdAt),
        }),
      ),
      AccountBalances: allAccountBalances.map(
        (b): ExportRow => ({
          AccountName: accountName.get(b.accountId) ?? '',
          CurrencyCode: currencyCode.get(b.currencyId) ?? '',
          Balance: b.balance,
        }),
      ),
      Categories: allCategories.map(
        (c): ExportRow => ({
          Name: c.name,
          IsSystemReserved: c.isSystemReserved,
          CreatedAt: toDateOnly(c.createdAt),
        }),
      ),
      Tags: allTags.map(
        (t): ExportRow => ({
          Name: t.name,
          CreatedAt: toDateOnly(t.createdAt),
        }),
      ),
      Transactions: allTransactions.map((t): ExportRow => {
        // CRITICAL (Stage 17a spec): an Income row's Category must come
        // out as a genuinely blank cell — never null, never omitted, and
        // never the string "Uncategorized". Income transactions have no
        // category in the first place (see transactions.categoryId's own
        // nullable-since comment in db/schema.ts), so '' here is simply
        // the correct, faithful representation of "not applicable."
        const category =
          t.categoryId != null ? (categoryName.get(t.categoryId) ?? '') : '';
        return {
          Date: t.date,
          AccountName: accountName.get(t.accountId) ?? '',
          EntryType: t.entryType,
          Amount: t.amount,
          CategoryName: category,
          CurrencyCode: currencyCode.get(t.currencyId) ?? '',
          Description: t.description ?? '',
          Tags: (tagNamesByTransactionId.get(t.id) ?? []).join(', '),
          ExcludeFromBudget: t.excludeFromBudget,
          CreatedAt: toDateOnly(t.createdAt),
        };
      }),
      TransactionTags: allTransactionTags.map((row): ExportRow => {
        const txn = transactionById.get(row.transactionId);
        return {
          Date: txn?.date ?? '',
          AccountName: txn ? (accountName.get(txn.accountId) ?? '') : '',
          Amount: txn?.amount ?? '',
          Description: txn?.description ?? '',
          TagName: tagName.get(row.tagId) ?? '',
        };
      }),
      Budgets: allBudgets.map(
        (b): ExportRow => ({
          Month: b.month ?? '',
          Category: b.category,
          LimitAmount: b.limitAmount,
          Period: b.period,
          StartDate: toDateOnly(b.startDate),
          CreatedAt: toDateOnly(b.createdAt),
        }),
      ),
      CategoryBudgets: allCategoryBudgets.map(
        (cb): ExportRow => ({
          Month: cb.month,
          CategoryName: categoryName.get(cb.categoryId) ?? '',
          Amount: cb.amount,
        }),
      ),
      Transfers: allTransfers.map(
        (t): ExportRow => ({
          Date: t.date,
          FromAccountName: accountName.get(t.fromAccountId) ?? '',
          ToAccountName: accountName.get(t.toAccountId) ?? '',
          Amount: t.amount,
          CurrencyCode: currencyCode.get(t.currencyId) ?? '',
          CreatedAt: toDateOnly(t.createdAt),
        }),
      ),
      LoanDetails: allLoanDetails.map(
        (l): ExportRow => ({
          AccountName: accountName.get(l.accountId) ?? '',
          CounterpartyName: l.counterpartyName,
          DateCreated: l.dateCreated,
          LastAccrualAnchorDate: l.lastAccrualAnchorDate,
          DueDate: l.dueDate ?? '',
          InterestRate: l.interestRate ?? '',
          InterestPeriod: l.interestPeriod ?? '',
        }),
      ),
      LoanPayments: allLoanPayments.map(
        (p): ExportRow => ({
          Date: p.date,
          LoanAccountName: accountName.get(p.loanAccountId) ?? '',
          CounterpartAccountName:
            accountName.get(p.counterpartAccountId) ?? '',
          Amount: p.amount,
          CurrencyCode: currencyCode.get(p.currencyId) ?? '',
          CreatedAt: toDateOnly(p.createdAt),
        }),
      ),
      CreditCardPayoffs: allCreditCardPayoffs.map(
        (p): ExportRow => ({
          Date: p.date,
          CreditCardAccountName: accountName.get(p.creditCardAccountId) ?? '',
          PayingAccountName: accountName.get(p.payingAccountId) ?? '',
          Amount: p.amount,
          CurrencyCode: currencyCode.get(p.currencyId) ?? '',
          CreatedAt: toDateOnly(p.createdAt),
        }),
      ),
      InstallmentPlans: allInstallmentPlans.map(
        (p): ExportRow => ({
          Name: p.name,
          PrincipalAmount: p.principalAmount ?? '',
          InterestRate: p.interestRate ?? '',
          NumberOfMonths: p.numberOfMonths,
          MonthlyAmount: p.monthlyAmount,
          FinalInstallmentAmount: p.finalInstallmentAmount,
          TotalRepayable: p.totalRepayable,
          CategoryName: categoryName.get(p.categoryId) ?? '',
          CurrencyCode: currencyCode.get(p.currencyId) ?? '',
          StartDate: p.startDate,
          DueDayOfMonth: p.dueDayOfMonth ?? '',
          CreatedAt: toDateOnly(p.createdAt),
        }),
      ),
      InstallmentPayments: allInstallmentPayments.map(
        (p): ExportRow => ({
          PlanName: installmentPlanName.get(p.installmentPlanId) ?? '',
          InstallmentNumber: p.installmentNumber,
          AccountName: accountName.get(p.accountId) ?? '',
          PaidDate: p.paidDate,
          CreatedAt: toDateOnly(p.createdAt),
        }),
      ),
      RecurringRules: allRecurringRules.map((r): ExportRow => {
        const category =
          r.categoryId != null ? (categoryName.get(r.categoryId) ?? '') : '';
        return {
          Name: r.name,
          RuleType: r.ruleType,
          Amount: r.amount,
          DayOfMonth: r.dayOfMonth,
          CategoryName: category,
          AccountName: accountName.get(r.accountId) ?? '',
          CurrencyCode: currencyCode.get(r.currencyId) ?? '',
          Active: r.active,
          CreatedAt: toDateOnly(r.createdAt),
        };
      }),
      RecurringOccurrences: allRecurringOccurrences.map(
        (o): ExportRow => ({
          RuleName: recurringRuleName.get(o.recurringRuleId) ?? '',
          DueDate: o.dueDate,
          Status: o.status,
          ConfirmedAmount: o.confirmedAmount ?? '',
          ResolvedAt: o.resolvedAt ?? '',
        }),
      ),
      SavingsGoals: allSavingsGoals.map(
        (g): ExportRow => ({
          Name: g.name,
          TargetAmount: g.targetAmount,
          CurrencyCode: currencyCode.get(g.currencyId) ?? '',
          TargetDate: g.targetDate ?? '',
          Status: g.status,
          CreatedAt: toDateOnly(g.createdAt),
        }),
      ),
      SavingsContributions: allSavingsContributions.map(
        (c): ExportRow => ({
          GoalName: savingsGoalName.get(c.savingsGoalId) ?? '',
          Amount: c.amount,
          Date: c.date,
          Note: c.note ?? '',
          CreatedAt: toDateOnly(c.createdAt),
        }),
      ),
    };

    return data;
  } catch (error) {
    console.error('getAllDataForExport: failed to gather export data', error);
    throw error;
  }
}

// ---------------------------------------------------------------------
// Stage 17b: Excel import, Phase 2 (apply). Only ever called with data
// that utils/excelImport.ts's validateExcelFile has already returned as
// { valid: true } — this file trusts every reference in `data` resolves
// (to an existing row or another sheet in the same workbook) and never
// re-validates. ImportMode/ImportWorkbookData are duplicated here
// (rather than imported from utils/excelImport.ts) purely to avoid a
// circular import — that file already imports several read functions
// from this one.
// ---------------------------------------------------------------------

export type ImportMode = 'merge' | 'replace';
export type ImportWorkbookData = Partial<Record<SheetName, ExportRow[]>>;

// Converts an exported 'YYYY-MM-DD' string back into an epoch-ms
// createdAt. The exact time of day was never preserved on export
// (toDateOnly collapses it to a date), so midnight local time is as
// faithful a reconstruction as this can be — nothing in the app displays
// createdAt down to the second; every date-derived view (month/year
// filters, sorting) reads the row's own 'date'/'month' text column, not
// createdAt.
function dateOnlyToEpoch(dateStr: string): number {
  if (!dateStr) {
    return Date.now();
  }
  const parsed = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? Date.now() : parsed.getTime();
}

// Splits a Transactions row's comma-separated Tags cell back into
// trimmed, non-empty tag names — the exact inverse of how
// getAllDataForExport joined them together (`.join(', ')`), so a round
// trip reproduces the same set.
function splitTagNames(raw: string): string[] {
  return raw
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0);
}

// DESTRUCTIVE. Deletes every row from every table except app_settings
// (the theme must survive a REPLACE import), in FK-safe
// children-before-parents order. Used ONLY by importData's REPLACE
// mode, and only ever inside the same transaction as the import that
// follows it — nothing else in the app should ever call this casually.
async function wipeAllDataWithin(tx: DbTransaction): Promise<void> {
  await tx.delete(transactionTags);
  await tx.delete(installmentPayments);
  await tx.delete(recurringOccurrences);
  await tx.delete(savingsContributions);
  await tx.delete(categoryBudgets);
  await tx.delete(transactions);
  await tx.delete(transfers);
  await tx.delete(loanPayments);
  await tx.delete(creditCardPayoffs);
  await tx.delete(installmentPlans);
  await tx.delete(recurringRules);
  await tx.delete(loanDetails);
  await tx.delete(accountBalances);
  await tx.delete(savingsGoals);
  await tx.delete(budgets);
  await tx.delete(accounts);
  await tx.delete(categories);
  await tx.delete(tags);
  await tx.delete(currencies);
}

// NETWORK-READY: no direct backend equivalent — a networked backend
// would instead expose a "restore from file" endpoint that performs the
// same wipe-then-reload server-side. DESTRUCTIVE and single-purpose:
// deletes every record in the app. Exported only so importData's
// REPLACE mode (and nothing else) can call it.
export async function wipeAllData(): Promise<void> {
  try {
    await db.transaction(async tx => {
      await wipeAllDataWithin(tx);
    });
  } catch (error) {
    console.error('wipeAllData: failed to wipe all data', error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/import), keeping the same input/return shape. Phase 2 of Stage
// 17b's Excel import — applies data that utils/excelImport.ts's
// validateExcelFile has already fully validated. Runs as a single
// database transaction so a failure partway through never leaves a
// half-imported database; REPLACE mode wipes everything first inside
// that same transaction, so a failed REPLACE leaves the original data
// untouched rather than an empty one.
//
// Reference tables (Currencies, Categories, Tags, Accounts,
// InstallmentPlans, RecurringRules, SavingsGoals) are matched by their
// human-readable key and reused if they already exist — never
// duplicated. Event-log tables (Transfers, LoanPayments,
// CreditCardPayoffs, SavingsContributions) are pure inserts with no
// dedup, since re-importing the same MERGE file twice legitimately
// creates two records. Transfers/LoanPayments/CreditCardPayoffs
// deliberately never shift accountBalances — the AccountBalances sheet
// already carries the cumulative baseline that resulted from those
// events at export time, so replaying them here would double-count.
// InstallmentPayments and confirmed RecurringOccurrences are the one
// exception to "pure insert": each synthesizes a brand-new transactions
// row, because those ARE ordinary transactions that getAccountBalance
// sums live rather than baking into the baseline — and each is
// deduplicated against its own real DB unique index so a re-imported
// MERGE file can't violate it.
export async function importData(
  data: ImportWorkbookData,
  mode: ImportMode,
): Promise<Partial<Record<SheetName, number>>> {
  const rowCounts: Partial<Record<SheetName, number>> = {};
  try {
    await db.transaction(async tx => {
      if (mode === 'replace') {
        await wipeAllDataWithin(tx);
      }

      // ---- Currencies ----
      const existingCurrencies = await tx.select().from(currencies);
      const currencyIdByCode = new Map(
        existingCurrencies.map(c => [c.code, c.id]),
      );
      for (const row of data.Currencies ?? []) {
        const code = String(row.Code);
        if (currencyIdByCode.has(code)) {
          continue;
        }
        const [created] = await tx
          .insert(currencies)
          .values({
            code,
            name: String(row.Name),
            // Never trust an imported IsDefault — exactly one currency
            // is ever the default, and that's whichever one already
            // holds the flag in this database, never something a
            // workbook gets to override (same rule as addCurrency).
            isDefault: false,
            createdAt: dateOnlyToEpoch(String(row.CreatedAt ?? '')),
          })
          .returning();
        currencyIdByCode.set(code, created.id);
      }
      rowCounts.Currencies = data.Currencies?.length ?? 0;

      // ---- Categories: explicit sheet rows, get-or-create by name.
      // References elsewhere in the workbook (Transactions,
      // InstallmentPlans, RecurringRules) share this same
      // get-or-create, since a category needs nothing but a name to be
      // a fully valid row (see utils/excelImport.ts's freeformName). ----
      const existingCategories = await tx.select().from(categories);
      const categoryIdByName = new Map(
        existingCategories.map(c => [c.name, c.id]),
      );
      const getOrCreateCategoryId = async (name: string): Promise<number> => {
        const existingId = categoryIdByName.get(name);
        if (existingId != null) {
          return existingId;
        }
        const [created] = await tx
          .insert(categories)
          .values({ name, isSystemReserved: false, createdAt: Date.now() })
          .returning();
        categoryIdByName.set(name, created.id);
        return created.id;
      };
      for (const row of data.Categories ?? []) {
        await getOrCreateCategoryId(String(row.Name));
      }
      rowCounts.Categories = data.Categories?.length ?? 0;

      // ---- Tags: same get-or-create-by-name pattern as Categories. ----
      const existingTags = await tx.select().from(tags);
      const tagIdByName = new Map(existingTags.map(t => [t.name, t.id]));
      const getOrCreateTagId = async (name: string): Promise<number> => {
        const existingId = tagIdByName.get(name);
        if (existingId != null) {
          return existingId;
        }
        const [created] = await tx
          .insert(tags)
          .values({ name, createdAt: Date.now() })
          .returning();
        tagIdByName.set(name, created.id);
        return created.id;
      };
      for (const row of data.Tags ?? []) {
        await getOrCreateTagId(String(row.Name));
      }
      rowCounts.Tags = data.Tags?.length ?? 0;

      // ---- Accounts: get-or-create by name. Phase 1 already rejected
      // any name colliding with an existing account of a DIFFERENT
      // type, so reusing by name alone here is safe. ----
      const existingAccounts = await tx.select().from(accounts);
      const accountIdByName = new Map(
        existingAccounts.map(a => [a.name, a.id]),
      );
      for (const row of data.Accounts ?? []) {
        const name = String(row.Name);
        if (accountIdByName.has(name)) {
          continue;
        }
        const [created] = await tx
          .insert(accounts)
          .values({
            name,
            type: String(row.Type),
            active: Boolean(row.Active),
            createdAt: dateOnlyToEpoch(String(row.CreatedAt ?? '')),
          })
          .returning();
        accountIdByName.set(name, created.id);
      }
      rowCounts.Accounts = data.Accounts?.length ?? 0;

      // ---- AccountBalances: absolute-sets the baseline. This already
      // carries the cumulative effect of every historical Transfer,
      // LoanPayment, and CreditCardPayoff as of export time — those
      // three tables below are pure historical-record inserts and must
      // NEVER also shift a balance, or their effect would be
      // double-counted. ----
      for (const row of data.AccountBalances ?? []) {
        const accountId = accountIdByName.get(String(row.AccountName));
        const currencyId = currencyIdByCode.get(String(row.CurrencyCode));
        if (accountId == null || currencyId == null) {
          continue; // unreachable if Phase 1 validated; never trust silently
        }
        await upsertAccountBalanceWithin(
          tx,
          accountId,
          currencyId,
          Number(row.Balance),
        );
      }
      rowCounts.AccountBalances = data.AccountBalances?.length ?? 0;

      // ---- Transactions: the main bulk-import sheet. Every regular
      // transaction is summed live by getAccountBalance, never baked
      // into the baseline, so these must be re-inserted for balance
      // fidelity even when AccountBalances is also present. ----
      for (const row of data.Transactions ?? []) {
        const accountId = accountIdByName.get(String(row.AccountName));
        const currencyId = currencyIdByCode.get(String(row.CurrencyCode));
        if (accountId == null || currencyId == null) {
          continue;
        }
        const entryType = row.EntryType === 'Income' ? 'Income' : 'Expense';
        const categoryName = String(row.CategoryName ?? '');
        const categoryId =
          entryType === 'Income' || !categoryName
            ? null
            : await getOrCreateCategoryId(categoryName);
        const [createdTxn] = await tx
          .insert(transactions)
          .values({
            accountId,
            amount: Number(row.Amount),
            categoryId,
            description: String(row.Description ?? '') || null,
            date: String(row.Date),
            entryType,
            currencyId,
            excludeFromBudget: Boolean(row.ExcludeFromBudget),
            createdAt: dateOnlyToEpoch(String(row.CreatedAt ?? '')),
          })
          .returning();
        const tagNames = splitTagNames(String(row.Tags ?? ''));
        for (const tagName of tagNames) {
          const tagId = await getOrCreateTagId(tagName);
          await tx
            .insert(transactionTags)
            .values({ transactionId: createdTxn.id, tagId });
        }
      }
      rowCounts.Transactions = data.Transactions?.length ?? 0;

      // ---- Budgets: the single overall monthly budget, upserted by
      // month — same semantics as upsertBudget. ----
      for (const row of data.Budgets ?? []) {
        const month = String(row.Month);
        const [existing] = await tx
          .select()
          .from(budgets)
          .where(eq(budgets.month, month))
          .limit(1);
        if (existing) {
          await tx
            .update(budgets)
            .set({ limitAmount: Number(row.LimitAmount) })
            .where(eq(budgets.id, existing.id));
        } else {
          await tx.insert(budgets).values({
            category: String(row.Category),
            limitAmount: Number(row.LimitAmount),
            period: String(row.Period),
            startDate: dateOnlyToEpoch(String(row.StartDate ?? '')),
            month,
            createdAt: dateOnlyToEpoch(String(row.CreatedAt ?? '')),
          });
        }
      }
      rowCounts.Budgets = data.Budgets?.length ?? 0;

      // ---- CategoryBudgets: upserted by (month, categoryId). ----
      for (const row of data.CategoryBudgets ?? []) {
        const month = String(row.Month);
        const categoryId = await getOrCreateCategoryId(
          String(row.CategoryName),
        );
        const [existing] = await tx
          .select()
          .from(categoryBudgets)
          .where(
            and(
              eq(categoryBudgets.month, month),
              eq(categoryBudgets.categoryId, categoryId),
            ),
          )
          .limit(1);
        if (existing) {
          await tx
            .update(categoryBudgets)
            .set({ amount: Number(row.Amount) })
            .where(eq(categoryBudgets.id, existing.id));
        } else {
          await tx.insert(categoryBudgets).values({
            month,
            categoryId,
            amount: Number(row.Amount),
          });
        }
      }
      rowCounts.CategoryBudgets = data.CategoryBudgets?.length ?? 0;

      // ---- Transfers: pure historical-record insert, no balance shift
      // — see the AccountBalances comment above. ----
      for (const row of data.Transfers ?? []) {
        const fromAccountId = accountIdByName.get(String(row.FromAccountName));
        const toAccountId = accountIdByName.get(String(row.ToAccountName));
        const currencyId = currencyIdByCode.get(String(row.CurrencyCode));
        if (fromAccountId == null || toAccountId == null || currencyId == null) {
          continue;
        }
        await tx.insert(transfers).values({
          fromAccountId,
          toAccountId,
          amount: Number(row.Amount),
          currencyId,
          date: String(row.Date),
          createdAt: dateOnlyToEpoch(String(row.CreatedAt ?? '')),
        });
      }
      rowCounts.Transfers = data.Transfers?.length ?? 0;

      // ---- LoanDetails: one row per Liability/Receivable account,
      // get-or-create by accountId (the schema's own unique key). ----
      for (const row of data.LoanDetails ?? []) {
        const accountId = accountIdByName.get(String(row.AccountName));
        if (accountId == null) {
          continue;
        }
        const values = {
          accountId,
          counterpartyName: String(row.CounterpartyName),
          dateCreated: String(row.DateCreated),
          lastAccrualAnchorDate: String(row.LastAccrualAnchorDate),
          dueDate: String(row.DueDate ?? '') || null,
          interestRate:
            row.InterestRate === '' || row.InterestRate == null
              ? null
              : Number(row.InterestRate),
          interestPeriod:
            (String(row.InterestPeriod ?? '') || null) as
              | 'monthly'
              | 'annual'
              | null,
        };
        const [existing] = await tx
          .select()
          .from(loanDetails)
          .where(eq(loanDetails.accountId, accountId))
          .limit(1);
        if (existing) {
          await tx
            .update(loanDetails)
            .set(values)
            .where(eq(loanDetails.id, existing.id));
        } else {
          await tx.insert(loanDetails).values(values);
        }
      }
      rowCounts.LoanDetails = data.LoanDetails?.length ?? 0;

      // ---- LoanPayments / CreditCardPayoffs: pure historical-record
      // inserts, no balance shift — same reasoning as Transfers. ----
      for (const row of data.LoanPayments ?? []) {
        const loanAccountId = accountIdByName.get(String(row.LoanAccountName));
        const counterpartAccountId = accountIdByName.get(
          String(row.CounterpartAccountName),
        );
        const currencyId = currencyIdByCode.get(String(row.CurrencyCode));
        if (
          loanAccountId == null ||
          counterpartAccountId == null ||
          currencyId == null
        ) {
          continue;
        }
        await tx.insert(loanPayments).values({
          loanAccountId,
          counterpartAccountId,
          amount: Number(row.Amount),
          currencyId,
          date: String(row.Date),
          createdAt: dateOnlyToEpoch(String(row.CreatedAt ?? '')),
        });
      }
      rowCounts.LoanPayments = data.LoanPayments?.length ?? 0;

      for (const row of data.CreditCardPayoffs ?? []) {
        const creditCardAccountId = accountIdByName.get(
          String(row.CreditCardAccountName),
        );
        const payingAccountId = accountIdByName.get(
          String(row.PayingAccountName),
        );
        const currencyId = currencyIdByCode.get(String(row.CurrencyCode));
        if (
          creditCardAccountId == null ||
          payingAccountId == null ||
          currencyId == null
        ) {
          continue;
        }
        await tx.insert(creditCardPayoffs).values({
          creditCardAccountId,
          payingAccountId,
          amount: Number(row.Amount),
          currencyId,
          date: String(row.Date),
          createdAt: dateOnlyToEpoch(String(row.CreatedAt ?? '')),
        });
      }
      rowCounts.CreditCardPayoffs = data.CreditCardPayoffs?.length ?? 0;

      // ---- InstallmentPlans: get-or-create by name. planById keeps
      // the full row (category/currency/monthly/final amounts) for
      // InstallmentPayments below to synthesize a transaction from. ----
      const existingPlans = await tx.select().from(installmentPlans);
      const planIdByName = new Map(existingPlans.map(p => [p.name, p.id]));
      const planById = new Map(existingPlans.map(p => [p.id, p]));
      for (const row of data.InstallmentPlans ?? []) {
        const name = String(row.Name);
        if (planIdByName.has(name)) {
          continue;
        }
        const categoryId = await getOrCreateCategoryId(
          String(row.CategoryName),
        );
        const currencyId = currencyIdByCode.get(String(row.CurrencyCode));
        if (currencyId == null) {
          continue;
        }
        const [created] = await tx
          .insert(installmentPlans)
          .values({
            name,
            principalAmount:
              row.PrincipalAmount === '' || row.PrincipalAmount == null
                ? null
                : Number(row.PrincipalAmount),
            interestRate:
              row.InterestRate === '' || row.InterestRate == null
                ? null
                : Number(row.InterestRate),
            numberOfMonths: Number(row.NumberOfMonths),
            monthlyAmount: Number(row.MonthlyAmount),
            finalInstallmentAmount: Number(row.FinalInstallmentAmount),
            totalRepayable: Number(row.TotalRepayable),
            categoryId,
            currencyId,
            startDate: String(row.StartDate),
            dueDayOfMonth:
              row.DueDayOfMonth === '' || row.DueDayOfMonth == null
                ? null
                : Number(row.DueDayOfMonth),
            createdAt: dateOnlyToEpoch(String(row.CreatedAt ?? '')),
          })
          .returning();
        planIdByName.set(name, created.id);
        planById.set(created.id, created);
      }
      rowCounts.InstallmentPlans = data.InstallmentPlans?.length ?? 0;

      // ---- InstallmentPayments: synthesizes the Transaction row this
      // sheet carries no reference to (see utils/exportFormat.ts's own
      // comment — (PlanName, InstallmentNumber) was already a unique
      // key, so nothing else needed to be exported to identify a row).
      // The real DB unique index on (installmentPlanId,
      // installmentNumber) means a re-imported MERGE file must skip a
      // payment already recorded rather than throw. ----
      for (const row of data.InstallmentPayments ?? []) {
        const planId = planIdByName.get(String(row.PlanName));
        const accountId = accountIdByName.get(String(row.AccountName));
        const plan = planId != null ? planById.get(planId) : undefined;
        if (planId == null || accountId == null || !plan) {
          continue;
        }
        const installmentNumber = Number(row.InstallmentNumber);
        const [existingPayment] = await tx
          .select()
          .from(installmentPayments)
          .where(
            and(
              eq(installmentPayments.installmentPlanId, planId),
              eq(installmentPayments.installmentNumber, installmentNumber),
            ),
          )
          .limit(1);
        if (existingPayment) {
          continue;
        }
        const amount =
          installmentNumber === plan.numberOfMonths
            ? plan.finalInstallmentAmount
            : plan.monthlyAmount;
        const paidDate = String(row.PaidDate);
        const [createdTxn] = await tx
          .insert(transactions)
          .values({
            accountId,
            amount,
            categoryId: plan.categoryId,
            description: `Installment ${installmentNumber}/${plan.numberOfMonths} — ${plan.name}`,
            date: paidDate,
            entryType: 'Expense',
            currencyId: plan.currencyId,
            excludeFromBudget: false,
            createdAt: dateOnlyToEpoch(String(row.CreatedAt ?? '') || paidDate),
          })
          .returning();
        await tx.insert(installmentPayments).values({
          installmentPlanId: planId,
          installmentNumber,
          accountId,
          transactionId: createdTxn.id,
          paidDate,
          createdAt: dateOnlyToEpoch(String(row.CreatedAt ?? '')),
        });
      }
      rowCounts.InstallmentPayments = data.InstallmentPayments?.length ?? 0;

      // ---- RecurringRules: get-or-create by name. ruleById keeps the
      // full row for RecurringOccurrences below. ----
      const existingRules = await tx.select().from(recurringRules);
      const ruleIdByName = new Map(existingRules.map(r => [r.name, r.id]));
      const ruleById = new Map(existingRules.map(r => [r.id, r]));
      for (const row of data.RecurringRules ?? []) {
        const name = String(row.Name);
        if (ruleIdByName.has(name)) {
          continue;
        }
        const ruleType = row.RuleType === 'Income' ? 'Income' : 'Expense';
        const categoryName = String(row.CategoryName ?? '');
        const categoryId =
          ruleType === 'Income' || !categoryName
            ? null
            : await getOrCreateCategoryId(categoryName);
        const accountId = accountIdByName.get(String(row.AccountName));
        const currencyId = currencyIdByCode.get(String(row.CurrencyCode));
        if (accountId == null || currencyId == null) {
          continue;
        }
        const [created] = await tx
          .insert(recurringRules)
          .values({
            name,
            ruleType,
            amount: Number(row.Amount),
            dayOfMonth: Number(row.DayOfMonth),
            categoryId,
            accountId,
            currencyId,
            active: Boolean(row.Active),
            createdAt: dateOnlyToEpoch(String(row.CreatedAt ?? '')),
          })
          .returning();
        ruleIdByName.set(name, created.id);
        ruleById.set(created.id, created);
      }
      rowCounts.RecurringRules = data.RecurringRules?.length ?? 0;

      // ---- RecurringOccurrences: synthesizes a Transaction for every
      // 'confirmed' row, the same way InstallmentPayments does above —
      // a confirmed occurrence created a real transaction at the time
      // it was confirmed, but (RuleName, DueDate) was already this
      // sheet's unique key, so no transaction reference was ever
      // exported. The unique index on (recurringRuleId, dueDate) means
      // a re-imported MERGE file must skip an occurrence already
      // recorded. 'skipped'/'pending' rows never get a transactionId. ----
      for (const row of data.RecurringOccurrences ?? []) {
        const ruleId = ruleIdByName.get(String(row.RuleName));
        const rule = ruleId != null ? ruleById.get(ruleId) : undefined;
        if (ruleId == null || !rule) {
          continue;
        }
        const dueDate = String(row.DueDate);
        const [existingOccurrence] = await tx
          .select()
          .from(recurringOccurrences)
          .where(
            and(
              eq(recurringOccurrences.recurringRuleId, ruleId),
              eq(recurringOccurrences.dueDate, dueDate),
            ),
          )
          .limit(1);
        if (existingOccurrence) {
          continue;
        }
        const status = String(row.Status) as
          | 'pending'
          | 'confirmed'
          | 'skipped';
        let transactionId: number | null = null;
        const confirmedAmount =
          row.ConfirmedAmount === '' || row.ConfirmedAmount == null
            ? null
            : Number(row.ConfirmedAmount);
        if (status === 'confirmed' && confirmedAmount != null) {
          const [createdTxn] = await tx
            .insert(transactions)
            .values({
              accountId: rule.accountId,
              amount: confirmedAmount,
              categoryId: rule.categoryId,
              description: `Recurring — ${rule.name}`,
              date: dueDate,
              entryType: rule.ruleType,
              currencyId: rule.currencyId,
              excludeFromBudget: false,
              createdAt: dateOnlyToEpoch(dueDate),
            })
            .returning();
          transactionId = createdTxn.id;
        }
        await tx.insert(recurringOccurrences).values({
          recurringRuleId: ruleId,
          dueDate,
          status,
          transactionId,
          confirmedAmount,
          resolvedAt: String(row.ResolvedAt ?? '') || null,
        });
      }
      rowCounts.RecurringOccurrences = data.RecurringOccurrences?.length ?? 0;

      // ---- SavingsGoals: get-or-create by name. goalIdByName keeps the
      // map for SavingsContributions below. ----
      const existingGoals = await tx.select().from(savingsGoals);
      const goalIdByName = new Map(existingGoals.map(g => [g.name, g.id]));
      for (const row of data.SavingsGoals ?? []) {
        const name = String(row.Name);
        if (goalIdByName.has(name)) {
          continue;
        }
        const currencyId = currencyIdByCode.get(String(row.CurrencyCode));
        if (currencyId == null) {
          continue;
        }
        const status = (String(row.Status) || 'active') as
          | 'active'
          | 'achieved'
          | 'abandoned';
        const [created] = await tx
          .insert(savingsGoals)
          .values({
            name,
            targetAmount: Number(row.TargetAmount),
            currencyId,
            targetDate: String(row.TargetDate ?? '') || null,
            status,
            createdAt: dateOnlyToEpoch(String(row.CreatedAt ?? '')),
          })
          .returning();
        goalIdByName.set(name, created.id);
      }
      rowCounts.SavingsGoals = data.SavingsGoals?.length ?? 0;

      // ---- SavingsContributions: pure event-log insert, same as
      // Transfers/LoanPayments/CreditCardPayoffs — never linked to any
      // account or transaction (see savings_contributions' own schema
      // comment), so there's nothing to dedupe or balance-shift here. ----
      for (const row of data.SavingsContributions ?? []) {
        const goalId = goalIdByName.get(String(row.GoalName));
        if (goalId == null) {
          continue;
        }
        await tx.insert(savingsContributions).values({
          savingsGoalId: goalId,
          amount: Number(row.Amount),
          date: String(row.Date),
          note: String(row.Note ?? '') || null,
          createdAt: dateOnlyToEpoch(String(row.CreatedAt ?? '')),
        });
      }
      rowCounts.SavingsContributions = data.SavingsContributions?.length ?? 0;
    });

    return rowCounts;
  } catch (error) {
    console.error('importData: failed to apply import', mode, error);
    throw error;
  }
}
