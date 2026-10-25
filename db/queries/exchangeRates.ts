import { eq } from 'drizzle-orm';
import { db } from '../index';
import { validationError } from '../../utils/appErrors';
import { currencies, exchangeRates } from '../schema';
import {
  REFERENCE_RATES,
  referenceRateAgainstDefault,
} from '../../config/exchangeRates';
import {
  rescaleRatesToDefault as rescaleRates,
  roundToRatePrecision,
} from '../../utils/currencyConversion';

// The exchange_rates table: one editable number per currency, saying how
// many units of it one unit of the USER'S DEFAULT CURRENCY buys. The
// default currency's own row is always exactly 1. See
// config/exchangeRates.ts for why the anchor is the default currency and
// how a pair conversion falls out of two such numbers.

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ExchangeRateRow = {
  currencyId: number;
  currencyCode: string;
  currencyName: string;
  ratePerAnchor: number;
  isCustom: boolean;
  // The shipped constant for this currency, expressed against the
  // CURRENT default, or null for a currency the app never shipped a rate
  // for (or when the default itself is one it has no entry for). The
  // settings screen needs it to decide whether to offer "Reset to
  // default" at all.
  defaultRatePerAnchor: number | null;
  // True for the row that IS the default currency — always 1, never
  // editable, and the currency every other row on the screen is phrased
  // against.
  isAnchor: boolean;
};

async function getDefaultCurrencyRow() {
  const [row] = await db
    .select()
    .from(currencies)
    .where(eq(currencies.isDefault, true))
    .limit(1);
  return row ?? null;
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/exchange-rates, keeping the same return shape.
//
// Returns a row for every ACTIVE currency, INCLUDING ones with no rate
// on file (ratePerAnchor comes back as 0 for those, with isCustom
// false) — the settings screen has to list a rate-less currency in order
// to let someone give it one, and a currency missing from the list
// entirely would look like a bug. Callers doing conversion filter those
// out via getCurrencyRates() below instead.
export async function getExchangeRates(): Promise<ExchangeRateRow[]> {
  try {
    const [rows, defaultCurrency] = await Promise.all([
      db
        .select({
          currencyId: currencies.id,
          currencyCode: currencies.code,
          currencyName: currencies.name,
          active: currencies.active,
          isDefault: currencies.isDefault,
          ratePerAnchor: exchangeRates.ratePerAnchor,
          isCustom: exchangeRates.isCustom,
        })
        .from(currencies)
        .leftJoin(exchangeRates, eq(exchangeRates.currencyId, currencies.id)),
      getDefaultCurrencyRow(),
    ]);
    const defaultCode = defaultCurrency?.code ?? '';
    return rows
      .filter(row => row.active)
      .map(row => ({
        currencyId: row.currencyId,
        currencyCode: row.currencyCode,
        currencyName: row.currencyName,
        // The default currency reads 1 whatever the table says. It is 1
        // by definition, and showing anything else there would be the
        // screen contradicting its own unit of measurement.
        ratePerAnchor: row.isDefault ? 1 : row.ratePerAnchor ?? 0,
        isCustom: row.isDefault ? false : row.isCustom ?? false,
        defaultRatePerAnchor: referenceRateAgainstDefault(
          row.currencyCode,
          defaultCode,
        ),
        isAnchor: row.isDefault,
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
// transfer form converts with. A currency missing from this list is
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

async function upsertRateWithin(
  tx: DbTransaction,
  currencyId: number,
  ratePerAnchor: number,
  isCustom: boolean,
): Promise<void> {
  const [existing] = await tx
    .select()
    .from(exchangeRates)
    .where(eq(exchangeRates.currencyId, currencyId))
    .limit(1);
  if (existing) {
    await tx
      .update(exchangeRates)
      .set({ ratePerAnchor, isCustom, updatedAt: Date.now() })
      .where(eq(exchangeRates.id, existing.id));
    return;
  }
  await tx.insert(exchangeRates).values({
    currencyId,
    ratePerAnchor,
    isCustom,
    updatedAt: Date.now(),
  });
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
      throw validationError('Enter a rate greater than zero.');
    }
    const [currency] = await db
      .select()
      .from(currencies)
      .where(eq(currencies.id, currencyId))
      .limit(1);
    // The default currency is 1 by definition — it is the unit every
    // other rate is measured in, so letting it be anything else would
    // silently rescale every pair in the app at once.
    if (currency?.isDefault) {
      throw validationError(
        `${currency.code} is your default currency, so its rate is always 1 — it's what every other rate is measured against. Change another currency's rate, or set a different default first.`,
      );
    }
    await db.transaction(async tx => {
      await upsertRateWithin(
        tx,
        currencyId,
        roundToRatePrecision(ratePerAnchor),
        isCustom,
      );
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
// Puts a currency back on its shipped constant, re-expressed against the
// current default. Throws when there is no constant to reset TO —
// silently doing nothing would look like a broken button.
export async function resetExchangeRate(currencyId: number): Promise<void> {
  try {
    const [currency] = await db
      .select()
      .from(currencies)
      .where(eq(currencies.id, currencyId))
      .limit(1);
    const defaultCurrency = await getDefaultCurrencyRow();
    const fallback = currency
      ? referenceRateAgainstDefault(currency.code, defaultCurrency?.code ?? '')
      : null;
    if (fallback == null) {
      throw validationError(
        'This currency has no built-in default rate against your default currency. Enter a rate by hand instead.',
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

// Re-expresses every stored rate against a new default currency, inside
// a caller-supplied transaction. Called by setDefaultCurrency and
// confirmDefaultCurrency in the SAME transaction that moves the default
// flag, so there is never a moment where the flag says one currency and
// the rates are measured against another.
//
// Dividing every rate by the new default's own rate leaves every PAIR
// ratio identical, so no conversion the app offers changes meaning — the
// figures on the Exchange Rates screen move only because they are now
// phrased against a different currency, which is the entire point.
//
// THE ONE DESTRUCTIVE CASE, and why it is the honest one: if the new
// default has no usable rate of its own (a currency the user added by
// hand and never gave a rate), there is no arithmetic that can re-anchor
// the others to it. Their stored numbers are measured against a currency
// that is no longer the unit, so keeping them would leave every row on
// the screen quietly claiming to be something it is not. They are
// dropped instead, the new default is set to 1, and the screen asks for
// each rate — which is a visible, fixable state rather than an invisible
// wrong one. In practice this cannot happen for any of the six seeded
// currencies, all of which carry a rate.
export async function rescaleRatesToDefaultWithin(
  tx: DbTransaction,
  newDefaultCurrencyId: number,
): Promise<void> {
  const rows = await tx.select().from(exchangeRates);
  if (rows.length === 0) {
    return;
  }
  const rescaled = rescaleRates(
    rows.map(row => ({
      currencyId: row.currencyId,
      ratePerAnchor: row.ratePerAnchor,
    })),
    newDefaultCurrencyId,
  );
  if (rescaled == null) {
    console.warn(
      `[exchange rates] Currency id=${newDefaultCurrencyId} became the default but has no rate of its own, so the existing rates cannot be re-anchored to it. Clearing them; they will need to be re-entered on the Exchange Rates screen.`,
    );
    await tx.delete(exchangeRates);
    await upsertRateWithin(tx, newDefaultCurrencyId, 1, false);
    return;
  }
  // A rescale is arithmetic on the user's own number, not a replacement
  // of it, so a rate they customised stays marked customised. Read once
  // up front rather than re-queried per row.
  const wasCustom = new Map(rows.map(row => [row.currencyId, row.isCustom]));
  for (const rate of rescaled) {
    if (rate.currencyId === newDefaultCurrencyId) {
      continue;
    }
    await upsertRateWithin(
      tx,
      rate.currencyId,
      rate.ratePerAnchor,
      wasCustom.get(rate.currencyId) === true,
    );
  }
  // The new default is 1 and is never "custom" — it is not a rate anyone
  // chose, it is the unit everything else is measured in.
  await upsertRateWithin(tx, newDefaultCurrencyId, 1, false);
}

// Seeds a rate row for any currency that has a shipped default and no
// row yet, expressed against whatever the current default currency is.
// Runs on every app start (see runMigrations in db/index.ts), gated per
// currency rather than on table-emptiness, for two reasons a
// table-emptiness gate would get wrong:
//   - a currency added to DEFAULT_CURRENCIES in a later release would
//     never get its rate, because the table stopped being empty long ago;
//   - a user who edits one rate must not have the other five reseeded
//     out from under them, which per-currency gating gives for free.
// A currency whose row already exists is never touched, custom or not.
export async function seedExchangeRates(): Promise<void> {
  try {
    const defaultCurrency = await getDefaultCurrencyRow();
    if (!defaultCurrency) {
      // No default currency yet means this is the very first launch,
      // before runCurrencyMigration has seeded the list — there is
      // nothing to anchor to, and the next start will do this properly.
      return;
    }
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
          REFERENCE_RATES[currency.code] !== undefined,
      )
      .map(currency => ({
        currencyId: currency.id,
        ratePerAnchor: roundToRatePrecision(
          referenceRateAgainstDefault(currency.code, defaultCurrency.code) ?? 1,
        ),
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

// Restores the invariant "the default currency's rate is exactly 1"
// after a bulk write that could have broken it — currently only an Excel
// import, whose workbook was exported against whatever default that
// database had at the time. Safe to call whenever; it is a no-op when
// the rates already line up.
export async function normalizeRatesToDefault(): Promise<void> {
  try {
    const defaultCurrency = await getDefaultCurrencyRow();
    if (!defaultCurrency) {
      return;
    }
    await db.transaction(async tx => {
      await rescaleRatesToDefaultWithin(tx, defaultCurrency.id);
    });
  } catch (error) {
    console.warn(
      'normalizeRatesToDefault: could not re-anchor rates to the default currency',
      error,
    );
  }
}
