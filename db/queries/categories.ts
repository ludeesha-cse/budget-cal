import { eq, sql } from 'drizzle-orm';
import { db } from '../index';
import { toAppError, validationError } from '../../utils/appErrors';
import { categories, transactions } from '../schema';

type Category = typeof categories.$inferSelect;

// If a backend is added later, replace this with a fetch() call to GET
// /api/categories, keeping the same return type.
export async function getCategories(): Promise<Category[]> {
  return db.select().from(categories);
}

// If a backend is added later, replace this with a fetch() call to POST
// /api/categories, keeping the same input/return shape.
//
// A duplicate name comes back from SQLite as "UNIQUE constraint failed:
// categories.name"; it is rethrown as an AppError that names the
// category the user typed ("A category called 'Food' already exists.").
export async function addCategory(name: string): Promise<Category> {
  try {
    if (!name.trim()) {
      throw validationError('Enter a name for the category.', 'name');
    }
    const [category] = await db
      .insert(categories)
      .values({ name, createdAt: Date.now() })
      .returning();
    return category;
  } catch (error) {
    console.error('addCategory: failed to add category', name, error);
    throw toAppError(error, { entity: 'category', name });
  }
}

// If a backend is added later, replace this with fetch(PATCH
// /api/categories/:id), keeping the same input/return shape.
export async function updateCategory(
  id: number,
  name: string,
): Promise<Category> {
  try {
    if (!name.trim()) {
      throw validationError('Enter a name for the category.', 'name');
    }
    const [updated] = await db
      .update(categories)
      .set({ name })
      .where(eq(categories.id, id))
      .returning();
    if (!updated) {
      throw validationError(
        'That category no longer exists — it may have been deleted.',
      );
    }
    return updated;
  } catch (error) {
    console.error(
      `updateCategory: failed to rename category id=${id}`,
      name,
      error,
    );
    throw toAppError(error, { entity: 'category', name });
  }
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
    throw validationError(
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
