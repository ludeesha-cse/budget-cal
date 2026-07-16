import {
  createSavingsGoal,
  createSavingsTransfer,
  deleteContribution,
  deleteSavingsGoal,
  setSavingsGoalStatus,
  updateSavingsGoal,
} from '../../../db/queries';
import { invalidates, useDbMutation } from '../invalidation';

// Two different blast radii here, and the split matters.
//
// Editing a goal's own fields moves no money, so it invalidates only the
// goal list. Funding a goal — or removing a contribution, which reverses
// the transfer behind it — DOES move money, so it invalidates account
// balances and the transfer ledger as well.
//
// This reverses the note that used to sit here. Contributions were once
// a log of intent that touched neither account_balances nor
// transactions, and invalidating balances for one would have been
// meaningless. A contribution is now the by-product of a real transfer,
// so not invalidating balances is what would be wrong.

export function useCreateSavingsGoal() {
  return useDbMutation(createSavingsGoal, invalidates.savingsGoalWrite);
}

export function useUpdateSavingsGoal() {
  return useDbMutation(updateSavingsGoal, invalidates.savingsGoalWrite);
}

export function useSetSavingsGoalStatus() {
  return useDbMutation(setSavingsGoalStatus, invalidates.savingsGoalWrite);
}

export function useDeleteSavingsGoal() {
  // Deleting a goal removes the earmark, not the deposits — the
  // transfers that funded it stay exactly where they are, so no balance
  // moves and the goal list is the whole reach.
  return useDbMutation(deleteSavingsGoal, invalidates.savingsGoalWrite);
}

export function useCreateSavingsTransfer() {
  return useDbMutation(
    createSavingsTransfer,
    invalidates.savingsContributionWrite,
  );
}

export function useDeleteContribution() {
  return useDbMutation(
    deleteContribution,
    invalidates.savingsContributionWrite,
  );
}
