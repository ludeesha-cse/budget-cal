import { useMemo } from 'react';

import { formatDateString } from '../utils/date';
import { creditCardDebt } from '../utils/balanceMath';
import { useTargetedModal } from './useTargetedModal';
import type { UseTargetedModalResult } from './useTargetedModal';
import type { AccountBalanceRow, AccountWithBalances } from './useAccounts';
import {
  usePayOffCreditCard as usePayOffCreditCardMutation,
} from './queries';

// Only ordinary asset accounts can fund a card payoff — paying a credit
// card off with another credit card, a liability, or a receivable isn't
// a real payment, it's just moving debt around.
export const PAYOFF_SOURCE_ACCOUNT_TYPES = ['Bank', 'Cash', 'CryptoWallet'];

export type PayOffTarget = {
  accountId: number;
  accountName: string;
  currencyId: number;
  currencyCode: string;
  currentDebt: number;
};

export type PayOffValues = {
  amount: string;
  payingAccountId: string;
  date: string;
};

export interface UsePayOffCardResult
  extends UseTargetedModalResult<PayOffTarget, PayOffValues> {
  openPayOffCard: (
    account: AccountWithBalances,
    balance: AccountBalanceRow,
  ) => void;
  setAmount: (value: string) => void;
  setPayingAccountId: (value: string) => void;
  setDate: (value: string) => void;
  // Every active, eligible-type account that also holds a balance in the
  // target card's currency — recomputed only when the account list or
  // the open target actually changes, not on every keystroke in the
  // amount field, unlike the two inline recomputations this replaces in
  // the transfer modal's JSX (Step 13f handles those).
  payOffPayingAccountOptions: AccountWithBalances[];
}

// Separate from useUpdateBalance above — a payoff moves real money out of
// a paying account via payOffCreditCard(), it doesn't just overwrite a
// stored number the way an audit correction does. Built on
// useTargetedModal (Step 8), same as useUpdateBalance: both validation
// failures and any payOffCreditCard error surface as the hook's own
// inline `error` string.
export function usePayOffCard(
  activeAccounts: AccountWithBalances[],
  // Optional since the TanStack Query refactor: a caller used to pass
  // its screen's load() here purely to re-read the database after a
  // successful write. The mutation hooks now invalidate every affected
  // query themselves, so that job is done — this is left for callers
  // that still need to do something ELSE once a save lands (reset
  // local UI state, navigate away).
  onSaved?: () => void | Promise<void>,
): UsePayOffCardResult {
  // Write paths go through the caching layer's mutation hooks: each
  // one runs the same db/queries function as before and then
  // invalidates every query its write can affect (see
  // hooks/queries/invalidation.ts). The call sites below are
  // unchanged — these hooks take the wrapped function's own arguments.
  const payOffCreditCard = usePayOffCreditCardMutation();
  const modal = useTargetedModal<PayOffTarget, PayOffValues>({
    initialValues: target => {
      const eligiblePayingAccounts = activeAccounts.filter(
        a =>
          a.id !== target.accountId &&
          PAYOFF_SOURCE_ACCOUNT_TYPES.includes(a.type),
      );
      const eligiblePayingAccount = eligiblePayingAccounts.find(a =>
        a.balances.some(b => b.currencyId === target.currencyId),
      );
      return {
        amount: '',
        payingAccountId: eligiblePayingAccount
          ? String(eligiblePayingAccount.id)
          : '',
        date: formatDateString(new Date()),
      };
    },
    validate: values => {
      const parsedAmount = Number(values.amount);
      if (!values.amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        return 'Enter a payment amount greater than zero.';
      }
      if (!values.payingAccountId) {
        return 'Choose the Bank, Cash, or Crypto Wallet account this payment is coming from.';
      }
      return null;
    },
    onSubmit: (target, values) =>
      payOffCreditCard({
        creditCardAccountId: target.accountId,
        payingAccountId: Number(values.payingAccountId),
        amount: Number(values.amount),
        currencyId: target.currencyId,
        date: values.date,
      }),
    onSaved,
  });

  const openPayOffCard = (
    account: AccountWithBalances,
    balance: AccountBalanceRow,
  ) => {
    // The card's stored balance is the negative of what's owed — see
    // utils/balanceMath.ts's creditCardDebt for the shared sign-flip.
    // balance.currentBalance is already computed by useAccounts' load(),
    // so no extra DB round trip is needed just to show the debt here.
    modal.open({
      accountId: account.id,
      accountName: account.name,
      currencyId: balance.currencyId,
      currencyCode: balance.currencyCode,
      currentDebt: creditCardDebt(balance.currentBalance),
    });
  };

  const setAmount = (value: string) =>
    modal.setValues(current => ({ ...current, amount: value }));
  const setPayingAccountId = (value: string) =>
    modal.setValues(current => ({ ...current, payingAccountId: value }));
  const setDate = (value: string) =>
    modal.setValues(current => ({ ...current, date: value }));

  const payOffPayingAccountOptions = useMemo(() => {
    if (!modal.target) {
      return [];
    }
    const target = modal.target;
    return activeAccounts.filter(
      a =>
        a.id !== target.accountId &&
        PAYOFF_SOURCE_ACCOUNT_TYPES.includes(a.type) &&
        a.balances.some(b => b.currencyId === target.currencyId),
    );
  }, [activeAccounts, modal.target]);

  return {
    ...modal,
    openPayOffCard,
    setAmount,
    setPayingAccountId,
    setDate,
    payOffPayingAccountOptions,
  };
}
