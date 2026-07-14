import {
  addAccount,
  addAccountWithBalance,
  addCurrencyToAccount,
  closeAccount,
  deleteAccount,
  payOffCreditCard,
  reactivateAccount,
  settleCreditCardAccount,
  updateAccount,
  updateAccountBalanceWithAudit,
} from '../../../db/queries';
import { invalidates, useDbMutation } from '../invalidation';

// Account and account-balance writes. Each hook is callable with the
// wrapped function's own arguments — see useDbMutation.

export function useAddAccount() {
  return useDbMutation(addAccount, invalidates.accountWrite);
}

export function useAddAccountWithBalance() {
  return useDbMutation(addAccountWithBalance, invalidates.accountWrite);
}

export function useAddCurrencyToAccount() {
  return useDbMutation(addCurrencyToAccount, invalidates.accountWrite);
}

export function useUpdateAccount() {
  return useDbMutation(updateAccount, invalidates.accountWrite);
}

export function useDeleteAccount() {
  return useDbMutation(deleteAccount, invalidates.accountWrite);
}

export function useCloseAccount() {
  return useDbMutation(closeAccount, invalidates.accountWrite);
}

export function useReactivateAccount() {
  return useDbMutation(reactivateAccount, invalidates.accountWrite);
}

// A balance correction is not just a balance edit: it posts a real audit
// transactions row, so it invalidates the full ledger and the budget
// figures alongside the balance itself.
export function useUpdateAccountBalanceWithAudit() {
  return useDbMutation(
    updateAccountBalanceWithAudit,
    invalidates.balanceCorrection,
  );
}

// A credit card payoff moves money between the paying account and the
// card by shifting both baselines. Per this project's existing rule a
// payoff is NOT an expense: it writes no transactions row, so this
// deliberately invalidates neither any transaction list nor any
// category/overall budget query — only both accounts' balances and the
// card debt derived from one of them.
export function usePayOffCreditCard() {
  return useDbMutation(payOffCreditCard, invalidates.creditCardPayoff);
}

// Writing off a card's remaining balance rebases the account row itself,
// so the roster moves too — hence accountWrite rather than the narrower
// payoff set.
export function useSettleCreditCardAccount() {
  return useDbMutation(settleCreditCardAccount, invalidates.accountWrite);
}
