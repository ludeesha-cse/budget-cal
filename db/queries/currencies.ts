import { eq } from 'drizzle-orm';
import { db } from '../index';
import {
  accountBalances,
  currencies,
} from '../schema';

type Currency = typeof currencies.$inferSelect;

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/currencies, keeping the same return type. Returns
// EVERY currency regardless of active state — only the Currencies
// management screen (which needs to list disabled ones too, so they can
// be re-enabled) and a handful of full-history calculations (net worth,
// Excel import validation) should ever call this directly. Any picker or
// tab list a user selects a currency from should call
// getActiveCurrencies() below instead.
export async function getCurrencies(): Promise<Currency[]> {
  return db.select().from(currencies);
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/currencies?active=true, keeping the same return type.
// This is what every currency picker/tab list in the app should read
// from — Reports, ExpensesByType, CategoryBudgets, BudgetSettings,
// Accounts' "Initial currency", and the Loan/Installment/SavingsGoal
// currency pickers. Deliberately a separate function rather than a
// parameter on getCurrencies(), so every call site's intent (all vs.
// active-only) is visible at the call site itself.
export async function getActiveCurrencies(): Promise<Currency[]> {
  return db.select().from(currencies).where(eq(currencies.active, true));
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to POST /api/currencies, keeping the same input/return shape. New
// currencies are never created as the default, but ARE created active —
// a currency someone just went to the trouble of adding by hand is one
// they mean to use right away, not one that starts hidden from every
// picker until they separately go enable it.
export async function addCurrency(
  code: string,
  name: string,
): Promise<Currency> {
  const [currency] = await db
    .insert(currencies)
    .values({ code, name, isDefault: false, active: true, createdAt: Date.now() })
    .returning();
  return currency;
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/currencies/:id/set-active), keeping the same input/return shape.
// Backs the Currencies screen's enable/disable toggle. The default
// currency can never be disabled — the app always needs at least one
// currency every picker can safely fall back to, and "no active default
// currency" is a state nothing else in the app is written to handle.
export async function setCurrencyActive(
  currencyId: number,
  active: boolean,
): Promise<void> {
  try {
    if (!active) {
      const [currency] = await db
        .select()
        .from(currencies)
        .where(eq(currencies.id, currencyId))
        .limit(1);
      if (currency?.isDefault) {
        throw new Error(
          'The default currency can\'t be disabled. Set another currency as default first.',
        );
      }
    }
    await db
      .update(currencies)
      .set({ active })
      .where(eq(currencies.id, currencyId));
  } catch (error) {
    console.error(
      `setCurrencyActive: failed to set active=${active} on currency id=${currencyId}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/currencies/default, keeping the same return type.
export async function getDefaultCurrency(): Promise<Currency | null> {
  const [row] = await db
    .select()
    .from(currencies)
    .where(eq(currencies.isDefault, true))
    .limit(1);
  return row ?? null;
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/currencies/:id/set-default), keeping the same input/return shape.
// Runs inside a single DB transaction so there's never a moment with zero
// or two default currencies — if the second update failed after the
// first succeeded outside a transaction, the app would be left with no
// default at all.
export async function setDefaultCurrency(currencyId: number): Promise<void> {
  try {
    await db.transaction(async tx => {
      await tx
        .update(currencies)
        .set({ isDefault: false })
        .where(eq(currencies.isDefault, true));
      await tx
        .update(currencies)
        .set({ isDefault: true })
        .where(eq(currencies.id, currencyId));
    });
  } catch (error) {
    console.error(
      `setDefaultCurrency: failed to move the default flag to currency id=${currencyId}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(DELETE
// /api/currencies/:id), keeping the same return shape.
export async function deleteCurrency(currencyId: number): Promise<void> {
  try {
    const referencing = await db
      .select()
      .from(accountBalances)
      .where(eq(accountBalances.currencyId, currencyId))
      .limit(1);
    if (referencing.length > 0) {
      throw new Error(
        'This currency is used in an existing account. Cannot be deleted.',
      );
    }
    await db.delete(currencies).where(eq(currencies.id, currencyId));
  } catch (error) {
    console.error(
      `deleteCurrency: failed to delete currency id=${currencyId}`,
      error,
    );
    throw error;
  }
}

