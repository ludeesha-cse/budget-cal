import { desc, eq, like, sql } from 'drizzle-orm';
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
