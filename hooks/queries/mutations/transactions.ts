import {
  addIncome,
  addTransaction,
  deleteHistoryTransaction,
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

// The delete History itself should call. Unlike useDeleteTransaction
// above, this one knows the row might be an installment payment or a
// confirmed recurring occurrence and unwinds the plan or the schedule to
// match — see deleteHistoryTransaction. Its invalidation is the union of
// all three outcomes, since which one happens is decided inside the
// write.
export function useDeleteHistoryTransaction() {
  return useDbMutation(
    deleteHistoryTransaction,
    invalidates.historyTransactionDelete,
  );
}
