import { useEffect } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { payInstallment } from '../db/queries';
import { formatDateString } from '../utils/date';
import type { SettingsStackParamList } from '../navigation/types';
import { useTargetedModal } from './useTargetedModal';
import type { UseTargetedModalResult } from './useTargetedModal';
import type {
  InstallmentAccountRow,
  InstallmentPlanRow,
} from './useInstallmentPlansData';

export type PayInstallmentValues = {
  accountId: string;
  date: string;
};

export interface UseInstallmentPayResult
  extends UseTargetedModalResult<InstallmentPlanRow, PayInstallmentValues> {
  setAccountId: (value: string) => void;
  setDate: (value: string) => void;
}

// Pay the next installment on a plan. Built on useTargetedModal (Step 8):
// the target is the plan itself (payInstallment's own
// getNextUnpaidInstallmentNumber figures out which installment number
// that means), so no separate "which plan" state is needed beyond what
// useTargetedModal already tracks.
export function useInstallmentPay(
  activeAccounts: InstallmentAccountRow[],
  onSaved: () => void | Promise<void>,
): UseInstallmentPayResult {
  const modal = useTargetedModal<InstallmentPlanRow, PayInstallmentValues>({
    initialValues: () => ({
      accountId: activeAccounts[0] ? String(activeAccounts[0].id) : '',
      date: formatDateString(new Date()),
    }),
    validate: values =>
      !values.accountId
        ? 'Choose which account is paying this installment.'
        : null,
    onSubmit: (target, values) =>
      payInstallment({
        planId: target.id,
        accountId: Number(values.accountId),
        date: values.date,
      }),
    onSaved,
  });

  const setAccountId = (value: string) =>
    modal.setValues(current => ({ ...current, accountId: value }));
  const setDate = (value: string) =>
    modal.setValues(current => ({ ...current, date: value }));

  return { ...modal, setAccountId, setDate };
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
