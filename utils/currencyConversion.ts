import { CONVERSION_DECIMAL_PLACES } from '../config/exchangeRates';

// Pure conversion math for cross-currency transfers — no DB access, so
// every case below is exercised by a standalone dry-run script the same
// way utils/savingsMath.ts is.

// One currency's position against the anchor, as stored in the
// exchange_rates table. `ratePerAnchor` is how many anchor units one
// unit of this currency is worth (see config/exchangeRates.ts).
export type CurrencyRate = {
  currencyId: number;
  ratePerAnchor: number;
};

// Rounds to the app's shared 2dp convention. Uses the epsilon-nudged
// form rather than a bare Math.round(x * 100) / 100 because binary
// floating point represents some exact halves a hair below their true
// value — 1.005 is really 1.00499999999999989, which rounds DOWN to 1.00
// and reads as a bug to anyone checking the arithmetic by hand. The
// nudge is far smaller than any real difference between two money
// amounts, so it can only ever change a tie.
export function roundToCurrencyPrecision(value: number): number {
  const factor = Math.pow(10, CONVERSION_DECIMAL_PLACES);
  return Math.round((value + Number.EPSILON * Math.sign(value)) * factor) / factor;
}

// Converts `amount` from one currency to another via their anchor rates,
// or returns null when the conversion cannot be made — which is a real,
// expected state, not an error:
//   - either currency has no rate on file (a currency the user added by
//     hand and has not given a rate yet), or
//   - a rate is zero or negative (nonsense as a rate, and a zero
//     denominator would produce Infinity).
// null means "the app has no opinion here"; the caller shows an empty
// converted-amount field and lets the user type the figure their bank
// actually gave them, which is the honest outcome rather than a
// confident wrong number.
export function convertAmount(
  amount: number,
  fromRate: CurrencyRate | undefined,
  toRate: CurrencyRate | undefined,
): number | null {
  if (!fromRate || !toRate) {
    return null;
  }
  if (
    !Number.isFinite(fromRate.ratePerAnchor) ||
    !Number.isFinite(toRate.ratePerAnchor) ||
    fromRate.ratePerAnchor <= 0 ||
    toRate.ratePerAnchor <= 0
  ) {
    return null;
  }
  if (!Number.isFinite(amount)) {
    return null;
  }
  return roundToCurrencyPrecision(
    (amount * fromRate.ratePerAnchor) / toRate.ratePerAnchor,
  );
}

// How many `to` units one `from` unit is worth — the figure shown under
// the converted-amount field ("1 USD = 340.00 LKR") so the user can see
// which rate produced the number before deciding whether to keep it.
// Same null contract as convertAmount: no rate on file, no claim made.
export function getPairRate(
  fromRate: CurrencyRate | undefined,
  toRate: CurrencyRate | undefined,
): number | null {
  return convertAmount(1, fromRate, toRate);
}

// Index a rate list by currency id for the two lookups above. Kept here
// rather than in the query layer so the dry-run scripts can build the
// same map the screens do, from plain literals.
export function indexRatesByCurrencyId(
  rates: CurrencyRate[],
): Map<number, CurrencyRate> {
  return new Map(rates.map(rate => [rate.currencyId, rate]));
}
