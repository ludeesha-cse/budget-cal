import { formatAmount } from './formatAmount';

// Sums an arbitrary list of currency-tagged rows into a map keyed by
// currency code. Deliberately a map rather than one number — currency
// amounts are never summed together anywhere in this app, so there's no
// such thing as a single "total liabilities" or "total cash in hand"
// figure. `amountOf` lets each caller point at whichever field on its own
// row shape holds the amount (e.g. `currentBalance`, `totalOwed`) without
// this util needing to know every row shape in the app.
export function totalsByCurrency<T extends { currencyCode: string }>(
  rows: T[],
  amountOf: (row: T) => number,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    const code = row.currencyCode;
    totals[code] = (totals[code] ?? 0) + amountOf(row);
  }
  return totals;
}

// Renders a per-currency totals map as "USD 1,234.56 · EUR 90.00", sorted
// alphabetically by currency code for a stable display order, or "None"
// when there's nothing to show.
export function formatCurrencyTotals(totals: Record<string, number>): string {
  const entries = Object.entries(totals).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    return 'None';
  }
  return entries.map(([code, amount]) => formatAmount(amount, code)).join(' · ');
}
