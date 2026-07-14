
import { useTargetedModal } from './useTargetedModal';
import type { UseTargetedModalResult } from './useTargetedModal';
import type { TransferRow } from './useTransactionHistoryData';
import {
  useUpdateTransfer as useUpdateTransferMutation,
} from './queries';

export type EditTransferFormValues = {
  amount: string;
  date: string;
};

export interface UseEditTransferModalResult
  extends UseTargetedModalResult<TransferRow, EditTransferFormValues> {
  setAmount: (value: string) => void;
  setDate: (value: string) => void;
}

// Editing a transfer's amount/date in place — from/to/currency stay
// fixed to what the transfer was originally created with (changing
// those would need the same cascading account/currency pickers
// AccountsScreen's transfer modal already has; delete and recreate
// covers that rarer case instead of duplicating that UI here). Built on
// useTargetedModal (Step 8). The original screen surfaced both the
// invalid-amount check and a failed save via Alert.alert — converted
// here to the inline `error` string useTargetedModal already provides,
// matching the convention established for every other hook built on it
// (Steps 13/14).
export function useEditTransferModal(
  // Optional since the TanStack Query refactor: a caller used to pass
  // its screen's load() here purely to re-read the database after a
  // successful write. The mutation hooks now invalidate every affected
  // query themselves, so that job is done — this is left for callers
  // that still need to do something ELSE once a save lands (reset
  // local UI state, navigate away).
  onSaved?: () => void | Promise<void>,
): UseEditTransferModalResult {
  // Write paths go through the caching layer's mutation hooks: each
  // one runs the same db/queries function as before and then
  // invalidates every query its write can affect (see
  // hooks/queries/invalidation.ts). The call sites below are
  // unchanged — these hooks take the wrapped function's own arguments.
  const updateTransfer = useUpdateTransferMutation();
  const modal = useTargetedModal<TransferRow, EditTransferFormValues>({
    initialValues: transfer => ({
      amount: String(transfer.amount),
      date: transfer.date,
    }),
    validate: values => {
      const parsedAmount = Number(values.amount);
      if (!values.amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        return 'Enter a transfer amount greater than zero.';
      }
      return null;
    },
    // fromAccountId/toAccountId/currencyId are carried over unchanged
    // from the original transfer — updateTransfer still needs them to
    // reverse that exact original effect before applying the new one.
    onSubmit: (target, values) =>
      updateTransfer(target.id, {
        fromAccountId: target.fromAccountId,
        toAccountId: target.toAccountId,
        amount: Number(values.amount),
        currencyId: target.currencyId,
        date: values.date,
      }),
    onSaved,
  });

  const setField = <K extends keyof EditTransferFormValues>(
    key: K,
    value: EditTransferFormValues[K],
  ) => modal.setValues(current => ({ ...current, [key]: value }));

  return {
    ...modal,
    setAmount: value => setField('amount', value),
    setDate: value => setField('date', value),
  };
}
