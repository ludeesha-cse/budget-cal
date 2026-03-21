import { and, desc, eq, inArray, like, sql } from 'drizzle-orm';
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
  loanDetails,
  loanPayments,
  transactions,
  transfers,
} from './schema';
import { getCurrentDateString } from '../utils/date';
import { getTotalOwed } from '../utils/interestCalculations';
import { getBalanceDelta } from '../utils/balanceMath';

const RESERVED_BANK_CATEGORY_NAME = 'Bank';

type Budget = typeof budgets.$inferSelect;
type Transaction = typeof transactions.$inferSelect;
type Account = typeof accounts.$inferSelect;
type Category = typeof categories.$inferSelect;
type CategoryBudget = typeof categoryBudgets.$inferSelect;
type Currency = typeof currencies.$inferSelect;

export type NewTransaction = {
  accountId: number;
  amount: number;
  categoryId: number;
  description?: string;
  date: string; // 'YYYY-MM-DD'
  entryType: 'Expense' | 'Income';
  currencyId: number;
};

// No categoryId — Income entries carry no category at all, by design
// (the dedicated Income tab has no category picker anywhere in it).
export type NewIncome = {
  date: string; // 'YYYY-MM-DD'
  amount: number;
  description?: string;
  accountId: number;
  currencyId: number;
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
        amount: transactions.amount,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        description: transactions.description,
        date: transactions.date,
        entryType: transactions.entryType,
        currencyId: transactions.currencyId,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
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
        amount: transactions.amount,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        description: transactions.description,
        date: transactions.date,
        entryType: transactions.entryType,
        currencyId: transactions.currencyId,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
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
export async function getMonthlyTotal(month: string): Promise<number> {
  try {
    const [row] = await db
      .select({ total: sql<number>`sum(${transactions.amount})` })
      .from(transactions)
      .where(
        and(
          like(transactions.date, `${month}%`),
          eq(transactions.entryType, 'Expense'),
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
// keeping the same return shape. Mirrors getMonthlyTotal but for Income.
export async function getMonthlyIncome(month: string): Promise<number> {
  try {
    const [row] = await db
      .select({ total: sql<number>`sum(${transactions.amount})` })
      .from(transactions)
      .where(
        and(
          like(transactions.date, `${month}%`),
          eq(transactions.entryType, 'Income'),
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
