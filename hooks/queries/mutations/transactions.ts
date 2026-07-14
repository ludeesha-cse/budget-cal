import {
  addIncome,
  addTransaction,
  deleteTransaction,
  setTransactionTags,
  updateTransaction,
} from '../../../db/queries';
import { invalidates, useDbMutation } from '../invalidation';

// Transaction writes. Each invalidates `invalidates.transactionWrite` —
// that month's transaction list, the account balance(s) it touched, the
// relevant category budget, the overall monthly budget, the report
// aggregates, and the installment / recurring / savings positions a
// transactions row can be the backing record for. See invalidation.ts
// for why that last group is included.
//
// Every hook below is callable with the wrapped function's own
// arguments — see useDbMutation.

export function useAddTransaction() {
  return useDbMutation(addTransaction, invalidates.transactionWrite);
}

export function useAddIncome() {
  return useDbMutation(addIncome, invalidates.transactionWrite);
}

export function useUpdateTransaction() {
  return useDbMutation(updateTransaction, invalidates.transactionWrite);
}

export function useDeleteTransaction() {
  return useDbMutation(deleteTransaction, invalidates.transactionWrite);
}

// Changing which tags are on a transaction moves the per-transaction tag
// assignment and any tag-filtered search currently showing it — but not
// the tag roster itself, which nothing here creates or renames.
export function useSetTransactionTags() {
  return useDbMutation(setTransactionTags, invalidates.transactionTagAssignment);
}
