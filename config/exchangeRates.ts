// Shipped default exchange rates — the constants the cross-currency
// transfer feature converts with until the user overrides them from
// Settings › Exchange rates.
//
// WHY CONSTANTS AND NOT A LIVE FEED:
// The rate that matters to a person moving money between their own two
// accounts is the rate THEIR BANK gave them, which differs from the mid
// market rate, differs between banks, and differs between the day they
// checked and the day the money landed. A live feed would be
// authoritative-looking and wrong. So the app converts with a defined
// constant purely to save typing, shows which rate it used, and lets the
// converted amount be edited before saving — the number that gets stored
// is always the one the user accepted, never one the app insisted on.
//
// ---------------------------------------------------------------------
// HOW A STORED RATE READS: "units per 1 of the DEFAULT currency"
// ---------------------------------------------------------------------
// Every rate in the exchange_rates table answers one question:
//
//     how many of THIS currency does 1 unit of the DEFAULT currency buy?
//
// So with the default set to USD, EUR's rate is 0.86 — "1 USD = 0.86
// EUR" — and LKR's is 340. The default currency's own rate is 1, by
// definition. Six currencies therefore need six numbers rather than
// thirty pairwise ones, and converting between any two is a ratio:
//
//     toAmount = fromAmount * rate[to] / rate[from]
//
// 100 USD -> LKR is 100 * 340 / 1 = 34,000. 100 EUR -> LKR is
// 100 * 340 / 0.86 = 39,535. Adding a seventh currency means adding one
// number, not six.
//
// The anchor is the user's DEFAULT currency, not a fixed one, so the
// figures on the Exchange Rates screen are always phrased in the money
// they actually think in. When the default changes, every stored rate is
// divided by the new default's old rate (see rescaleRatesToDefault) —
// which makes the new default exactly 1 and leaves every PAIR ratio
// mathematically identical, so no past or future conversion changes
// meaning.

// The shipped table below is written with LKR as its reference purely
// because "1 USD = 340 LKR" is readable, whereas the same table written
// per-USD would be a column of four-decimal fractions. It is a fixed
// reference, NOT the anchor: seedExchangeRates converts it into
// units-per-default for whichever currency is actually the default.
export const REFERENCE_CURRENCY_CODE = 'LKR';

// How many REFERENCE_CURRENCY_CODE units one unit of each currency is
// worth. Read each line as "1 <code> = <value> LKR".
//
// These are plausible starting values, not live rates, and every one of
// them is expected to be edited — the screen exists for exactly that.
// USDT is deliberately given its own entry rather than being treated as
// an alias of USD: db/index.ts already notes it is "kept strictly
// separate from USD, never converted", and the two are separate holdings
// even when they happen to be worth the same. Its default matching USD's
// is a starting value, not an equivalence.
export const REFERENCE_RATES: Record<string, number> = {
  LKR: 1,
  USD: 340,
  EUR: 395,
  GBP: 455,
  AUD: 225,
  USDT: 340,
};

// Converts the reference table above into the "units per 1 default
// currency" form the database actually stores, for a given default.
// Returns null for a currency (or a default) the shipped table has no
// entry for — a currency the user added by hand has no default rate, and
// the honest answer is to ask them for one rather than invent it.
export function referenceRateAgainstDefault(
  currencyCode: string,
  defaultCurrencyCode: string,
): number | null {
  const perUnit = REFERENCE_RATES[currencyCode];
  const defaultPerUnit = REFERENCE_RATES[defaultCurrencyCode];
  if (perUnit === undefined || defaultPerUnit === undefined || perUnit <= 0) {
    return null;
  }
  // "1 default = X of this currency" is the reference value of the
  // default divided by the reference value of this currency. With LKR as
  // the reference and USD as the default: EUR gets 340 / 395 = 0.8608,
  // i.e. 1 USD = 0.86 EUR. The default itself lands on exactly 1.
  return defaultPerUnit / perUnit;
}

// Two decimal places on every converted AMOUNT. Not a currency-aware
// minor-unit table (JPY has no cents, KWD has three decimals): every
// amount elsewhere in this app — account balances, transaction amounts,
// the transfer amount the user types — is already a plain 2dp number,
// and inventing a different precision only for the converted half of a
// transfer would make the two sides of the same row disagree about what
// a number means.
export const CONVERSION_DECIMAL_PLACES = 2;

// RATES themselves are kept to six decimals, which is a different
// question from the amounts above and needs a different answer. A rate
// can legitimately be very small — 1 USD is about 0.0029 of a Bitcoin,
// and 1 LKR is 0.0029 USD — so rounding a rate to 2dp would flatten real
// pairs to zero and make them unconvertible. Six is enough to round-trip
// every realistic pair without exposing float noise in the input field.
export const RATE_DECIMAL_PLACES = 6;
