import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
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
// the same "pickable accounts + categories + tags" trio): refetches on
// every focus, not just on mount, so anything added/edited/deleted
// elsewhere (Settings' Accounts/Categories/Tags screens) shows up here
// immediately without the app needing a reload.
//
// Deliberately returns only the raw filtered lists, not a selected id —
// each form still owns its own accountId/categoryId state and reacts to
// these lists changing to keep its current selection valid or fall back
// to a default, since what counts as "the right default" (and whether a
// category is even relevant at all) differs per form.
export function useReferenceData(): UseReferenceDataResult {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);

  useFocusEffect(
    useCallback(() => {
      getAccounts().then(rows => {
        setAccounts(
          rows.filter(
            a => a.active && !NON_TRANSACTABLE_ACCOUNT_TYPES.includes(a.type),
          ),
        );
      });
      getCategories().then(setCategories);
      // Only refreshes the available options — never touches a caller's
      // own selectedTagIds, so a tag added/deleted elsewhere shows up
      // here without disturbing whatever's already checked on the form.
      getTags().then(setTags);
    }, []),
  );

  return { accounts, categories, tags };
}
