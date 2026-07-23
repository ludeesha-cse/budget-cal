import {
  createLoanAccount,
  reactivateLoanAccount,
  settleLoan,
  topUpLoanAccount,
  updateLoanAccount,
} from '../../../db/queries';
import { invalidates, useDbMutation } from '../invalidation';

// Creating a loan creates an account, so the account roster moves as
// well as the loan lists and balances.
export function useCreateLoanAccount() {
  return useDbMutation(createLoanAccount, invalidates.loanAccountWrite);
}

export function useReactivateLoanAccount() {
  return useDbMutation(reactivateLoanAccount, invalidates.loanAccountWrite);
}

// A settlement invalidates both accounts' balances and that loan's own
// detail query — the loans prefix covers total-owed, the active and
// settled lists, and the loan_payments rows History merges in. Like a
// credit card payoff it writes no transactions row, so no transaction
// list and no budget figure is invalidated.
export function useSettleLoan() {
  return useDbMutation(settleLoan, invalidates.loanSettlement);
}

// Topping up an open loan does not create an account, but it does move
// both balances, add an origination row and re-anchor the loan's accrual
// — all of which live under the same prefixes as opening one, so it
// shares that invalidation set rather than inventing a narrower one that
// would have to be kept in step with it.
export function useTopUpLoanAccount() {
  return useDbMutation(topUpLoanAccount, invalidates.loanAccountWrite);
}

// Editing a loan can rename its account, move its principal, switch its
// currency and move money between two real accounts in one go — the
// widest blast radius of any loan write, and exactly the set
// loanAccountWrite already names.
export function useUpdateLoanAccount() {
  return useDbMutation(updateLoanAccount, invalidates.loanAccountWrite);
}
