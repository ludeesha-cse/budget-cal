import { useEffect, useMemo, useState } from 'react';
import {
  useAccountList,
  useAllBudgetsForCurrency,
  useBudgetCurrencyOptions,
  useBudgetForMonth,
  useCreditCardDebtByAccountId,
  useDefaultCurrency,
} from './queries';
import {
  getAccounts,
  getAllBudgetsForCurrency,
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
}

// `onMonthChange` lets the screen keep its own `savedMessage` banner
// state (purely a Save-button feedback concern, not fetched data) while
// still having this hook own the effect that clears it whenever the
// selected month changes — mirrors the original screen's own
// `useEffect(() => setSavedMessage(null), [selectedMonth])`.
//
// Switching the month or the currency tab no longer refetches anything
// it has already seen: each (month, currency) pair is its own cache
// entry, so flipping back and forth between tabs is free after the first
// visit. Saving a budget invalidates the budget prefix, which is what
// refreshes these without a manual reload.
export function useBudgetSettingsData(
  selectedMonth: string,
  onMonthChange?: () => void,
): UseBudgetSettingsDataResult {
  const [amount, setAmount] = useState('');
  // null until the options query resolves and picks a starting tab (the
  // default currency, same convention as every other currency-tabbed
  // screen in this app) — kept separate from currencyOptions so the
  // screen can render tabs immediately once options arrive even before
  // that month's own budget amount has loaded.
  const [currencyId, setCurrencyId] = useState<number | null>(null);

  const { data: options } = useBudgetCurrencyOptions();
  const { data: defaultCurrency } = useDefaultCurrency();
  const { data: accounts } = useAccountList();

  // Keep the current tab selection if it's still a real currency,
  // otherwise fall back to the default currency, otherwise the first
  // option — same resolution order Reports' useReportData uses for its
  // own currency selection.
  const resolvedCurrencyId = useMemo(() => {
    if (!options) {
      return currencyId;
    }
    if (currencyId != null && options.some(c => c.id === currencyId)) {
      return currencyId;
    }
    if (defaultCurrency && options.some(c => c.id === defaultCurrency.id)) {
      return defaultCurrency.id;
    }
    return options[0]?.id ?? null;
  }, [options, currencyId, defaultCurrency]);

  useEffect(() => {
    if (resolvedCurrencyId !== currencyId) {
      setCurrencyId(resolvedCurrencyId);
    }
  }, [resolvedCurrencyId, currencyId]);

  const { data: existing } = useBudgetForMonth(selectedMonth, resolvedCurrencyId);
  const { data: allBudgets } = useAllBudgetsForCurrency(resolvedCurrencyId);

  // Seeds the editable amount field from whatever the month/currency
  // pair currently has saved — the same assignment reload() used to make
  // after its fetch, just driven by the query resolving instead.
  useEffect(() => {
    setAmount(existing ? String(existing.limitAmount) : '');
  }, [existing, selectedMonth, resolvedCurrencyId]);

  const cardAccounts = useMemo(
    () => (accounts ?? []).filter(account => account.type === CREDIT_CARD_TYPE),
    [accounts],
  );
  const cardAccountIds = useMemo(
    () => cardAccounts.map(account => account.id),
    [cardAccounts],
  );
  // Card debt is computed in the default currency only for now —
  // unrelated to which currency's budget tab is selected, so this doesn't
  // depend on resolvedCurrencyId.
  const debtByAccountId = useCreditCardDebtByAccountId(
    cardAccountIds,
    defaultCurrency?.id ?? null,
  );
  const creditCards = useMemo<CreditCardRow[]>(
    () =>
      cardAccounts.map(account => ({
        ...account,
        debt: debtByAccountId[account.id] ?? 0,
      })),
    [cardAccounts, debtByAccountId],
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
    (options ?? []).find(option => option.id === currencyId)?.code ?? '';

  return {
    amount,
    setAmount,
    currencyId,
    setCurrencyId,
    currencyOptions: options ?? [],
    currencyCode,
    defaultCurrencyCode: defaultCurrency?.code ?? '',
    currentBudgetId: existing?.id ?? null,
    allBudgets: allBudgets ?? [],
    creditCards,
  };
}
