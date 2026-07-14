import { useCallback, useState } from 'react';

import { useAsyncAction } from './useAsyncAction';
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
  toggleAddCurrency: (accountId: number) => void;
  handleAddCurrencySubmit: (accountId: number) => Promise<void>;
}

// The inline "add a currency this account doesn't have a balance in yet"
// form that expands under an account row. Kept separate from useAccounts
// (which owns the list itself) since `onSaved` is the only thing this
// hook needs from it.
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

  const toggleAddCurrency = useCallback(
    (accountId: number) => {
      if (addCurrencyAccountId === accountId) {
        setAddCurrencyAccountId(null);
        return;
      }
      setAddCurrencyAccountId(accountId);
      setAddCurrencyCurrencyId('');
      setAddCurrencyBalance('');
    },
    [addCurrencyAccountId],
  );

  const handleAddCurrencySubmit = useCallback(
    async (accountId: number) => {
      const parsedBalance = Number(addCurrencyBalance);
      if (
        !addCurrencyCurrencyId ||
        !addCurrencyBalance ||
        Number.isNaN(parsedBalance)
      ) {
        return;
      }
      await runAction(async () => {
        await addCurrencyToAccount(
          accountId,
          Number(addCurrencyCurrencyId),
          parsedBalance,
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
  };
}
