import { useCallback, useMemo } from 'react';
import { useTargetedModal } from './useTargetedModal';
import type { UseTargetedModalResult } from './useTargetedModal';
import type { TransferRow } from './useTransactionHistoryData';
import {
  convertAmount,
  getPairRate,
  indexRatesByCurrencyId,
} from '../utils/currencyConversion';
import {
  useCurrencyRates,
  useUpdateTransfer as useUpdateTransferMutation,
} from './queries';

export type EditTransferFormValues = {
  amount: string;
  // The to-side amount. For a same-currency transfer this is never shown
  // and never read — the two sides are the same number by definition.
  convertedAmount: string;
  // Mirrors useTransfer's own flag: once the user edits the converted
  // field, the rate stops re-filling it from underneath them.
  convertedTouched: boolean;
  date: string;
};

export interface UseEditTransferModalResult
  extends UseTargetedModalResult<TransferRow, EditTransferFormValues> {
  setAmount: (value: string) => void;
  setConvertedAmount: (value: string) => void;
  setDate: (value: string) => void;
  // "1 USD = 340.00 LKR", or null for a same-currency transfer or a pair
  // with no rate on file.
  rateHint: string | null;
}

// Editing a transfer's amounts and date in place — from/to accounts and
// both currencies stay fixed to what the transfer was originally created
// with (changing those would need the same cascading pickers the
// Accounts screen's transfer sheet already has; delete and recreate
// covers that rarer case instead of duplicating that UI here). Built on
// useTargetedModal (Step 8).
//
// A CROSS-CURRENCY TRANSFER EDITS BOTH SIDES. Editing only the amount
// would silently leave the other side at its old figure, which is how
// you end up with 50 USD leaving an account and 34,000 LKR still
// arriving. So when the two currencies differ, both fields are shown;
// changing the from-amount re-derives the converted one from the saved
// rate until the user overrides it, exactly as in the create sheet.
export function useEditTransferModal(
  // Optional since the TanStack Query refactor: a caller used to pass
  // its screen's load() here purely to re-read the database after a
  // successful write. The mutation hooks now invalidate every affected
  // query themselves, so that job is done — this is left for callers
  // that still need to do something ELSE once a save lands (reset
  // local UI state, navigate away).
  onSaved?: () => void | Promise<void>,
): UseEditTransferModalResult {
  const updateTransfer = useUpdateTransferMutation();
  const { data: rateRows } = useCurrencyRates();
  const ratesByCurrencyId = useMemo(
    () => indexRatesByCurrencyId(rateRows ?? []),
    [rateRows],
  );

  const modal = useTargetedModal<TransferRow, EditTransferFormValues>({
    // The accounts are fixed in this sheet, so a problem with one
    // ("Insufficient balance…") is the sheet's one message line.
    operation: 'Edit transfer',
    initialValues: transfer => ({
      amount: String(transfer.amount),
      convertedAmount: String(transfer.toAmount),
      // Starts true: the stored converted amount is the figure the user
      // already accepted when they created this transfer. Re-deriving it
      // from today's rate the moment the sheet opens would quietly
      // rewrite a past agreement, which is the one thing this feature is
      // careful never to do.
      convertedTouched: true,
      date: transfer.date,
    }),
    validate: (values, transfer) => {
      const parsedAmount = Number(values.amount);
      if (!values.amount.trim()) {
        return 'Enter an amount';
      }
      if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        return 'Enter an amount greater than 0';
      }
      if (transfer.isCrossCurrency) {
        const parsedTo = Number(values.convertedAmount);
        if (
          !values.convertedAmount ||
          Number.isNaN(parsedTo) ||
          parsedTo <= 0
        ) {
          return 'Enter a converted amount greater than 0';
        }
      }
      return null;
    },
    // The converted amount is only a field at all when the transfer
    // actually converts, so it is only ever required in that case.
    requiredFields: (values, transfer) => {
      const missing: string[] = [];
      if (!values.amount.trim()) {
        missing.push('amount');
      }
      if (transfer.isCrossCurrency && !values.convertedAmount.trim()) {
        missing.push('convertedAmount');
      }
      return missing;
    },
    // Accounts and both currencies are carried over unchanged from the
    // original transfer — updateTransfer still needs them to reverse that
    // exact original effect before applying the new one. `description` is
    // deliberately NOT passed: omitting it leaves the stored value alone,
    // which is what keeps a savings transfer's goal name in History after
    // its amount is corrected here.
    onSubmit: (target, values) =>
      updateTransfer(target.id, {
        fromAccountId: target.fromAccountId,
        toAccountId: target.toAccountId,
        amount: Number(values.amount),
        currencyId: target.currencyId,
        toCurrencyId: target.toCurrencyId,
        toAmount: target.isCrossCurrency
          ? Number(values.convertedAmount)
          : Number(values.amount),
        date: values.date,
      }),
    onSaved,
  });

  const setField = <K extends keyof EditTransferFormValues>(
    key: K,
    value: EditTransferFormValues[K],
  ) => modal.setValues(current => ({ ...current, [key]: value }));

  // Typing in the from-amount re-suggests the converted amount, but only
  // until the user takes that field over themselves.
  const setAmount = useCallback(
    (value: string) => {
      modal.setValues(current => {
        const next = { ...current, amount: value };
        const transfer = modal.target;
        if (!transfer || !transfer.isCrossCurrency || current.convertedTouched) {
          return next;
        }
        const parsed = Number(value);
        if (!value || Number.isNaN(parsed) || parsed <= 0) {
          return { ...next, convertedAmount: '' };
        }
        const converted = convertAmount(
          parsed,
          ratesByCurrencyId.get(transfer.currencyId),
          ratesByCurrencyId.get(transfer.toCurrencyId),
        );
        return {
          ...next,
          convertedAmount: converted == null ? '' : String(converted),
        };
      });
    },
    [modal, ratesByCurrencyId],
  );

  const setConvertedAmount = useCallback(
    (value: string) =>
      modal.setValues(current => ({
        ...current,
        convertedAmount: value,
        convertedTouched: true,
      })),
    [modal],
  );

  const rateHint = useMemo(() => {
    const transfer = modal.target;
    if (!transfer || !transfer.isCrossCurrency) {
      return null;
    }
    const pairRate = getPairRate(
      ratesByCurrencyId.get(transfer.currencyId),
      ratesByCurrencyId.get(transfer.toCurrencyId),
    );
    if (pairRate == null) {
      return `No saved rate for ${transfer.currencyCode} → ${transfer.toCurrencyCode}.`;
    }
    return `Saved rate: 1 ${transfer.currencyCode} = ${pairRate} ${transfer.toCurrencyCode}`;
  }, [modal.target, ratesByCurrencyId]);

  return {
    ...modal,
    setAmount,
    setConvertedAmount,
    setDate: value => setField('date', value),
    rateHint,
  };
}
