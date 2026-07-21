import {
  advanceInstallmentSchedule,
  createInstallmentPlan,
  deleteInstallmentPlan,
  payInstallment,
  skipInstallmentOccurrence,
  unpayInstallment,
  updateInstallmentPlan,
} from '../../../db/queries';
import { invalidates, useDbMutation } from '../invalidation';

// Creating, editing or deleting a PLAN changes only the plan list and
// the figures derived from it — no money has moved yet.
export function useCreateInstallmentPlan() {
  return useDbMutation(createInstallmentPlan, invalidates.installmentPlanWrite);
}

export function useUpdateInstallmentPlan() {
  return useDbMutation(updateInstallmentPlan, invalidates.installmentPlanWrite);
}

export function useDeleteInstallmentPlan() {
  return useDbMutation(deleteInstallmentPlan, invalidates.installmentPlanWrite);
}

// Paying an installment DOES post a real transactions row, so this
// reaches much further than a plan edit: the plan's own position plus the
// full ledger, the paying account's balance and the budget figures that
// expense counts against.
export function usePayInstallment() {
  return useDbMutation(payInstallment, invalidates.installmentPayment);
}

// Undoing a payment deletes that same transactions row, so it has exactly
// the same reach as making one.
export function useUnpayInstallment() {
  return useDbMutation(unpayInstallment, invalidates.installmentPayment);
}

// Skipping an installment occurrence creates no payment and moves no
// balance — it only clears one reminder, so this is deliberately far
// narrower than paying.
export function useSkipInstallmentOccurrence() {
  return useDbMutation(
    skipInstallmentOccurrence,
    invalidates.installmentOccurrenceSkip,
  );
}

// Opening the door to the next month's occurrence. Exposed as its own
// mutation because a SKIP has to call it explicitly (paying calls it
// internally, as part of payInstallment's own side effect) — a skipped
// month that did not advance would leave the plan with no pending
// occurrence and no way to ever get one.
export function useAdvanceInstallmentSchedule() {
  return useDbMutation(
    advanceInstallmentSchedule,
    invalidates.installmentOccurrenceSkip,
  );
}
