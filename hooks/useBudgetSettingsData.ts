import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  getAccountBalance,
  getAccounts,
  getAllBudgets,
  getBudgetForMonth,
  getDefaultCurrency,
} from '../db/queries';

const CREDIT_CARD_TYPE = 'CreditCard';

export type BudgetRow = Awaited<ReturnType<typeof getAllBudgets>>[number];
export type CreditCardRow = Awaited<ReturnType<typeof getAccounts>>[number] & {
  debt: number;
};

export interface UseBudgetSettingsDataResult {
  amount: string;
  setAmount: (value: string) => void;
  currencyCode: string;
  allBudgets: BudgetRow[];
  creditCards: CreditCardRow[];
  reload: () => Promise<void>;
}

// `onMonthChange` lets the screen keep its own `savedMessage` banner
// state (purely a Save-button feedback concern, not fetched data) while
// still having this hook own the effect that clears it whenever the
// selected month changes — mirrors the original screen's own
// `useEffect(() => setSavedMessage(null), [selectedMonth])`.
export function useBudgetSettingsData(
  selectedMonth: string,
  onMonthChange?: () => void,
): UseBudgetSettingsDataResult {
  const [amount, setAmount] = useState('');
  const [currencyCode, setCurrencyCode] = useState('');
  const [allBudgets, setAllBudgets] = useState<BudgetRow[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCardRow[]>([]);

  const reload = useCallback(async () => {
    const [existing, all, accounts, defaultCurrency] = await Promise.all([
      getBudgetForMonth(selectedMonth),
      getAllBudgets(),
      getAccounts(),
      getDefaultCurrency(),
    ]);
    setAmount(existing ? String(existing.limitAmount) : '');
    setAllBudgets(all);
    setCurrencyCode(defaultCurrency?.code ?? '');

    const cardAccounts = accounts.filter(account => account.type === CREDIT_CARD_TYPE);
    // Card debt is computed in the default currency only for now.
    const withDebt = await Promise.all(
      cardAccounts.map(async account => ({
        ...account,
        debt: defaultCurrency
          ? -(await getAccountBalance(account.id, defaultCurrency.id))
          : 0,
      })),
    );
    setCreditCards(withDebt);
  }, [selectedMonth]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  useEffect(() => {
    onMonthChange?.();
    // onMonthChange is a fresh closure every render (it wraps the
    // screen's own setSavedMessage) and deliberately left out of this
    // list — only an actual `selectedMonth` change should re-fire this,
    // same as the original screen's own effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth]);

  return { amount, setAmount, currencyCode, allBudgets, creditCards, reload };
}
