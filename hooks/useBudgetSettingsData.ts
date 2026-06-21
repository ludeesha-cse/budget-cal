import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  getAccountBalance,
  getAccounts,
  getAllBudgetsForCurrency,
  getBudgetCurrencyOptions,
  getBudgetForMonth,
  getDefaultCurrency,
  type CurrencyOption,
} from '../db/queries';

const CREDIT_CARD_TYPE = 'CreditCard';

export type BudgetRow = Awaited<ReturnType<typeof getAllBudgetsForCurrency>>[number];
export type CreditCardRow = Awaited<ReturnType<typeof getAccounts>>[number] & {
  debt: number;
};

export interface UseBudgetSettingsDataResult {
  amount: string;
  setAmount: (value: string) => void;
  currencyId: number | null;
  setCurrencyId: (id: number) => void;
  currencyOptions: CurrencyOption[];
  currencyCode: string;
  // Separate from `currencyCode` on purpose — credit card debt (below) is
  // always computed in the default currency regardless of which budget
  // tab is selected, so its own label needs the default currency's code,
  // not whatever currency tab happens to be active.
  defaultCurrencyCode: string;
  currentBudgetId: number | null;
  allBudgets: BudgetRow[];
  creditCards: CreditCardRow[];
  reload: () => Promise<void>;
}

// `onMonthChange` lets the screen keep its own `savedMessage` banner
// state (purely a Save-button feedback concern, not fetched data) while
// still having this hook own the effect that clears it whenever the
// selected month or currency tab changes — mirrors the original screen's
// own `useEffect(() => setSavedMessage(null), [selectedMonth])`.
export function useBudgetSettingsData(
  selectedMonth: string,
  onMonthChange?: () => void,
): UseBudgetSettingsDataResult {
  const [amount, setAmount] = useState('');
  // null until the first load resolves and picks a starting tab (the
  // default currency, same convention as every other currency-tabbed
  // screen in this app) — kept separate from currencyOptions so the
  // screen can render tabs immediately once options arrive even before
  // that month's own budget amount has loaded.
  const [currencyId, setCurrencyId] = useState<number | null>(null);
  const [currencyOptions, setCurrencyOptions] = useState<CurrencyOption[]>([]);
  const [currentBudgetId, setCurrentBudgetId] = useState<number | null>(null);
  const [allBudgets, setAllBudgets] = useState<BudgetRow[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCardRow[]>([]);
  const [defaultCurrencyCode, setDefaultCurrencyCode] = useState('');

  const reload = useCallback(async () => {
    const [options, defaultCurrency, accounts] = await Promise.all([
      getBudgetCurrencyOptions(),
      getDefaultCurrency(),
      getAccounts(),
    ]);
    setCurrencyOptions(options);
    setDefaultCurrencyCode(defaultCurrency?.code ?? '');

    // Keep the current tab selection if it's still a real currency,
    // otherwise fall back to the default currency, otherwise the first
    // option — same resolution order Reports' useReportData uses for its
    // own currency selection.
    const resolvedCurrencyId =
      currencyId != null && options.some(c => c.id === currencyId)
        ? currencyId
        : (defaultCurrency && options.some(c => c.id === defaultCurrency.id)
            ? defaultCurrency.id
            : (options[0]?.id ?? null));
    if (resolvedCurrencyId !== currencyId) {
      setCurrencyId(resolvedCurrencyId);
    }

    if (resolvedCurrencyId == null) {
      setAmount('');
      setCurrentBudgetId(null);
      setAllBudgets([]);
      setCreditCards([]);
      return;
    }

    const [existing, all] = await Promise.all([
      getBudgetForMonth(selectedMonth, resolvedCurrencyId),
      getAllBudgetsForCurrency(resolvedCurrencyId),
    ]);
    setAmount(existing ? String(existing.limitAmount) : '');
    setCurrentBudgetId(existing?.id ?? null);
    setAllBudgets(all);

    const cardAccounts = accounts.filter(account => account.type === CREDIT_CARD_TYPE);
    // Card debt is computed in the default currency only for now —
    // unrelated to which currency's budget tab is selected, so this
    // doesn't depend on resolvedCurrencyId.
    const withDebt = await Promise.all(
      cardAccounts.map(async account => ({
        ...account,
        debt: defaultCurrency
          ? -(await getAccountBalance(account.id, defaultCurrency.id))
          : 0,
      })),
    );
    setCreditCards(withDebt);
  }, [selectedMonth, currencyId]);

  // Re-runs on focus AND whenever `reload` itself changes identity — which
  // happens whenever selectedMonth or currencyId changes (see reload's own
  // dependency array) — so switching the month or the currency tab both
  // reload exactly like CategoryBudgetsScreen's own load-on-change pattern.
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

  const currencyCode =
    currencyOptions.find(option => option.id === currencyId)?.code ?? '';

  return {
    amount,
    setAmount,
    currencyId,
    setCurrencyId,
    currencyOptions,
    currencyCode,
    defaultCurrencyCode,
    currentBudgetId,
    allBudgets,
    creditCards,
    reload,
  };
}
