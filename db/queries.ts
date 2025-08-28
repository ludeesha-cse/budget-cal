import { desc, eq, like, sql } from 'drizzle-orm';
import { db } from './index';
import { accounts, budgets, transactions } from './schema';

type Budget = typeof budgets.$inferSelect;
type Transaction = typeof transactions.$inferSelect;
type Account = typeof accounts.$inferSelect;

export type NewTransaction = {
  accountId: number;
  amount: number;
  category: string;
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
      balance: 0,
      createdAt: Date.now(),
    })
    .returning();
  return account;
}

//  If a backend is added later, replace this with a fetch() call
// to GET /api/transactions?month=YYYY-MM, keeping the same return type.
export async function getTransactionsByMonth(month: string) {
  return db
    .select()
    .from(transactions)
    .where(like(transactions.date, `${month}%`));
}

//If a backend is added later, replace this with a fetch() call
// to GET /api/transactions?year=YYYY, keeping the same return type.
export async function getTransactionsByYear(year: string) {
  return db
    .select()
    .from(transactions)
    .where(like(transactions.date, `${year}%`));
}

//If a backend is added later, replace this with a fetch() call
// to GET /api/transactions/summary?month=YYYY-MM&groupBy=category, keeping
// the same return shape.
export async function getExpensesByType(month: string) {
  return db
    .select({
      type: transactions.category,
      total: sql<number>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .where(like(transactions.date, `${month}%`))
    .groupBy(transactions.category);
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

// If a backend is added later, replace this with a fetch() call to POST
// /api/accounts, keeping the same input/return shape.
export async function addAccount(data: NewAccount): Promise<Account> {
  const [account] = await db
    .insert(accounts)
    .values({
      name: data.name,
      type: data.type,
      balance: data.openingBalance,
      createdAt: Date.now(),
    })
    .returning();
  return account;
}

// If a backend is added later, replace this with fetch(PATCH
// /api/accounts/:id), keeping the same input/return shape.
export async function updateAccount(
  id: number,
  data: Partial<NewAccount>,
): Promise<Account> {
  const { openingBalance, ...rest } = data;
  const [updated] = await db
    .update(accounts)
    .set({
      ...rest,
      ...(openingBalance !== undefined ? { balance: openingBalance } : {}),
    })
    .where(eq(accounts.id, id))
    .returning();
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
  return db.delete(accounts).where(eq(accounts.id, id)).returning();
}

const CREDIT_CARD_TYPE = 'Card';

async function getTotalSpentForAccount(accountId: number): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`sum(${transactions.amount})` })
    .from(transactions)
    .where(eq(transactions.accountId, accountId));
  return row?.total ?? 0;
}

// If a backend is added later, replace this with a fetch() call to GET
// /api/accounts/:id/balance, keeping the same return type.
export async function getAccountBalance(accountId: number): Promise<number> {
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!account) {
    return 0;
  }
  const spent = await getTotalSpentForAccount(accountId);
  return account.balance - spent;
}

// If a backend is added later, replace this with a fetch() call to GET
// /api/accounts/cash-in-hand, keeping the same return type.
export async function getTotalCashInHand(): Promise<number> {
  const allAccounts = await getAccounts();
  const balances = await Promise.all(
    allAccounts.map(account => getAccountBalance(account.id)),
  );
  return balances.reduce((sum, balance) => sum + balance, 0);
}

// If a backend is added later, replace this with a fetch() call to GET
// /api/accounts/credit-card-debt, keeping the same return type. Card
// balances are negative (owed to the bank); debt is shown as the positive
// amount you owe.
export async function getTotalCreditCardDebt(): Promise<number> {
  const cardAccounts = (await getAccounts()).filter(
    account => account.type === CREDIT_CARD_TYPE,
  );
  const balances = await Promise.all(
    cardAccounts.map(account => getAccountBalance(account.id)),
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
