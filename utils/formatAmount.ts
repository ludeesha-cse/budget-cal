// Stage 16a: shared thousands-separator amount formatter. Report figures
// (a whole year's total spending, say) get unreadable fast without
// separators — "1234567.89" vs "1,234,567.89". Written as plain string
// manipulation rather than Intl.NumberFormat specifically to avoid
// depending on Hermes' locale-data being present/complete on every
// device this runs on — this only ever needs a fixed ',' grouping and
// '.' decimal point, never actual locale-aware formatting, so there's
// nothing Intl would buy here that's worth the platform-support
// uncertainty.
//
// No formatter existed anywhere else in this codebase before this stage
// (every earlier screen calls amount.toFixed(2) directly) — this is the
// first shared one, meant to be reused by Stage 16b and beyond rather
// than duplicated.
export function formatAmount(
  amount: number,
  currencyCode: string,
  options?: { decimals?: number; hideCode?: boolean }
): string {
  const decimals = options?.decimals ?? 2;
  const hideCode = options?.hideCode ?? false;
  const isNegative = amount < 0;
  const magnitude = Math.abs(amount);
  const fixed = magnitude.toFixed(decimals);
  const [wholePart, fractionPart] = fixed.split('.');
  // Inserts a comma at every position that has a multiple of 3 digits
  // remaining to its right (and isn't the very start of the string) —
  // e.g. "1234567" -> "1,234,567", "999" -> "999" (no comma needed).
  const wholeWithSeparators = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = isNegative ? '-' : '';
  const numberPart = fractionPart
    ? `${wholeWithSeparators}.${fractionPart}`
    : wholeWithSeparators;
  return hideCode
    ? `${sign}${numberPart}`
    : `${currencyCode} ${sign}${numberPart}`;
}

// Formats a ratio/percentage value (already expressed 0-100, not 0-1) as a
// string like "42%" or "42.5%". Defaults to 0 decimals since most percent
// displays in this app (budget usage, progress bars) don't need fractional
// precision.
export function formatPercent(value: number, decimals = 0): string {
  return `${value.toFixed(decimals)}%`;
}

// Abbreviates large amounts for compact display — "1.2M", "3.4K" — used in
// places like report summary cards where full grouped numbers would be too
// wide. Moved here from screens/ReportsScreen.tsx so it can be shared.
export function formatAbbreviated(amount: number): string {
  const isNegative = amount < 0;
  const magnitude = Math.abs(amount);
  let result: string;
  if (magnitude >= 1_000_000) {
    result = `${(magnitude / 1_000_000).toFixed(1)}M`;
  } else if (magnitude >= 1_000) {
    result = `${(magnitude / 1_000).toFixed(1)}K`;
  } else {
    result = magnitude.toFixed(0);
  }
  return isNegative ? `-${result}` : result;
}
