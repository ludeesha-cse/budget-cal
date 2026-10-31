// First-run setup against a real (in-memory) SQLite: the success path,
// the zero-balance and missing-wallet edge cases, and — the point of the
// one-transaction design — that a failure part-way through leaves
// NOTHING behind.
import { bootDatabase, testClient } from './helpers/dbTestSetup';

jest.mock('@op-engineering/op-sqlite', () => ({
  open: () => require('./helpers/dbTestSetup').testClient(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const queries = () => require('../db/queries');

async function currencyId(code: string): Promise<number> {
  const rows = await queries().getCurrencies();
  const row = rows.find((c: { code: string }) => c.code === code);
  if (!row) {
    throw new Error(`test setup: no ${code} currency seeded`);
  }
  return row.id;
}

async function walletBalances() {
  const wallet = await queries().findDefaultWallet();
  return wallet ? queries().getAccountBalances(wallet.id) : [];
}

beforeAll(async () => {
  await bootDatabase();
});

afterEach(() => {
  // Undo the deliberate breakage some tests cause, then reset state the
  // next test depends on.
  testClient().exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      onboarding_completed integer DEFAULT false NOT NULL,
      default_currency_confirmed integer DEFAULT false NOT NULL
    );
  `);
  testClient().exec(`
    DELETE FROM account_balances;
    UPDATE app_meta SET default_currency_confirmed = 0;
  `);
});

describe('async transactions (db/asyncTransaction.ts)', () => {
  test('an error thrown after an await rolls back every earlier write', async () => {
    const { db } = require('../db');
    const { tags } = require('../db/schema');
    await expect(
      db.transaction(async (tx: any) => {
        await tx.insert(tags).values({ name: 'rolled-back-1', createdAt: 1 });
        await tx.insert(tags).values({ name: 'rolled-back-2', createdAt: 2 });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const remaining = await queries().getTags();
    expect(remaining.map((t: { name: string }) => t.name)).not.toContain(
      'rolled-back-1',
    );
    expect(remaining.map((t: { name: string }) => t.name)).not.toContain(
      'rolled-back-2',
    );
  });

  test('concurrent transactions are queued, not nested', async () => {
    const { db } = require('../db');
    const { tags } = require('../db/schema');
    await Promise.all(
      ['queued-a', 'queued-b', 'queued-c'].map(name =>
        db.transaction(async (tx: any) => {
          await tx.insert(tags).values({ name, createdAt: 1 });
        }),
      ),
    );
    const names = (await queries().getTags()).map(
      (t: { name: string }) => t.name,
    );
    expect(names).toEqual(expect.arrayContaining(['queued-a', 'queued-b', 'queued-c']));
  });
});

describe('completeFirstRunSetup', () => {
  test('writes the wallet balance, confirms the currency and finishes setup', async () => {
    const lkr = await currencyId('LKR');
    await queries().completeFirstRunSetup({
      defaultCurrencyId: lkr,
      walletCurrencyId: lkr,
      openingBalance: 5000,
    });

    const balances = await walletBalances();
    expect(balances).toHaveLength(1);
    expect(balances[0]).toMatchObject({ currencyCode: 'LKR', balance: 5000 });
    const meta = await queries().getAppMeta();
    expect(meta.defaultCurrencyConfirmed).toBe(true);
    expect((await queries().getDefaultCurrency()).code).toBe('LKR');
    const status = await queries().getDefaultWalletStatus();
    expect(status.needsSetup).toBe(false);
  });

  test('a zero opening balance still writes a balance row', async () => {
    const lkr = await currencyId('LKR');
    await queries().completeFirstRunSetup({
      defaultCurrencyId: lkr,
      walletCurrencyId: lkr,
      openingBalance: 0,
    });
    const balances = await walletBalances();
    expect(balances).toHaveLength(1);
    expect(balances[0].balance).toBe(0);
  });

  test('the wallet can hold a different currency from the default, and it stays enabled', async () => {
    const lkr = await currencyId('LKR');
    const usd = await currencyId('USD');
    await queries().completeFirstRunSetup({
      defaultCurrencyId: lkr,
      walletCurrencyId: usd,
      openingBalance: 120,
    });
    const balances = await walletBalances();
    expect(balances[0]).toMatchObject({ currencyCode: 'USD', balance: 120 });
    const active = (await queries().getActiveCurrencies()).map(
      (c: { code: string }) => c.code,
    );
    expect(active).toEqual(expect.arrayContaining(['LKR', 'USD']));
    expect((await queries().getDefaultCurrency()).code).toBe('LKR');
  });

  test('recreates the wallet when it is missing instead of crashing', async () => {
    const lkr = await currencyId('LKR');
    testClient().exec(
      "DELETE FROM accounts WHERE name = 'Cash in wallet' AND type = 'Cash'",
    );
    expect(await queries().findDefaultWallet()).toBeNull();

    await queries().completeFirstRunSetup({
      defaultCurrencyId: lkr,
      walletCurrencyId: lkr,
      openingBalance: 250,
    });
    const wallet = await queries().findDefaultWallet();
    expect(wallet).toMatchObject({ name: 'Cash in wallet', type: 'Cash', active: true });
    expect((await walletBalances())[0].balance).toBe(250);
  });

  test('an older install with wallet history ends up with exactly the amount typed', async () => {
    const lkr = await currencyId('LKR');
    const wallet = await queries().findDefaultWallet();
    // Wallet already set up the old way: baseline 5,000 and a 1,000
    // expense recorded against it (current balance 4,000).
    testClient().exec(
      `INSERT INTO account_balances (account_id, currency_id, balance) VALUES (${wallet.id}, ${lkr}, 5000)`,
    );
    const food = (await queries().getCategories()).find(
      (c: { name: string }) => c.name === 'Food',
    );
    testClient().exec(
      `INSERT INTO transactions (account_id, amount, category_id, date, entry_type, currency_id, exclude_from_budget, created_at)
       VALUES (${wallet.id}, 1000, ${food.id}, '2026-10-01', 'Expense', ${lkr}, 0, 1)`,
    );

    await queries().completeFirstRunSetup({
      defaultCurrencyId: lkr,
      walletCurrencyId: lkr,
      openingBalance: 2000,
    });
    expect(await queries().getAccountBalance(wallet.id, lkr)).toBe(2000);
    testClient().exec('DELETE FROM transactions');
  });

  test('rolls back everything when the last step fails', async () => {
    const lkr = await currencyId('LKR');
    const usd = await currencyId('USD');
    const defaultBefore = (await queries().getDefaultCurrency()).id;
    // The final step (marking setup complete) needs app_meta; without it
    // the write fails AFTER the wallet balance and the currency changes
    // have already been made inside the transaction.
    testClient().exec('DROP TABLE app_meta');

    await expect(
      queries().completeFirstRunSetup({
        defaultCurrencyId: usd,
        walletCurrencyId: usd,
        openingBalance: 5000,
      }),
    ).rejects.toMatchObject({
      code: 'STORAGE',
      message: queries().FIRST_RUN_NOT_SAVED_MESSAGE,
    });

    expect(await walletBalances()).toHaveLength(0);
    expect((await queries().getDefaultCurrency()).id).toBe(defaultBefore);
    expect(defaultBefore).toBe(lkr);
  });

  test('refuses a negative opening balance without writing anything', async () => {
    const lkr = await currencyId('LKR');
    await expect(
      queries().completeFirstRunSetup({
        defaultCurrencyId: lkr,
        walletCurrencyId: lkr,
        openingBalance: -5,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION', field: 'openingBalance' });
    expect(await walletBalances()).toHaveLength(0);
  });
});
