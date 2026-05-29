import { and, desc, eq } from 'drizzle-orm';
import { db } from '../index';
import {
  budgets,
  categories,
  categoryBudgets,
} from '../schema';

type Budget = typeof budgets.$inferSelect;

type CategoryBudget = typeof categoryBudgets.$inferSelect;

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

