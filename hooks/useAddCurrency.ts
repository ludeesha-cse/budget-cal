import { useCallback, useMemo, useRef, useState } from 'react';

import { defaultCurrencyId } from '../utils/currencyHelpers';
import { useAsyncAction } from './useAsyncAction';
import { useFieldErrors } from './useFieldErrors';
import type { CurrencyRow } from './useAccounts';
import {
  useAddCurrencyToAccount as useAddCurrencyToAccountMutation,
} from './queries';

export interface UseAddCurrencyResult {
  // Which account's inline "+ Add Currency" form is expanded, or null if
  // none is — only ever one at a time, matching the original screen.
  addCurrencyAccountId: number | null;
  addCurrencyCurrencyId: string;
  setAddCurrencyCurrencyId: React.Dispatch<React.SetStateAction<string>>;
  addCurrencyBalance: string;
  setAddCurrencyBalance: React.Dispatch<React.SetStateAction<string>>;
  // Takes the currencies this particular account does NOT hold yet, so
  // opening the form can preselect one — the caller already computes
  // that list to render the picker.
  toggleAddCurrency: (
    accountId: number,
    availableCurrencies: CurrencyRow[],
  ) => void;
  handleAddCurrencySubmit: (accountId: number) => Promise<void>;
  // The form-validation contract every other form in this app follows:
  // canSave mutes the button without disabling it, isMissing outlines
  // the empty required fields once the user has pressed it anyway, and
  // error is the single summary line. See hooks/useFieldErrors.
  canSave: boolean;
  isMissing: (field: string) => boolean;
  error: string | null;
}

// The inline "add a currency this account doesn't have a balance in yet"
// form that expands under an account row. Kept separate from useAccounts
// (which owns the list itself) since `onSaved` is the only thing this
// hook needs from it.
//
// This was the last form in the app still failing silently: submit
// simply returned when the currency or the balance was empty, so the
// Add button did nothing and said nothing about why. It now follows the
// same muted-button / red-outline pattern as every other form here —
// see hooks/useFieldErrors for why that shape rather than a disabled
// button.
export function useAddCurrency(
  // Optional since the TanStack Query refactor: a caller used to pass
  // its screen's load() here purely to re-read the database after a
  // successful write. The mutation hooks now invalidate every affected
  // query themselves, so that job is done — this is left for callers
  // that still need to do something ELSE once a save lands (reset
  // local UI state, navigate away).
  onSaved?: () => void | Promise<void>,
): UseAddCurrencyResult {
  // Write paths go through the caching layer's mutation hooks: each
  // one runs the same db/queries function as before and then
  // invalidates every query its write can affect (see
  // hooks/queries/invalidation.ts). The call sites below are
  // unchanged — these hooks take the wrapped function's own arguments.
  const addCurrencyToAccount = useAddCurrencyToAccountMutation();
  const runAction = useAsyncAction();
  const [addCurrencyAccountId, setAddCurrencyAccountId] = useState<
    number | null
  >(null);
  const [addCurrencyCurrencyId, setAddCurrencyCurrencyId] = useState('');
  const [addCurrencyBalance, setAddCurrencyBalance] = useState('');
  const [error, setError] = useState<string | null>(null);

  // A starting balance of 0 is a perfectly real answer ("this account
  // holds this currency, just none of it right now"), so "missing" here
  // means the field is EMPTY, never that it is zero. A non-numeric
  // entry is present-but-wrong and belongs in the message instead of in
  // an outline that means "you left this blank" — see the requiredFields
  // vs validate split in useEntityFormModal.
  const missingFields = useMemo(() => {
    const missing: string[] = [];
    if (!addCurrencyCurrencyId) {
      missing.push('currencyId');
    }
    if (!addCurrencyBalance.trim()) {
      missing.push('balance');
    }
    return missing;
  }, [addCurrencyCurrencyId, addCurrencyBalance]);

  const validationError = useMemo(() => {
    if (!addCurrencyCurrencyId) {
      return 'Select a currency';
    }
    if (!addCurrencyBalance.trim()) {
      return 'Enter a starting balance';
    }
    if (Number.isNaN(Number(addCurrencyBalance))) {
      return 'Enter a valid starting balance';
    }
    return null;
  }, [addCurrencyCurrencyId, addCurrencyBalance]);

  const fieldErrors = useFieldErrors(missingFields);
  // Read through a ref so the callbacks below can reveal or clear the
  // outlines without listing fieldErrors — whose identity changes on
  // every keystroke — as a dependency.
  const fieldErrorsRef = useRef(fieldErrors);
  fieldErrorsRef.current = fieldErrors;

  const toggleAddCurrency = useCallback(
    (accountId: number, availableCurrencies: CurrencyRow[]) => {
      if (addCurrencyAccountId === accountId) {
        setAddCurrencyAccountId(null);
        return;
      }
      setAddCurrencyAccountId(accountId);
      // Preselects the user's default currency when this account can
      // still take it, falling back to the first one it can — the
      // picker used to open on "Select currency" and made them answer a
      // question that almost always has the same answer.
      setAddCurrencyCurrencyId(defaultCurrencyId(availableCurrencies));
      setAddCurrencyBalance('');
      setError(null);
      fieldErrorsRef.current.reset();
    },
    [addCurrencyAccountId],
  );

  const handleAddCurrencySubmit = useCallback(
    async (accountId: number) => {
      if (validationError) {
        setError(validationError);
        // The press that could not save is exactly the moment to say
        // which controls are why.
        fieldErrorsRef.current.reveal();
        return;
      }
      setError(null);
      fieldErrorsRef.current.reset();
      await runAction(async () => {
        await addCurrencyToAccount(
          accountId,
          Number(addCurrencyCurrencyId),
          Number(addCurrencyBalance),
        );
        setAddCurrencyAccountId(null);
        setAddCurrencyCurrencyId('');
        setAddCurrencyBalance('');
        await onSaved?.();
      }, 'Cannot add currency');
    },
    // addCurrencyToAccount is the mutation hook's callable — stable
    // across renders (useCallback + useMemo inside useDbMutation), so
    // listing it here does not re-create this callback each render.
    [
      validationError,
      addCurrencyCurrencyId,
      addCurrencyBalance,
      runAction,
      onSaved,
      addCurrencyToAccount,
    ],
  );

  return {
    addCurrencyAccountId,
    addCurrencyCurrencyId,
    setAddCurrencyCurrencyId,
    addCurrencyBalance,
    setAddCurrencyBalance,
    toggleAddCurrency,
    handleAddCurrencySubmit,
    canSave: validationError === null,
    isMissing: fieldErrors.isMissing,
    error,
  };
}
