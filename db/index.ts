import { open } from '@op-engineering/op-sqlite';
import { drizzle } from 'drizzle-orm/op-sqlite';
import { migrate } from 'drizzle-orm/op-sqlite/migrator';
import migrations from '../drizzle/migrations';
import { categories } from './schema';

const opsqliteDb = open({ name: 'budget-tracker.db' });

export const db = drizzle(opsqliteDb);

const DEFAULT_CATEGORIES = [
  'Food',
  'Transport',
  'Bills',
  'Entertainment',
  'Other',
] as const;

// If a backend is added later, replace this with a fetch() call to
// GET/POST /api/categories/seed-defaults, keeping the same behavior:
// only seed when the categories table is empty.
async function seedDefaultCategories(): Promise<void> {
  const existing = await db.select().from(categories).limit(1);
  if (existing.length > 0) {
    return;
  }
  const now = Date.now();
  await db
    .insert(categories)
    .values(DEFAULT_CATEGORIES.map(name => ({ name, createdAt: now })));
}

export async function runMigrations(): Promise<void> {
  await migrate(db, migrations);
  await seedDefaultCategories();
}
