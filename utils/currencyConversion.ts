import {
  CONVERSION_DECIMAL_PLACES,
  RATE_DECIMAL_PLACES,
} from '../config/exchangeRates';

// Pure conversion math for cross-currency transfers — no DB access, so
// every case below is exercised by a standalone dry-run script the same
// way utils/savingsMath.ts is.

// One currency's stored rate. `ratePerAnchor` is how many units of THIS
// currency one unit of the DEFAULT currency buys — so the default
// currency's own rate is 1, and with USD as the default, EUR's is 0.86.
// See config/exchangeRates.ts for the full reasoning.
//
// The field kept its original name through the change from a fixed
// anchor to the user's default currency, because the meaning of "anchor"
// is what moved, not the column: the anchor simply IS the default
// currency now.
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
  // to / from, NOT from / to. Each rate says how much of its currency
  // one default-currency unit buys, so dividing by the FROM rate turns
  // the amount into default-currency units and multiplying by the TO
  // rate turns it into the destination. With USD as default: 100 EUR ->
  // LKR is 100 * 340 / 0.86 = 39,534.88.
  return roundToCurrencyPrecision(
    (amount * toRate.ratePerAnchor) / fromRate.ratePerAnchor,
  );
}

// Rounds a RATE (not an amount) to the app's rate precision. Separate
// from roundToCurrencyPrecision because a rate can legitimately be far
// smaller than a cent — see RATE_DECIMAL_PLACES for why 2dp would break
// real pairs.
export function roundToRatePrecision(value: number): number {
  const factor = Math.pow(10, RATE_DECIMAL_PLACES);
  return Math.round((value + Number.EPSILON * Math.sign(value)) * factor) / factor;
}

// Rescales a whole set of rates so that `newDefaultCurrencyId` becomes
// exactly 1 — what runs when the user changes their default currency.
//
// Dividing every rate by one of their number leaves every PAIR ratio
// untouched, which is the property that matters: rate[a]/rate[b] is
// unchanged, so no conversion the app would offer before the change
// differs from the one it offers after. Only the figures displayed on
// the Exchange Rates screen move, and they move precisely because they
// are now phrased against a different currency.
//
// Returns null when the new default has no usable rate of its own. There
// is no arithmetic that can re-anchor to a currency whose relationship
// to the others is unknown, and quietly leaving the old numbers in place
// would mean every row on the screen silently claiming to be measured
// against something it is not. The caller decides what to do about that
// (see rescaleRatesToDefault in db/queries/exchangeRates.ts).
export function rescaleRatesToDefault(
  rates: CurrencyRate[],
  newDefaultCurrencyId: number,
): CurrencyRate[] | null {
  const pivot = rates.find(rate => rate.currencyId === newDefaultCurrencyId);
  if (!pivot || !Number.isFinite(pivot.ratePerAnchor) || pivot.ratePerAnchor <= 0) {
    return null;
  }
  return rates.map(rate => ({
    currencyId: rate.currencyId,
    // The pivot divides to exactly 1 without needing a special case.
    ratePerAnchor:
      rate.currencyId === newDefaultCurrencyId
        ? 1
        : roundToRatePrecision(rate.ratePerAnchor / pivot.ratePerAnchor),
  }));
}

// How many `to` units one `from` unit is worth — the figure shown under
// the converted-amount field ("1 USD = 340 LKR") so the user can see
// which rate produced the number before deciding whether to keep it.
// Same null contract as convertAmount: no rate on file, no claim made.
//
// Note this goes through convertAmount, so it inherits the 2dp AMOUNT
// rounding rather than the 6dp rate rounding. That is deliberate for a
// hint line — "1 LKR = 0.00 USD" would be useless, but a hint is only
// ever shown for the pair the user is actually converting, where the
// direction shown is the one with the readable number.
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
