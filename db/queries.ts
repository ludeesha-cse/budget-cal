import { eq, like, sql } from 'drizzle-orm';
import { db } from './index';
import { accounts, budgets, transactions } from './schema';

type Budget = typeof budgets.$inferSelect;
type Transaction = typeof transactions.$inferSelect;

export type NewTransaction = {
  accountId: number;
  amount: number;
  category: string;
  description?: string;
  date: string; // 'YYYY-MM-DD'
};

// NETWORK-READY: currently reads directly from the local Drizzle/op-sqlite
// database. If a backend is added later, replace this with a fetch() call
// to GET /api/transactions, keeping the same return type.
export async function getTransactions() {
  return db.select().from(transactions);
}

// NETWORK-READY: currently writes directly to the local Drizzle/op-sqlite
// database. If a backend is added later, replace this with a fetch() call
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

// NETWORK-READY: currently checks/writes directly to the local
// Drizzle/op-sqlite database. If a backend is added later, replace this
// with a fetch() call to GET/POST /api/accounts/default, keeping the same
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

// NETWORK-READY: currently reads directly from the local Drizzle/op-sqlite
// database. If a backend is added later, replace this with a fetch() call
// to GET /api/transactions?month=YYYY-MM, keeping the same return type.
export async function getTransactionsByMonth(month: string) {
  return db
    .select()
    .from(transactions)
    .where(like(transactions.date, `${month}%`));
}

// NETWORK-READY: currently reads directly from the local Drizzle/op-sqlite
// database. If a backend is added later, replace this with a fetch() call
// to GET /api/transactions?year=YYYY, keeping the same return type.
export async function getTransactionsByYear(year: string) {
  return db
    .select()
    .from(transactions)
    .where(like(transactions.date, `${year}%`));
}

// NETWORK-READY: currently reads directly from the local Drizzle/op-sqlite
// database. If a backend is added later, replace this with a fetch() call
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

// NETWORK-READY: currently reads directly from the local Drizzle/op-sqlite
// database. If a backend is added later, replace this with a fetch() call
// to GET /api/transactions/summary?month=YYYY-MM&total=1, keeping the same
// return shape.
export async function getMonthlyTotal(month: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`sum(${transactions.amount})` })
    .from(transactions)
    .where(like(transactions.date, `${month}%`));
  return row?.total ?? 0;
}

// NETWORK-READY: currently reads directly from the local Drizzle/op-sqlite
// database. If a backend is added later, replace this with a fetch() call
// to GET /api/budgets?month=YYYY-MM, keeping the same return type.
export async function getBudgetForMonth(month: string): Promise<Budget | null> {
  const [budget] = await db
    .select()
    .from(budgets)
    .where(eq(budgets.month, month))
    .limit(1);
  return budget ?? null;
}

// NETWORK-READY: currently reads directly from the local Drizzle/op-sqlite
// database. If a backend is added later, replace this with a fetch() call
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

// NETWORK-READY: currently writes directly to the local Drizzle/op-sqlite
// database. If a backend is added later, replace this with fetch(PATCH
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

// NETWORK-READY: currently writes directly to the local Drizzle/op-sqlite
// database. If a backend is added later, replace this with fetch(DELETE
// /api/transactions/:id), keeping the same return shape.
export async function deleteTransaction(id: number) {
  return db.delete(transactions).where(eq(transactions.id, id)).returning();
}
