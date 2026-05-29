import { eq } from 'drizzle-orm';
import { db } from '../index';
import {
  accountBalances,
  currencies,
} from '../schema';

type Currency = typeof currencies.$inferSelect;

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/currencies, keeping the same return type.
export async function getCurrencies(): Promise<Currency[]> {
  return db.select().from(currencies);
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to POST /api/currencies, keeping the same input/return shape. New
// currencies are never created as the default.
export async function addCurrency(
  code: string,
  name: string,
): Promise<Currency> {
  const [currency] = await db
    .insert(currencies)
    .values({ code, name, isDefault: false, createdAt: Date.now() })
    .returning();
  return currency;
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

