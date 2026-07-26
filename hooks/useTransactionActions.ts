
import { useConfirmDelete } from './useConfirmDelete';
import { useAsyncAction } from './useAsyncAction';
import {
  useDeleteHistoryTransaction as useDeleteHistoryTransactionMutation,
  useDeleteLoanPayment as useDeleteLoanPaymentMutation,
  useDeleteTransfer as useDeleteTransferMutation,
} from './queries';

export interface UseTransactionActionsResult {
  handleDelete: (id: number) => void;
  handleDeleteTransfer: (id: number) => void;
  handleDeleteLoanPayment: (id: number, isLiability: boolean) => void;
}

// Delete handlers for History's deletable row kinds — plain
// transactions, transfers and loan payments. Both wired through useConfirmDelete/
// useAsyncAction (Steps 3-4); deleteTransfer's own failure path (e.g. a
// balance that can no longer be reversed) now surfaces through
// runAction's generic Alert instead of a hand-rolled try/catch.
export function useTransactionActions(): UseTransactionActionsResult {
  // Write paths go through the caching layer's mutation hooks: each
  // one runs the same db/queries function as before and then
  // invalidates every query its write can affect (see
  // hooks/queries/invalidation.ts). The call sites below are
  // unchanged — these hooks take the wrapped function's own arguments.
  // Not useDeleteTransaction: a transaction row in History can also be
  // an installment slot or a confirmed recurring month, and removing it
  // has to unwind that too. deleteHistoryTransaction decides which of the
  // three it is — see its own comment.
  const deleteTransaction = useDeleteHistoryTransactionMutation();
  const deleteTransfer = useDeleteTransferMutation();
  const deleteLoanPayment = useDeleteLoanPaymentMutation();
  const confirmDelete = useConfirmDelete();
  const runAction = useAsyncAction();

  const handleDelete = (id: number) => {
    confirmDelete(
      'Delete transaction',
      'Are you sure you want to delete this transaction?',
      'Delete',
      () =>
        runAction(async () => {
          await deleteTransaction(id);
          // No reload() here any more: the mutation above already
          // invalidated every query this write affects, and awaiting it
          // waits for those refetches — a second read would be redundant.
        }, 'Could not delete transaction'),
    );
  };

  // Undoing a repayment or a collection. The prompt says what comes back
  // rather than just asking twice: the money returns to the account it
  // moved through, and the debt it cleared comes back with it — which,
  // for a payment that closed the loan, means the loan reopens.
  const handleDeleteLoanPayment = (id: number, isLiability: boolean) => {
    confirmDelete(
      isLiability ? 'Delete repayment' : 'Delete collection',
      isLiability
        ? 'Delete this repayment? The money goes back into the account it was paid from, and the amount is owed again.'
        : 'Delete this collection? The money comes back out of the account it was received into, and the amount is outstanding again.',
      'Delete',
      () =>
        runAction(async () => {
          await deleteLoanPayment(id);
        }, 'Could not delete payment'),
    );
  };

  const handleDeleteTransfer = (id: number) => {
    confirmDelete(
      'Delete transfer',
      'Delete this transfer? Both account balances will be reversed.',
      'Delete',
      () =>
        runAction(async () => {
          await deleteTransfer(id);
          // No reload() here any more: the mutation above already
          // invalidated every query this write affects, and awaiting it
          // waits for those refetches — a second read would be redundant.
        }, 'Cannot delete transfer'),
    );
  };

  return { handleDelete, handleDeleteTransfer, handleDeleteLoanPayment };
}
