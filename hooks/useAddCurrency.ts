import { useCallback, useState } from 'react';
import { addCurrencyToAccount } from '../db/queries';
import { useAsyncAction } from './useAsyncAction';

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
  onSaved: () => void | Promise<void>,
): UseAddCurrencyResult {
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
        await onSaved();
      }, 'Cannot add currency');
    },
    [addCurrencyCurrencyId, addCurrencyBalance, runAction, onSaved],
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
