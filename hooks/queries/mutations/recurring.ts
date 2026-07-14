import {
  confirmOccurrence,
  createRecurringRule,
  deleteRecurringRule,
  generatePendingOccurrences,
  setRecurringRuleActive,
  skipOccurrence,
  updateRecurringRule,
} from '../../../db/queries';
import { invalidates, useDbMutation } from '../invalidation';

// Rule writes move the rule list and what can be generated from it —
// nothing has been posted to the ledger yet.
export function useCreateRecurringRule() {
  return useDbMutation(createRecurringRule, invalidates.recurringRuleWrite);
}

export function useUpdateRecurringRule() {
  return useDbMutation(updateRecurringRule, invalidates.recurringRuleWrite);
}

export function useSetRecurringRuleActive() {
  return useDbMutation(setRecurringRuleActive, invalidates.recurringRuleWrite);
}

export function useDeleteRecurringRule() {
  return useDbMutation(deleteRecurringRule, invalidates.recurringRuleWrite);
}

// Generation is idempotent and only ever adds pending occurrences, so the
// recurring prefix is its whole reach.
export function useGeneratePendingOccurrences() {
  return useDbMutation(
    generatePendingOccurrences,
    invalidates.recurringRuleWrite,
  );
}

// Confirming posts a real transactions row for the occurrence, so this
// reaches the ledger, the account balance and the budget figures on top
// of clearing the pending list.
export function useConfirmOccurrence() {
  return useDbMutation(confirmOccurrence, invalidates.occurrenceConfirm);
}

// Skipping writes no transaction — deliberately narrower than confirming.
export function useSkipOccurrence() {
  return useDbMutation(skipOccurrence, invalidates.occurrenceSkip);
}
