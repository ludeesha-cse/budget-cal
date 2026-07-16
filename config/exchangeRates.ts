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
// HOW THE NUMBERS WORK — "units per anchor":
// Every rate below says how many ANCHOR units one unit of that currency
// is worth, with LKR as the anchor. So USD: 340 reads as "1 USD = 340
// LKR", and the anchor itself is 1 by definition. Any pair is then a
// division, no pairwise table needed:
//
//   toAmount = fromAmount * ratePerAnchor[from] / ratePerAnchor[to]
//
// 100 USD -> LKR is 100 * 340 / 1 = 34,000. 34,000 LKR -> USD is
// 34,000 * 1 / 340 = 100. Adding a seventh currency means adding one
// number here, not six.
export const ANCHOR_CURRENCY_CODE = 'LKR';

// Keyed by currency code so a currency's rate survives the currencies
// table being reseeded with different ids. Every code in
// DEFAULT_CURRENCIES (db/index.ts) has an entry; a currency the user
// adds by hand has none until they set one, and until then the transfer
// form asks them to type the converted amount instead of guessing.
//
// USDT is deliberately given its own rate rather than being treated as
// an alias of USD — db/index.ts already notes it is "kept strictly
// separate from USD, never converted", and the two are separate holdings
// even when they happen to be worth the same. Its default matching USD's
// is a starting value, not an equivalence.
export const DEFAULT_RATES_PER_ANCHOR: Record<string, number> = {
  LKR: 1,
  USD: 340,
  GBP: 425,
  EUR: 365,
  AUD: 220,
  USDT: 340,
};

// Two decimal places on every converted figure. Not a currency-aware
// minor-unit table (JPY has no cents, KWD has three decimals): every
// amount elsewhere in this app — account balances, transaction amounts,
// the transfer amount the user types — is already a plain 2dp number,
// and inventing a different precision only for the converted half of a
// transfer would make the two sides of the same row disagree about what
// a number means.
export const CONVERSION_DECIMAL_PLACES = 2;
