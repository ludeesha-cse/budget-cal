import { eq } from 'drizzle-orm';
import { open } from '@op-engineering/op-sqlite';
import { drizzle } from 'drizzle-orm/op-sqlite';
import { migrate } from 'drizzle-orm/op-sqlite/migrator';
import migrations from '../drizzle/migrations';
import {
  accountBalances,
  accounts,
  appMeta,
  appSettings,
  categories,
  currencies,
  savingsGoals,
  tags,
} from './schema';
import { DEFAULT_PALETTE_ID } from '../theme/palettes';
import { installAsyncTransactions } from './asyncTransaction';

// Must run before anything calls db.transaction — see
// db/asyncTransaction.ts for why drizzle's own op-sqlite transaction is
// not atomic.
installAsyncTransactions();

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

const RESERVED_BANK_CATEGORY_NAME = 'Bank';

// Stage 8's updateAccountBalanceWithAudit tags every balance-correction
// entry with this category so they're easy to pick out from ordinary
// spending later. Checked by name specifically, not by table-emptiness
// like seedDefaultCategories — this needs to exist even on databases
// that already have their five original categories from Stage 5.
//
// Also responsible for isSystemReserved being true on this row: on a
// fresh install the insert below sets it directly, but a database that
// already has a "Bank" category from before that column existed would
// otherwise sit at the integer default (false) forever — the free-tier
// category count needs the flag set correctly either way, so an
// existing row gets updated in place rather than left stale or
// duplicated.
async function seedReservedBankCategory(): Promise<void> {
  const [existing] = await db
    .select()
    .from(categories)
    .where(eq(categories.name, RESERVED_BANK_CATEGORY_NAME))
    .limit(1);
  if (existing) {
    if (!existing.isSystemReserved) {
      await db
        .update(categories)
        .set({ isSystemReserved: true })
        .where(eq(categories.id, existing.id));
    }
    return;
  }
  await db.insert(categories).values({
    name: RESERVED_BANK_CATEGORY_NAME,
    isSystemReserved: true,
    createdAt: Date.now(),
  });
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
      // Only the seed default starts active — multiple active currencies
      // is a premium feature (see canAddCurrency in
      // utils/entitlementChecks.ts), so a fresh install shouldn't start
      // free users out with every currency already enabled. The rest stay
      // available to enable later via DefaultCurrencyScreen/CurrenciesScreen.
      active: currency.isDefault,
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

// app_meta is a singleton too (see db/schema.ts), holding the two
// first-launch latches the root navigation gate reads. Seeded here —
// immediately after runCurrencyMigration above, so the very first launch
// has both its currency list and its "have we onboarded yet" answer
// ready in the same startup pass — using the same table-emptiness gate
// as every other seed* function, so re-running on every app start is a
// no-op after the first.
//
// Both columns are deliberately left to their schema defaults (false)
// rather than passed explicitly: an existing install upgrading into this
// migration gets the same fresh-install starting point, which is the
// intended behavior — someone who has been using the app already has
// simply never seen the onboarding, so showing it once on the upgrade
// launch is correct rather than a bug.
async function seedAppMeta(): Promise<void> {
  const existing = await db.select().from(appMeta).limit(1);
  if (existing.length > 0) {
    return;
  }
  await db.insert(appMeta).values({});
}

// app_settings is a singleton (always exactly one row) holding app-wide
// preferences like the theme. Seeded once here, same pattern as the other
// seed* functions — gated on table-emptiness so re-running on every app
// start stays a no-op after the first.
async function seedAppSettings(): Promise<void> {
  const existing = await db.select().from(appSettings).limit(1);
  if (existing.length > 0) {
    return;
  }
  // paletteId set explicitly (rather than left to the `palette_id` column's
  // own SQL default, which is still the older 'ledger' literal baked into
  // migration 0020) so a fresh install picks up whichever palette
  // theme/palettes.ts currently names DEFAULT_PALETTE_ID without needing a
  // matching schema migration every time that changes.
  await db
    .insert(appSettings)
    .values({ themeMode: 'system', paletteId: DEFAULT_PALETTE_ID });
}

const DEFAULT_TAGS = ['Reimbursable', 'Shared', 'Pending'] as const;

// Stage 15, same table-emptiness gate as seedDefaultCategories — runs on
// every app start but only actually inserts anything the first time the
// `tags` table is empty. Note this means the same as
// seedDefaultCategories: if a user later deletes every tag (all three
// defaults plus anything else they added), the table is empty again and
// the next app start reseeds these three defaults, same as categories.
async function seedDefaultTags(): Promise<void> {
  const existing = await db.select().from(tags).limit(1);
  if (existing.length > 0) {
    return;
  }
  const now = Date.now();
  await db
    .insert(tags)
    .values(DEFAULT_TAGS.map(name => ({ name, createdAt: now })));
}

// Account types that can hold savings — same list as
// SAVEABLE_ACCOUNT_TYPES in db/queries/savingsGoals.ts, repeated here
// rather than imported so this startup path does not pull the whole
// savings query module (and its transitive imports) into the migration
// step.
const SAVINGS_CAPABLE_ACCOUNT_TYPES = ['Bank', 'Cash', 'CryptoWallet'];

// Gives every pre-existing savings goal the account it now requires.
//
// Savings goals used to be pure logs of intent with no account at all;
// they are now backed by a real account whose balance caps their
// progress. Migration 0025 adds the column, but no SQL default can pick
// the RIGHT account for a particular goal, so the choice is made here on
// the upgrade launch, in this order:
//
//   1. an open Bank account that already holds the goal's currency —
//      the overwhelmingly common case, and the closest thing to what the
//      user would have picked themselves;
//   2. any open savings-capable account holding that currency;
//   3. an open Bank account that does NOT hold the currency, with the
//      missing balance row created at zero;
//   4. any open savings-capable account, same zero-balance treatment.
//
// Steps 3 and 4 are the deliberate "force-assign" fallback: a goal with
// no account is a goal the user cannot contribute to, so being attached
// to a plausible account that starts at zero is strictly better than
// being stranded. Such a goal reads as 0 saved until money is actually
// in that account, which is the honest answer — the money for it was
// never anywhere the app could see.
//
// Idempotent and cheap: gated on `account_id IS NULL`, so it does its
// work once and short-circuits on every later app start. A goal it
// cannot place at all (no open accounts whatsoever — practically
// impossible, since ensureDefaultAccount seeds one) is left null and
// surfaced in the UI as needing an account rather than being silently
// broken.
async function backfillSavingsGoalAccounts(): Promise<void> {
  try {
    const unassigned = await db.select().from(savingsGoals);
    const needsAccount = unassigned.filter(goal => goal.accountId == null);
    if (needsAccount.length === 0) {
      return;
    }
    const openAccounts = (await db.select().from(accounts)).filter(
      account =>
        account.active &&
        SAVINGS_CAPABLE_ACCOUNT_TYPES.includes(account.type),
    );
    if (openAccounts.length === 0) {
      console.warn(
        '[savings backfill] No open Bank/Cash/CryptoWallet account exists, so ' +
          `${needsAccount.length} savings goal(s) could not be assigned one. ` +
          'They will prompt for an account in the app.',
      );
      return;
    }
    const balanceRows = await db.select().from(accountBalances);
    const holdersOf = (currencyId: number) =>
      new Set(
        balanceRows
          .filter(row => row.currencyId === currencyId)
          .map(row => row.accountId),
      );

    for (const goal of needsAccount) {
      const holders = holdersOf(goal.currencyId);
      const chosen =
        openAccounts.find(a => a.type === 'Bank' && holders.has(a.id)) ??
        openAccounts.find(a => holders.has(a.id)) ??
        openAccounts.find(a => a.type === 'Bank') ??
        openAccounts[0];
      if (!holders.has(chosen.id)) {
        // Step 3/4: the account does not hold this goal's currency yet.
        // The zero row is what makes the pairing valid everywhere else
        // in the app (validateGoalAccount and the transfer rules both
        // require the holding to exist), and zero is the truthful
        // starting balance.
        await db
          .insert(accountBalances)
          .values({ accountId: chosen.id, currencyId: goal.currencyId, balance: 0 });
        balanceRows.push({
          id: -1,
          accountId: chosen.id,
          currencyId: goal.currencyId,
          balance: 0,
        });
        console.warn(
          `[savings backfill] Goal "${goal.name}" was assigned to ` +
            `"${chosen.name}", which did not hold its currency — added that ` +
            'currency to the account at a zero balance. Please verify.',
        );
      }
      await db
        .update(savingsGoals)
        .set({ accountId: chosen.id })
        .where(eq(savingsGoals.id, goal.id));
    }
  } catch (error) {
    // Non-fatal by design, same reasoning as seedExchangeRates: a goal
    // left without an account renders as needing one, which is a
    // recoverable state the user can fix in two taps. Failing app
    // startup over it would not be.
    console.warn(
      'backfillSavingsGoalAccounts: could not assign accounts to existing goals',
      error,
    );
  }
}

export async function runMigrations(): Promise<void> {
  const legacyBalances = await captureLegacyAccountBalances();
  await migrate(db, migrations);
  await seedDefaultCategories();
  await seedReservedBankCategory();
  await runCurrencyMigration(legacyBalances);
  await seedAppMeta();
  await seedAppSettings();
  await seedDefaultTags();
  // Both of these depend on currencies existing, so they run after
  // runCurrencyMigration rather than beside the other seeds.
  //
  // Imported lazily, not at the top of this file, on purpose: every
  // module under db/queries/ imports `db` FROM here, so a static import
  // in the other direction would make this the first cycle in the
  // module graph — and the one module that must be safe to load before
  // anything else is the one that creates the database handle. Resolving
  // it at call time sidesteps that entirely.
  const { seedExchangeRates } = await import('./queries/exchangeRates');
  await seedExchangeRates();
  await backfillSavingsGoalAccounts();
}
