import { eq } from 'drizzle-orm';
import { open } from '@op-engineering/op-sqlite';
import { drizzle } from 'drizzle-orm/op-sqlite';
import { migrate } from 'drizzle-orm/op-sqlite/migrator';
import migrations from '../drizzle/migrations';
import { accountBalances, accounts, categories, currencies } from './schema';

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

const DEFAULT_CURRENCIES = [
  { code: 'LKR', name: 'Sri Lankan Rupee', isDefault: true },
  { code: 'USD', name: 'US Dollar', isDefault: false },
  { code: 'GBP', name: 'British Pound', isDefault: false },
  { code: 'EUR', name: 'Euro', isDefault: false },
  { code: 'AUD', name: 'Australian Dollar', isDefault: false },
  { code: 'USDT', name: 'Tether', isDefault: false }, // kept strictly separate from USD, never converted
] as const;

// Stage 7 dropped accounts.balance in favor of per-currency rows in
// account_balances. Legacy account types don't map 1:1 onto the new
// account types, so this table records the best-guess remap; anything
// landing here gets a console warning so it can be verified by hand.
const LEGACY_TYPE_REMAP: Record<string, string> = {
  Card: 'CreditCard',
};

// Reads each account's old `balance` value straight out of SQLite via a
// raw query, before `migrate()` runs the schema migration that drops the
// accounts.balance column. Must run first, or the value is gone for good.
// Safe to call on a fresh install (no accounts table yet) or on an
// already-migrated database (no balance column left) — both cases just
// return an empty map.
async function captureLegacyAccountBalances(): Promise<Map<number, number>> {
  const legacyBalances = new Map<number, number>();
  try {
    const tableInfo = await opsqliteDb.execute("PRAGMA table_info('accounts')");
    const hasBalanceColumn = tableInfo.rows.some(
      row => row.name === 'balance',
    );
    if (!hasBalanceColumn) {
      return legacyBalances;
    }
    const result = await opsqliteDb.execute('SELECT id, balance FROM accounts');
    for (const row of result.rows) {
      legacyBalances.set(Number(row.id), Number(row.balance));
    }
  } catch (error) {
    console.warn('Could not capture legacy account balances:', error);
  }
  return legacyBalances;
}

// One-time data migration, run after the schema migration. Gated on
// `currencies` being empty so it only ever does its work once, even
// though it runs on every app start. Seeds the fixed currency list,
// carries each account's captured legacy balance into account_balances
// under LKR, and remaps legacy account `type` values.
async function runCurrencyMigration(
  legacyBalances: Map<number, number>,
): Promise<void> {
  const existingCurrencies = await db.select().from(currencies).limit(1);
  if (existingCurrencies.length > 0) {
    return;
  }

  const now = Date.now();
  await db.insert(currencies).values(
    DEFAULT_CURRENCIES.map(currency => ({
      code: currency.code,
      name: currency.name,
      isDefault: currency.isDefault,
      createdAt: now,
    })),
  );

  if (legacyBalances.size > 0) {
    const [lkr] = await db
      .select()
      .from(currencies)
      .where(eq(currencies.code, 'LKR'))
      .limit(1);
    if (lkr) {
      await db.insert(accountBalances).values(
        Array.from(legacyBalances.entries()).map(([accountId, balance]) => ({
          accountId,
          currencyId: lkr.id,
          balance,
        })),
      );
    }
  }

  const allAccounts = await db.select().from(accounts);
  for (const account of allAccounts) {
    const remappedType = LEGACY_TYPE_REMAP[account.type];
    if (remappedType) {
      console.warn(
        `[currency migration] Remapped account "${account.name}" ` +
          `(id=${account.id}) type "${account.type}" -> "${remappedType}". ` +
          'Please verify manually.',
      );
      await db
        .update(accounts)
        .set({ type: remappedType })
        .where(eq(accounts.id, account.id));
    }
  }
}

export async function runMigrations(): Promise<void> {
  const legacyBalances = await captureLegacyAccountBalances();
  await migrate(db, migrations);
  await seedDefaultCategories();
  await runCurrencyMigration(legacyBalances);
}
