import {
  createInstallmentPlan,
  deleteInstallmentPlan,
  payInstallment,
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
