import { useMemo } from 'react';
import { useAccountList, useCategories, useTags } from './queries';
import { getAccounts, getCategories, getTags } from '../db/queries';

// Liability/Receivable accounts are managed exclusively through the loan
// flows (create/reactivate a loan, and Stage 9b's settlement) — posting
// an ordinary Expense/Income straight to one would move money without
// going through that bookkeeping (no loan_payments row, no interest
// accrual reset), so they're never offered as a transaction account here.
// Closed accounts can't take new activity either, for a different reason
// (deliberately shut down) — both exclusions live in the one filter below.
export const NON_TRANSACTABLE_ACCOUNT_TYPES = ['Liability', 'Receivable'];

type AccountRow = Awaited<ReturnType<typeof getAccounts>>[number];
type CategoryRow = Awaited<ReturnType<typeof getCategories>>[number];
type TagRow = Awaited<ReturnType<typeof getTags>>[number];

export interface UseReferenceDataResult {
  accounts: AccountRow[];
  categories: CategoryRow[];
  tags: TagRow[];
}

// Shared by TransactionForm and IncomeForm (and anything else that needs
// the same "pickable accounts + categories + tags" trio).
//
// All three of these are reference rosters, so they now come from the
// long reference cache instead of three fresh reads on every focus.
// Anything added/edited/deleted on the Settings Accounts/Categories/Tags
// screens still shows up here immediately without an app reload — the
// mutation behind that edit invalidates the roster it changed, which is
// a stronger guarantee than the old refetch-on-focus (that only caught
// the change once the user navigated back here).
//
// Deliberately returns only the raw filtered lists, not a selected id —
// each form still owns its own accountId/categoryId state and reacts to
// these lists changing to keep its current selection valid or fall back
// to a default, since what counts as "the right default" (and whether a
// category is even relevant at all) differs per form.
export function useReferenceData(): UseReferenceDataResult {
  const { data: accountRows } = useAccountList();
  const { data: categories } = useCategories();
  // Only the available options — never a caller's own selectedTagIds, so
  // a tag added/deleted elsewhere shows up here without disturbing
  // whatever's already checked on the form.
  const { data: tags } = useTags();

  const accounts = useMemo(
    () =>
      (accountRows ?? []).filter(
        a => a.active && !NON_TRANSACTABLE_ACCOUNT_TYPES.includes(a.type),
      ),
    [accountRows],
  );

  return { accounts, categories: categories ?? [], tags: tags ?? [] };
}
