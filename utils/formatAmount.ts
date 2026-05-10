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
export function formatAmount(amount: number, currencyCode: string): string {
  const isNegative = amount < 0;
  const magnitude = Math.abs(amount);
  const [wholePart, fractionPart] = magnitude.toFixed(2).split('.');
  // Inserts a comma at every position that has a multiple of 3 digits
  // remaining to its right (and isn't the very start of the string) —
  // e.g. "1234567" -> "1,234,567", "999" -> "999" (no comma needed).
  const wholeWithSeparators = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = isNegative ? '-' : '';
  return `${currencyCode} ${sign}${wholeWithSeparators}.${fractionPart}`;
}
