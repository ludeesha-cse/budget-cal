import { sqliteTable, int, integer } from 'drizzle-orm/sqlite-core';
import { drizzle } from 'drizzle-orm/sqlite-proxy';

const appMeta = sqliteTable('app_meta', {
  id: int('id').primaryKey({ autoIncrement: true }),
  onboardingCompleted: integer('onboarding_completed', { mode: 'boolean' }).notNull().default(false),
  defaultCurrencyConfirmed: integer('default_currency_confirmed', { mode: 'boolean' }).notNull().default(false),
});

const db = drizzle(async () => ({ rows: [] }));
console.log('values({})         ->', JSON.stringify(db.insert(appMeta).values({}).toSQL()));
console.log('values({onb:true}) ->', JSON.stringify(db.insert(appMeta).values({ onboardingCompleted: true }).toSQL()));
console.log('values({both})     ->', JSON.stringify(db.insert(appMeta).values({ onboardingCompleted: true, defaultCurrencyConfirmed: true }).toSQL()));
