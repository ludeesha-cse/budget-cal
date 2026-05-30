// Shared helper for the "find this id in a list, show one of its fields, or
// a placeholder if nothing's selected/found" pattern that was previously
// duplicated across every picker in the app (account/category/currency
// selects, etc). Compares ids as strings so it doesn't matter whether a
// call site's `id` is a string (e.g. from a <CollapsiblePicker> selected
// value, which is always a string) or a number (e.g. a raw foreign key
// from a DB row) — some call sites did one, some did the other, before
// this existed.
export function labelForId<T extends { id: string | number }>(
  list: T[],
  id: string | number | null | undefined,
  labelKey: keyof T,
  fallback: string,
): string {
  if (id === null || id === undefined) {
    return fallback;
  }
  const match = list.find(item => String(item.id) === String(id));
  if (!match) {
    return fallback;
  }
  const value = match[labelKey];
  return value == null ? fallback : String(value);
}
