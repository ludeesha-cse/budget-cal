import { and, desc, eq, inArray, like, sql } from 'drizzle-orm';
import { db } from './index';
import {
  accountBalances,
  accounts,
  budgets,
  categories,
  categoryBudgets,
  currencies,
  transactions,
} from './schema';

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
};

export type NewAccount = {
  name: string;
  type: string;
  openingBalance: number;
};

//If a backend is added later, replace this with a fetch() call
// to GET /api/transactions, keeping the same return type.
export async function getTransactions() {
  return db.select().from(transactions);
}

//  If a backend is added later, replace this with a fetch() call
// to POST /api/transactions, keeping the same input/return shape.
export async function addTransaction(data: NewTransaction) {
  return db
    .insert(transactions)
    .values({
      ...data,
      createdAt: Date.now(),
    })
    .returning();
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
  return db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      amount: transactions.amount,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      description: transactions.description,
      date: transactions.date,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(like(transactions.date, `${month}%`));
}

//If a backend is added later, replace this with a fetch() call
// to GET /api/transactions?year=YYYY, keeping the same return type.
export async function getTransactionsByYear(year: string) {
  return db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      amount: transactions.amount,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      description: transactions.description,
      date: transactions.date,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(like(transactions.date, `${year}%`));
}

//If a backend is added later, replace this with a fetch() call
// to GET /api/transactions/summary?month=YYYY-MM&groupBy=category, keeping
// the same return shape.
export async function getExpensesByType(month: string) {
  return db
    .select({
      type: categories.name,
      total: sql<number>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(like(transactions.date, `${month}%`))
    .groupBy(categories.name);
}

//If a backend is added later, replace this with a fetch() call
// to GET /api/transactions/summary?month=YYYY-MM&total=1, keeping the same
// return shape.
export async function getMonthlyTotal(month: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`sum(${transactions.amount})` })
    .from(transactions)
    .where(like(transactions.date, `${month}%`));
  return row?.total ?? 0;
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
// /api/transactions/:id), keeping the same input/return shape.
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
// /api/transactions/:id), keeping the same return shape.
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

async function getTotalSpentForAccount(accountId: number): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`sum(${transactions.amount})` })
    .from(transactions)
    .where(eq(transactions.accountId, accountId));
  return row?.total ?? 0;
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/accounts/:id/balance?currencyId=, keeping the same
// return type. Replaces the single-currency version from Stage 4b/7a —
// returns the balance for one specific (account, currency) pair: that
// currency's stored balance minus everything spent from the account so
// far. Spending isn't currency-tagged yet (that's Stage 7c), so the same
// account-wide spent total is applied regardless of which currency is
// asked for; this is a known simplification until transactions carry a
// currency of their own.
export async function getAccountBalance(
  accountId: number,
  currencyId: number,
): Promise<number> {
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
  const spent = await getTotalSpentForAccount(accountId);
  return openingBalance - spent;
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

// If a backend is added later, replace this with fetch(POST
// /api/accounts/:id/settle), keeping the same return type. Settling a
// credit card doesn't delete its transaction history — it raises the
// account's opening balance to match what's been spent so far, so the
// computed balance (and debt) resets to zero going forward.
export async function settleCreditCardAccount(
  accountId: number,
): Promise<Account> {
  const spent = await getTotalSpentForAccount(accountId);
  return updateAccount(accountId, { openingBalance: spent });
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
// Nothing calls this yet — it exists for Stage 9's Liability/Receivable
// reuse flow, which reopens a closed account instead of creating a new
// one once its old loan is settled.
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
