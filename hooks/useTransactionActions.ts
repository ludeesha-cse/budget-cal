import { deleteTransaction, deleteTransfer } from '../db/queries';
import { useConfirmDelete } from './useConfirmDelete';
import { useAsyncAction } from './useAsyncAction';

export interface UseTransactionActionsResult {
  handleDelete: (id: number) => void;
  handleDeleteTransfer: (id: number) => void;
}

// Delete handlers for History's two deletable row kinds — plain
// transactions and transfers. Both wired through useConfirmDelete/
// useAsyncAction (Steps 3-4); deleteTransfer's own failure path (e.g. a
// balance that can no longer be reversed) now surfaces through
// runAction's generic Alert instead of a hand-rolled try/catch.
export function useTransactionActions(
  reload: () => void | Promise<void>,
): UseTransactionActionsResult {
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
          await reload();
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
          await reload();
        }, 'Cannot delete transfer'),
    );
  };

  return { handleDelete, handleDeleteTransfer };
}
