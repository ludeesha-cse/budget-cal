import { open } from '@op-engineering/op-sqlite';
import { drizzle } from 'drizzle-orm/op-sqlite';
import { migrate } from 'drizzle-orm/op-sqlite/migrator';
import migrations from '../drizzle/migrations';

const opsqliteDb = open({ name: 'budget-tracker.db' });

export const db = drizzle(opsqliteDb);

export async function runMigrations(): Promise<void> {
  await migrate(db, migrations);
}
