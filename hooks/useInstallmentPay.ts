import { useCallback, useEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { formatDateString } from '../utils/date';
import type { SettingsStackParamList } from '../navigation/types';
import { useTargetedModal } from './useTargetedModal';
import type { UseTargetedModalResult } from './useTargetedModal';
import type {
  InstallmentAccountRow,
  InstallmentPlanRow,
} from './useInstallmentPlansData';
import {
  usePayInstallment as usePayInstallmentMutation,
} from './queries';

export type PayInstallmentValues = {
  accountId: string;
  date: string;
  // Only read in custom mode. Empty in scheduled mode, where the amount
  // is the plan's own figure and there is no field for it.
  amount: string;
};

export interface UseInstallmentPayResult
  extends UseTargetedModalResult<InstallmentPlanRow, PayInstallmentValues> {
  setAccountId: (value: string) => void;
  setDate: (value: string) => void;
  setAmount: (value: string) => void;
  // Which of the two things this sheet is currently doing. The sheet is
  // shared because everything except the amount is identical.
  isCustom: boolean;
  // Pay the next installment at the plan's scheduled figure.
  openScheduled: (plan: InstallmentPlanRow) => void;
  // Pay the next installment at an amount the user types — paying early,
  // clearing the plan sooner, or paying part of a month now.
  openCustom: (plan: InstallmentPlanRow) => void;
}

// Pay the next installment on a plan, at the scheduled amount or at one
// the user types. Built on useTargetedModal (Step 8): the target is the
// plan itself (payInstallment's own getNextUnpaidInstallmentNumber
// figures out which installment number that means), so no separate
// "which plan" state is needed beyond what useTargetedModal tracks.
//
// BOTH MODES TICK OFF THE SAME NEXT SLOT. A custom amount changes how
// much money moved, never which installment it answered — the paid set
// stays the contiguous 1..n prefix that getNextUnpaidInstallmentNumber,
// the progress ring and Undo all depend on. Overpaying therefore shows
// up as the remaining balance falling faster than the slot count, which
// is exactly what paying ahead means.
//
// `isCustom` is plain state rather than part of `values` because it is
// chosen by WHICH BUTTON opened the sheet, not by anything in the form —
// useTargetedModal derives its initial values from the target alone, and
// it has no notion of an open-time argument.
export function useInstallmentPay(
  activeAccounts: InstallmentAccountRow[],
  // Optional since the TanStack Query refactor: a caller used to pass
  // its screen's load() here purely to re-read the database after a
  // successful write. The mutation hooks now invalidate every affected
  // query themselves, so that job is done — this is left for callers
  // that still need to do something ELSE once a save lands (reset
  // local UI state, navigate away).
  onSaved?: () => void | Promise<void>,
): UseInstallmentPayResult {
  // Write paths go through the caching layer's mutation hooks: each
  // one runs the same db/queries function as before and then
  // invalidates every query its write can affect (see
  // hooks/queries/invalidation.ts). The call sites below are
  // unchanged — these hooks take the wrapped function's own arguments.
  const payInstallment = usePayInstallmentMutation();
  const [isCustom, setIsCustom] = useState(false);
  const modal = useTargetedModal<InstallmentPlanRow, PayInstallmentValues>({
    initialValues: () => ({
      accountId: activeAccounts[0] ? String(activeAccounts[0].id) : '',
      date: formatDateString(new Date()),
      amount: '',
    }),
    validate: values => {
      if (!values.accountId) {
        return 'Choose which account is paying this installment.';
      }
      if (isCustom) {
        const parsed = Number(values.amount);
        if (!values.amount || Number.isNaN(parsed) || parsed <= 0) {
          return 'Enter an amount greater than zero.';
        }
      }
      return null;
    },
    requiredFields: values => {
      const missing: string[] = [];
      if (!values.accountId) {
        missing.push('accountId');
      }
      if (isCustom && (!values.amount || Number(values.amount) <= 0)) {
        missing.push('amount');
      }
      return missing;
    },
    onSubmit: (target, values) =>
      payInstallment({
        planId: target.id,
        accountId: Number(values.accountId),
        date: values.date,
        // Omitted entirely in scheduled mode, which is what makes
        // payInstallment fall back to the plan's own figure and record
        // the payment as fixed (and therefore undo-only in History).
        customAmount: isCustom ? Number(values.amount) : undefined,
      }),
    onSaved,
  });

  const setAccountId = (value: string) =>
    modal.setValues(current => ({ ...current, accountId: value }));
  const setDate = (value: string) =>
    modal.setValues(current => ({ ...current, date: value }));
  const setAmount = (value: string) =>
    modal.setValues(current => ({ ...current, amount: value }));

  // The mode is set BEFORE open() so the sheet's first render already
  // knows which shape it is — open() seeds the values synchronously, and
  // a mode set afterwards would show one frame of the wrong form.
  const modalOpen = modal.open;
  const openScheduled = useCallback(
    (plan: InstallmentPlanRow) => {
      setIsCustom(false);
      modalOpen(plan);
    },
    [modalOpen],
  );
  const openCustom = useCallback(
    (plan: InstallmentPlanRow) => {
      setIsCustom(true);
      modalOpen(plan);
    },
    [modalOpen],
  );

  return {
    ...modal,
    setAccountId,
    setDate,
    setAmount,
    isCustom,
    openScheduled,
    openCustom,
  };
}

type InstallmentPlansScreenProps = NativeStackScreenProps<
  SettingsStackParamList,
  'InstallmentPlans'
>;

// Arriving here via Dashboard's installment reminder "Pay" button —
// route.params.payPlanId is only ever set for that one navigation. Waits
// for `plans` to actually contain the target (the list is still loading
// on first render) before opening, and clears the param immediately after
// so navigating back to this screen later — from the tab bar, from "Add"
// — never reopens the same pay modal unexpectedly.
export function usePayPlanDeepLink(
  route: InstallmentPlansScreenProps['route'],
  navigation: InstallmentPlansScreenProps['navigation'],
  plans: InstallmentPlanRow[],
  open: (plan: InstallmentPlanRow) => void,
): void {
  useEffect(() => {
    const targetId = route.params?.payPlanId;
    if (targetId == null) {
      return;
    }
    const plan = plans.find(p => p.id === targetId);
    if (plan) {
      open(plan);
      navigation.setParams({ payPlanId: undefined });
    }
    // Deliberately keyed only on plans/payPlanId, same as the original —
    // navigation/open are read for their current closures, not reasons to
    // re-fire this on their own identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, route.params?.payPlanId]);
}
