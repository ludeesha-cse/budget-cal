// Picks which currency a "new record" form should default to: the
// seeded/user-marked default currency if one exists, otherwise just the
// first currency in the list (so the picker is never left unselected on a
// fresh install before a default has been chosen). Returns the id as a
// string since every currency <CollapsiblePicker> in this app is keyed by
// string value.
export function defaultCurrencyId<
  T extends { id: number | string; isDefault: boolean },
>(currencies: T[]): string {
  const defaultCurrency = currencies.find(c => c.isDefault);
  return String((defaultCurrency ?? currencies[0])?.id ?? '');
}

// The "CODE — Name" label used by every currency-id picker in
// AccountsScreen's forms (AccountFormModal's "Initial currency",
// AddCurrencyForm's picker) — was previously a closure re-defined once per
// screen; factored out since Step 13 gave it a second consumer.
export function currencyLabel<T extends { id: number | string; code: string; name: string }>(
  currencies: T[],
  currencyId: string,
): string {
  const currency = currencies.find(c => String(c.id) === currencyId);
  return currency ? `${currency.code} — ${currency.name}` : 'Select currency';
}
