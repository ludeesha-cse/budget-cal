import {
  deleteBudget,
  upsertBudget,
  upsertCategoryBudget,
  upsertCategoryBudgets,
} from '../../../db/queries';
import { invalidates, useDbMutation } from '../invalidation';

// Budget writes change the LIMIT side only — no transaction moves, so
// the ledger and the account balances are deliberately left alone.
// Callable with the wrapped function's own arguments.

export function useUpsertBudget() {
  return useDbMutation(upsertBudget, invalidates.budgetWrite);
}

export function useDeleteBudget() {
  return useDbMutation(deleteBudget, invalidates.budgetWrite);
}

export function useUpsertCategoryBudget() {
  return useDbMutation(upsertCategoryBudget, invalidates.budgetWrite);
}

// Every row of the Category Budgets screen in one transaction.
export function useUpsertCategoryBudgets() {
  return useDbMutation(upsertCategoryBudgets, invalidates.budgetWrite);
}
