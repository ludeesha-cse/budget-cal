import { eq, sql } from 'drizzle-orm';
import { db } from '../index';
import {
  categories,
  transactions,
} from '../schema';

type Category = typeof categories.$inferSelect;

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

