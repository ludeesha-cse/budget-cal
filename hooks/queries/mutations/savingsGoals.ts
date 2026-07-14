import {
  addContribution,
  createSavingsGoal,
  deleteContribution,
  deleteSavingsGoal,
  setSavingsGoalStatus,
  updateContribution,
  updateSavingsGoal,
} from '../../../db/queries';
import { invalidates, useDbMutation } from '../invalidation';

// Savings goals are deliberately self-contained. addContribution's own
// doc comment in db/queries/savingsGoals.ts is explicit that a
// contribution is a log of intent, not a movement of money, and touches
// neither account_balances nor transactions — so invalidating balances
// here would contradict the data model rather than being harmless
// over-invalidation.

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
  return useDbMutation(deleteSavingsGoal, invalidates.savingsGoalWrite);
}

export function useAddContribution() {
  return useDbMutation(addContribution, invalidates.savingsGoalWrite);
}

export function useUpdateContribution() {
  return useDbMutation(updateContribution, invalidates.savingsGoalWrite);
}

export function useDeleteContribution() {
  return useDbMutation(deleteContribution, invalidates.savingsGoalWrite);
}
