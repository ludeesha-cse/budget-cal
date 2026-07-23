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

// Which currency a form should PRESELECT when the options are decided by
// an account rather than by the full currency list — the from-currency of
// a transfer, the currency of a transaction on a multi-currency account,
// the currency of a new balance being added to one.
//
// The rule: the user's default currency if the account can actually offer
// it, otherwise the only option if there is only one, otherwise nothing.
// defaultCurrencyId() above answers the same question for forms whose
// options are every active currency, where "the account doesn't hold it"
// cannot arise.
//
// WHY PRESELECT AT ALL: leaving the picker empty on a multi-currency
// account made the user restate, every single time, the answer that is
// right in the overwhelming majority of cases — and an empty required
// field is also the one that turns red under the form-validation
// pattern, so the form opened already looking like something was wrong.
// It is a default, not a lock: every one of these pickers stays fully
// editable, and a form that already has a currency (editing an existing
// row) is never overwritten by it.
export function preferredCurrencyId<T extends { currencyId: number }>(
  options: T[],
  defaultId: number | null | undefined,
): number | null {
  if (
    defaultId != null &&
    options.some(option => option.currencyId === defaultId)
  ) {
    return defaultId;
  }
  return options.length === 1 ? options[0].currencyId : null;
}
