import {
  createTransfer,
  deleteTransfer,
  updateTransfer,
} from '../../../db/queries';
import { invalidates, useDbMutation } from '../invalidation';

// A transfer moves money between the user's own accounts. Same reasoning
// as a credit card payoff: it is not spending, writes no transactions
// row, and so invalidates both accounts' balances and the transfer
// ledger History reads — never a transaction list or a budget figure.

export function useCreateTransfer() {
  return useDbMutation(createTransfer, invalidates.transferWrite);
}

export function useUpdateTransfer() {
  return useDbMutation(updateTransfer, invalidates.transferWrite);
}

export function useDeleteTransfer() {
  return useDbMutation(deleteTransfer, invalidates.transferWrite);
}
