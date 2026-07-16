import { eq } from 'drizzle-orm';
import { db } from '../index';
import { currencies, exchangeRates } from '../schema';
import {
  ANCHOR_CURRENCY_CODE,
  DEFAULT_RATES_PER_ANCHOR,
} from '../../config/exchangeRates';

// The exchange_rates table: one editable "units per anchor" number per
// currency, seeded from config/exchangeRates.ts. See that file for what
// the numbers mean and why they are constants rather than a live feed.

export type ExchangeRateRow = {
  currencyId: number;
  currencyCode: string;
  currencyName: string;
  ratePerAnchor: number;
  isCustom: boolean;
  // The shipped constant for this currency, or null for a currency the
  // app never shipped a rate for. The settings screen needs it to decide
  // whether to offer "Reset to default" at all.
  defaultRatePerAnchor: number | null;
  isAnchor: boolean;
};

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/exchange-rates, keeping the same return shape.
//
// Returns a row for every currency in the table, INCLUDING ones with no
// rate on file (ratePerAnchor comes back as 0 for those, with isCustom
// false) — the settings screen has to list a rate-less currency in order
// to let someone give it one, and a currency missing from the list
// entirely would look like a bug. Callers doing conversion filter those
// out via getCurrencyRates() below instead.
export async function getExchangeRates(): Promise<ExchangeRateRow[]> {
  try {
    const rows = await db
      .select({
        currencyId: currencies.id,
        currencyCode: currencies.code,
        currencyName: currencies.name,
        active: currencies.active,
        ratePerAnchor: exchangeRates.ratePerAnchor,
        isCustom: exchangeRates.isCustom,
      })
      .from(currencies)
      .leftJoin(exchangeRates, eq(exchangeRates.currencyId, currencies.id));
    return rows
      .filter(row => row.active)
      .map(row => ({
        currencyId: row.currencyId,
        currencyCode: row.currencyCode,
        currencyName: row.currencyName,
        ratePerAnchor: row.ratePerAnchor ?? 0,
        isCustom: row.isCustom ?? false,
        defaultRatePerAnchor:
          DEFAULT_RATES_PER_ANCHOR[row.currencyCode] ?? null,
        isAnchor: row.currencyCode === ANCHOR_CURRENCY_CODE,
      }));
  } catch (error) {
    console.error('getExchangeRates: failed to load exchange rates', error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/exchange-rates/usable, keeping the same return shape.
//
// Only currencies that actually have a usable rate — this is what the
// transfer form's conversion reads. A currency missing from this list is
// exactly the case utils/currencyConversion.ts returns null for, which
// the form renders as "type the converted amount yourself".
export async function getCurrencyRates(): Promise<
  { currencyId: number; ratePerAnchor: number }[]
> {
  try {
    const rows = await db
      .select({
        currencyId: exchangeRates.currencyId,
        ratePerAnchor: exchangeRates.ratePerAnchor,
      })
      .from(exchangeRates);
    return rows.filter(row => row.ratePerAnchor > 0);
  } catch (error) {
    console.error('getCurrencyRates: failed to load currency rates', error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(PUT
// /api/exchange-rates/:currencyId), keeping the same input shape.
//
// Upserts one currency's rate and marks it custom. Marking custom is the
// whole record of "the user chose this": seedExchangeRates below only
// ever writes rows that don't exist yet, so a custom rate is never
// overwritten by a later app start, and "Reset to default" is just this
// same write with isCustom cleared.
export async function setExchangeRate(
  currencyId: number,
  ratePerAnchor: number,
  isCustom = true,
): Promise<void> {
  try {
    if (!Number.isFinite(ratePerAnchor) || ratePerAnchor <= 0) {
      throw new Error('Enter a rate greater than zero.');
    }
    const [currency] = await db
      .select()
      .from(currencies)
      .where(eq(currencies.id, currencyId))
      .limit(1);
    // The anchor is 1 by definition — its rate is what every other rate
    // is expressed against, so letting it be anything else would silently
    // rescale every pair in the app at once.
    if (currency?.code === ANCHOR_CURRENCY_CODE && ratePerAnchor !== 1) {
      throw new Error(
        `${ANCHOR_CURRENCY_CODE} is the base every other rate is measured against, so it is always 1. Change another currency's rate instead.`,
      );
    }
    const [existing] = await db
      .select()
      .from(exchangeRates)
      .where(eq(exchangeRates.currencyId, currencyId))
      .limit(1);
    if (existing) {
      await db
        .update(exchangeRates)
        .set({ ratePerAnchor, isCustom, updatedAt: Date.now() })
        .where(eq(exchangeRates.id, existing.id));
      return;
    }
    await db.insert(exchangeRates).values({
      currencyId,
      ratePerAnchor,
      isCustom,
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.error(
      `setExchangeRate: failed to set rate=${ratePerAnchor} for currency id=${currencyId}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/exchange-rates/:currencyId/reset), keeping the same input shape.
// Puts a currency back on its shipped constant. Throws for a currency
// the app never shipped a rate for — there is nothing to reset TO, and
// silently doing nothing would look like a broken button.
export async function resetExchangeRate(currencyId: number): Promise<void> {
  try {
    const [currency] = await db
      .select()
      .from(currencies)
      .where(eq(currencies.id, currencyId))
      .limit(1);
    const fallback = currency
      ? DEFAULT_RATES_PER_ANCHOR[currency.code]
      : undefined;
    if (fallback === undefined) {
      throw new Error(
        'This currency has no built-in default rate. Enter a rate by hand instead.',
      );
    }
    await setExchangeRate(currencyId, fallback, false);
  } catch (error) {
    console.error(
      `resetExchangeRate: failed to reset rate for currency id=${currencyId}`,
      error,
    );
    throw error;
  }
}

// Seeds a rate row for any currency that has a shipped default and no
// row yet. Runs on every app start (see runMigrations in db/index.ts),
// gated per currency rather than on table-emptiness, for two reasons a
// table-emptiness gate would get wrong:
//   - a currency added to DEFAULT_CURRENCIES in a later release would
//     never get its rate, because the table stopped being empty long ago;
//   - a user who edits one rate must not have the other five reseeded
//     out from under them, which per-currency gating gives for free.
// A currency whose row already exists is never touched, custom or not.
export async function seedExchangeRates(): Promise<void> {
  try {
    const currencyRows = await db.select().from(currencies);
    const existingRows = await db
      .select({ currencyId: exchangeRates.currencyId })
      .from(exchangeRates);
    const haveRate = new Set(existingRows.map(row => row.currencyId));
    const now = Date.now();
    const toInsert = currencyRows
      .filter(
        currency =>
          !haveRate.has(currency.id) &&
          DEFAULT_RATES_PER_ANCHOR[currency.code] !== undefined,
      )
      .map(currency => ({
        currencyId: currency.id,
        ratePerAnchor: DEFAULT_RATES_PER_ANCHOR[currency.code],
        isCustom: false,
        updatedAt: now,
      }));
    if (toInsert.length === 0) {
      return;
    }
    await db.insert(exchangeRates).values(toInsert);
  } catch (error) {
    // Deliberately swallowed rather than rethrown: a missing rate makes
    // the transfer form ask for a manual amount, which is a degraded but
    // fully usable state. Failing app startup over it would be a far
    // worse outcome than the thing it is guarding against.
    console.warn('seedExchangeRates: could not seed default rates', error);
  }
}
