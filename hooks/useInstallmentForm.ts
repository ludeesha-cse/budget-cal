import { useMemo } from 'react';
import {
  createInstallmentPlan,
  updateInstallmentPlan,
  type NewInstallmentPlanParams,
} from '../db/queries';
import type { PaywallRequest } from '../contexts/PaywallContext';
import type { EntitlementTier } from './useEntitlement';
import { formatDateString } from '../utils/date';
import { defaultCurrencyId } from '../utils/currencyHelpers';
import {
  calculateFromMonthly,
  calculateFromPrincipal,
  type InstallmentSchedule,
} from '../utils/installmentMath';
import { useEntityFormModal } from './useEntityFormModal';
import type { UseEntityFormModalResult } from './useEntityFormModal';
import type {
  InstallmentCategoryRow,
  InstallmentCurrencyRow,
  InstallmentPlanRow,
} from './useInstallmentPlansData';

export type InstallmentMode = 'principal' | 'monthly';

export type InstallmentFormValues = {
  mode: InstallmentMode;
  name: string;
  principalAmount: string;
  // Entered as a plain percentage (e.g. "10" for 10%) — converted to the
  // stored ×100 integer convention only at submit time, same as
  // loan_details.interestRate elsewhere in the app.
  interestRatePercent: string;
  monthlyAmountInput: string;
  numberOfMonths: string;
  // Plain text input, 1-31 — kept as a string (like every other numeric
  // field in this form) so an in-progress/empty entry never fights the
  // user's typing; parsed and range-checked only in validate/toParams.
  // Left blank means "no reminder" (dueDayOfMonth stays null).
  dueDayOfMonth: string;
  categoryId: string;
  currencyId: string;
  startDate: string;
};

export interface UseInstallmentFormResult
  extends UseEntityFormModalResult<InstallmentPlanRow, InstallmentFormValues> {
  // Live preview only — same math the DB layer runs, computed here purely
  // client-side so the user sees the schedule before committing to
  // anything. null for any incomplete or invalid input. Memoized so it
  // only recomputes when a field it actually reads changes, not on every
  // unrelated re-render (the original computed this inline in the
  // component body on every render).
  preview: InstallmentSchedule | null;
  setMode: (mode: InstallmentMode) => void;
  setName: (value: string) => void;
  setPrincipalAmount: (value: string) => void;
  setInterestRatePercent: (value: string) => void;
  setMonthlyAmountInput: (value: string) => void;
  setNumberOfMonths: (value: string) => void;
  setDueDayOfMonth: (value: string) => void;
  setCategoryId: (value: string) => void;
  setCurrencyId: (value: string) => void;
  setStartDate: (value: string) => void;
}

export interface UseInstallmentFormDeps {
  categories: InstallmentCategoryRow[];
  currencies: InstallmentCurrencyRow[];
  tier: EntitlementTier;
  openPaywall: (request: PaywallRequest) => void;
  onSaved: () => void | Promise<void>;
}

// Add/Edit Installment Plan, built on useEntityFormModal (Step 6).
// Installment plans are Premium-only outright (no free-tier allowance, an
// unlike AccountsScreen's per-type slots) — creating is gated on
// `tier === 'free'` alone; editing never is, same standing rule as every
// other useEntityFormModal consumer in this app.
export function useInstallmentForm(
  deps: UseInstallmentFormDeps,
): UseInstallmentFormResult {
  const { categories, currencies, tier, openPaywall, onSaved } = deps;

  const form = useEntityFormModal<
    InstallmentPlanRow,
    InstallmentFormValues,
    NewInstallmentPlanParams
  >({
    initialValues: {
      mode: 'principal',
      name: '',
      principalAmount: '',
      interestRatePercent: '',
      monthlyAmountInput: '',
      numberOfMonths: '',
      dueDayOfMonth: '',
      categoryId: categories[0] ? String(categories[0].id) : '',
      currencyId: defaultCurrencyId(currencies),
      startDate: formatDateString(new Date()),
    },
    populateFromRow: plan => ({
      mode: plan.principalAmount != null ? 'principal' : 'monthly',
      name: plan.name,
      principalAmount:
        plan.principalAmount != null ? String(plan.principalAmount) : '',
      interestRatePercent:
        plan.interestRate != null ? String(plan.interestRate / 100) : '',
      monthlyAmountInput:
        plan.principalAmount == null ? String(plan.monthlyAmount) : '',
      numberOfMonths: String(plan.numberOfMonths),
      dueDayOfMonth:
        plan.dueDayOfMonth != null ? String(plan.dueDayOfMonth) : '',
      categoryId: String(plan.categoryId),
      currencyId: String(plan.currencyId),
      startDate: plan.startDate,
    }),
    validate: values => {
      if (!values.name.trim()) {
        return 'Enter a plan name';
      }
      const parsedMonths = Number(values.numberOfMonths);
      const monthsValid =
        values.numberOfMonths !== '' &&
        Number.isInteger(parsedMonths) &&
        parsedMonths > 0;
      if (!monthsValid) {
        return 'Enter a whole number of months greater than zero';
      }
      if (!values.categoryId) {
        return 'Select a category';
      }
      if (!values.currencyId) {
        return 'Select a currency';
      }
      if (values.dueDayOfMonth !== '') {
        const candidate = Number(values.dueDayOfMonth);
        if (!Number.isInteger(candidate) || candidate < 1 || candidate > 31) {
          return 'Due date must be a day between 1 and 31, or left blank';
        }
      }
      if (values.mode === 'principal') {
        const parsedPrincipal = Number(values.principalAmount);
        if (
          !values.principalAmount ||
          Number.isNaN(parsedPrincipal) ||
          parsedPrincipal <= 0
        ) {
          return 'Enter a valid principal amount';
        }
        const parsedRatePercent = Number(values.interestRatePercent);
        if (
          values.interestRatePercent === '' ||
          Number.isNaN(parsedRatePercent) ||
          parsedRatePercent < 0
        ) {
          return 'Enter a valid interest rate';
        }
      } else {
        const parsedMonthly = Number(values.monthlyAmountInput);
        if (
          !values.monthlyAmountInput ||
          Number.isNaN(parsedMonthly) ||
          parsedMonthly <= 0
        ) {
          return 'Enter a valid monthly amount';
        }
      }
      return null;
    },
    toParams: (values): NewInstallmentPlanParams => {
      const base = {
        name: values.name.trim(),
        numberOfMonths: Number(values.numberOfMonths),
        categoryId: Number(values.categoryId),
        currencyId: Number(values.currencyId),
        startDate: values.startDate,
        dueDayOfMonth:
          values.dueDayOfMonth !== '' ? Number(values.dueDayOfMonth) : null,
      };
      if (values.mode === 'principal') {
        return {
          ...base,
          mode: 'principal',
          principalAmount: Number(values.principalAmount),
          interestRate: Math.round(Number(values.interestRatePercent) * 100),
        };
      }
      return {
        ...base,
        mode: 'monthly',
        monthlyAmount: Number(values.monthlyAmountInput),
      };
    },
    // Editing an existing plan is never gated — same standing rule as
    // AccountsScreen/CategoriesScreen/LiabilitiesReceivablesScreen.
    onUpdate: (id, params) => updateInstallmentPlan(id, params),
    onCreate: async params => {
      console.log('[useInstallmentForm] onCreate: tier =', tier);
      const performCreate = () => createInstallmentPlan(params);
      if (tier === 'free') {
        // Hide this screen's own form sheet before showing the
        // paywall's — see AccountsScreen/CategoriesScreen's own
        // onCreate for why (two native Modals open at once freezes iOS
        // solid). onDismiss restores the form, still filled in, if the
        // user backs out without buying.
        //
        // A fixed setTimeout here used to guess how long that took and
        // guessed wrong — BottomSheetModal's own slide-down animation and
        // this timer both started from the same `form.setVisible(false)`
        // call, so they raced, and the paywall's Modal could try to
        // present before the add sheet's native Modal had actually torn
        // itself down. iOS silently drops a Modal presentation attempted
        // while another is still mid-dismissal — no error, no log,
        // openPaywall() just did nothing. waitForFullyClosed() instead
        // resolves from BottomSheetModal's own onFullyClosed (wired up in
        // InstallmentPlansScreen), which only fires once the native side
        // confirms the previous Modal is really gone.
        console.log('[useInstallmentForm] free tier — closing add sheet before opening paywall');
        form.setVisible(false);
        await form.waitForFullyClosed();
        await new Promise<void>(resolve => {
          console.log('[useInstallmentForm] opening paywall');
          openPaywall({
            reason: 'Installment plans require Premium.',
            onPurchaseSuccess: async () => {
              console.log('[useInstallmentForm] paywall purchase success — creating plan');
              await performCreate();
              resolve();
            },
            onDismiss: () => {
              console.log('[useInstallmentForm] paywall dismissed — restoring add sheet');
              form.setVisible(true);
            },
          });
        });
        return;
      }
      await performCreate();
    },
    onSaved,
    // Unified "Cannot save plan" title for both create and update — same
    // create/update wording consolidation every other useEntityFormModal
    // consumer in this app already uses, even though the original
    // hand-rolled version here had two distinct titles ("Cannot create
    // plan" / "Cannot update plan").
    errorTitle: 'Cannot save plan',
  });

  const preview = useMemo<InstallmentSchedule | null>(() => {
    const { values } = form;
    const parsedMonths = Number(values.numberOfMonths);
    const monthsValid =
      values.numberOfMonths !== '' &&
      Number.isInteger(parsedMonths) &&
      parsedMonths > 0;
    if (!monthsValid) {
      return null;
    }
    if (values.mode === 'principal') {
      const parsedPrincipal = Number(values.principalAmount);
      const parsedRatePercent = Number(values.interestRatePercent);
      if (
        values.principalAmount !== '' &&
        !Number.isNaN(parsedPrincipal) &&
        parsedPrincipal > 0 &&
        values.interestRatePercent !== '' &&
        !Number.isNaN(parsedRatePercent) &&
        parsedRatePercent >= 0
      ) {
        return calculateFromPrincipal(
          parsedPrincipal,
          Math.round(parsedRatePercent * 100),
          parsedMonths,
        );
      }
      return null;
    }
    const parsedMonthly = Number(values.monthlyAmountInput);
    if (
      values.monthlyAmountInput !== '' &&
      !Number.isNaN(parsedMonthly) &&
      parsedMonthly > 0
    ) {
      return calculateFromMonthly(parsedMonthly, parsedMonths);
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.values.mode,
    form.values.principalAmount,
    form.values.interestRatePercent,
    form.values.monthlyAmountInput,
    form.values.numberOfMonths,
  ]);

  const setField = <K extends keyof InstallmentFormValues>(
    key: K,
    value: InstallmentFormValues[K],
  ) => form.setValues(current => ({ ...current, [key]: value }));

  return {
    ...form,
    preview,
    setMode: value => setField('mode', value),
    setName: value => setField('name', value),
    setPrincipalAmount: value => setField('principalAmount', value),
    setInterestRatePercent: value => setField('interestRatePercent', value),
    setMonthlyAmountInput: value => setField('monthlyAmountInput', value),
    setNumberOfMonths: value => setField('numberOfMonths', value),
    setDueDayOfMonth: value => setField('dueDayOfMonth', value),
    setCategoryId: value => setField('categoryId', value),
    setCurrencyId: value => setField('currencyId', value),
    setStartDate: value => setField('startDate', value),
  };
}
