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
