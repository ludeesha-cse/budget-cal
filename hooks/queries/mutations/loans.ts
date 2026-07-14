import {
  createLoanAccount,
  reactivateLoanAccount,
  settleLoan,
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
