import { db } from './index';
import { transactions } from './schema';

export type NewTransaction = {
  accountId: number;
  amount: number;
  category: string;
  description?: string;
  date: number;
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
