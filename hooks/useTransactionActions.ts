
import { useConfirmDelete } from './useConfirmDelete';
import { useAsyncAction } from './useAsyncAction';
import {
  useDeleteTransaction as useDeleteTransactionMutation,
  useDeleteTransfer as useDeleteTransferMutation,
} from './queries';

export interface UseTransactionActionsResult {
  handleDelete: (id: number) => void;
  handleDeleteTransfer: (id: number) => void;
}

// Delete handlers for History's two deletable row kinds — plain
// transactions and transfers. Both wired through useConfirmDelete/
// useAsyncAction (Steps 3-4); deleteTransfer's own failure path (e.g. a
// balance that can no longer be reversed) now surfaces through
// runAction's generic Alert instead of a hand-rolled try/catch.
export function useTransactionActions(): UseTransactionActionsResult {
  // Write paths go through the caching layer's mutation hooks: each
  // one runs the same db/queries function as before and then
  // invalidates every query its write can affect (see
  // hooks/queries/invalidation.ts). The call sites below are
  // unchanged — these hooks take the wrapped function's own arguments.
  const deleteTransaction = useDeleteTransactionMutation();
  const deleteTransfer = useDeleteTransferMutation();
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

  return { handleDelete, handleDeleteTransfer };
}
