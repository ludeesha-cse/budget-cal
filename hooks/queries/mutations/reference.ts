import {
  completeFirstRunSetup,
  addCategory,
  addCurrency,
  addTag,
  confirmDefaultCurrency,
  deleteCategory,
  deleteCurrency,
  deleteTag,
  setCurrencyActive,
  setDefaultCurrency,
  setDefaultCurrencyConfirmed,
  setOnboardingCompleted,
  setPaletteId,
  setThemeMode,
  updateCategory,
  updateTag,
} from '../../../db/queries';
import { invalidates, useDbMutation } from '../invalidation';

// Reference-data writes: categories, tags, currencies, app settings.
//
// The default for this group is "invalidate your own reference query and
// nothing else". The two documented exceptions are a RENAME and a
// DELETE, which reach further because other screens are currently
// displaying the name (or the id) being changed.

export function useAddCategory() {
  return useDbMutation(addCategory, invalidates.categoryWrite);
}

// A rename is the exception to "reference mutations invalidate their own
// query and nothing else": the old name is currently on screen in the
// dashboard's category breakdown, the category budgets list and the
// report breakdowns, none of which would otherwise re-read it.
export function useUpdateCategory() {
  return useDbMutation(updateCategory, invalidates.categoryWriteAffectingNames);
}

// A delete reaches further still — existing transactions have their
// categoryId reassigned or cleared by it, so the ledger itself changed,
// not only the roster.
export function useDeleteCategory() {
  return useDbMutation(deleteCategory, invalidates.categoryWriteAffectingNames);
}

export function useAddTag() {
  return useDbMutation(addTag, invalidates.tagWrite);
}

export function useUpdateTag() {
  return useDbMutation(updateTag, invalidates.tagWrite);
}

export function useDeleteTag() {
  return useDbMutation(deleteTag, invalidates.tagWrite);
}

// Currency writes reach into the transactional figures because nearly
// every money figure in the app is scoped by currency, and the default
// currency decides which one the dashboard shows at all.
export function useAddCurrency() {
  return useDbMutation(addCurrency, invalidates.currencyWrite);
}

export function useSetCurrencyActive() {
  return useDbMutation(setCurrencyActive, invalidates.currencyWrite);
}

export function useSetDefaultCurrency() {
  return useDbMutation(setDefaultCurrency, invalidates.currencyWrite);
}

// Sets the currency AND the "confirmed" app-meta flag, so the settings
// prefix goes too.
export function useConfirmDefaultCurrency() {
  return useDbMutation(confirmDefaultCurrency, [
    ...invalidates.currencyWrite,
    ...invalidates.settingsWrite,
  ]);
}

// The whole first-run screen in one write — default currency, the
// wallet's currency and opening balance, and the "setup done" flag. See
// completeFirstRunSetup for why it is one transaction.
export function useCompleteFirstRunSetup() {
  return useDbMutation(completeFirstRunSetup, invalidates.firstRunSetup);
}

export function useDeleteCurrency() {
  return useDbMutation(deleteCurrency, invalidates.currencyWrite);
}

export function useSetOnboardingCompleted() {
  return useDbMutation(setOnboardingCompleted, invalidates.settingsWrite);
}

export function useSetDefaultCurrencyConfirmed() {
  return useDbMutation(setDefaultCurrencyConfirmed, invalidates.settingsWrite);
}

// Theme mode and palette are persisted settings, so they are wrapped here
// for completeness of the "every write function gets a mutation hook"
// rule. contexts/ThemeContext.tsx deliberately still owns theme state
// itself: it is not a data-freshness consumer (it never used
// useFocusEffect, and it holds the current theme in context precisely so
// no screen has to re-read it), so pointing it at the cache would change
// how the app starts up for no caching benefit.
export function useSetThemeMode() {
  return useDbMutation(setThemeMode, invalidates.settingsWrite);
}

export function useSetPaletteId() {
  return useDbMutation(setPaletteId, invalidates.settingsWrite);
}
