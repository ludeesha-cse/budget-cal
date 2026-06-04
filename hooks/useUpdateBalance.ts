import { updateAccountBalanceWithAudit } from '../db/queries';
import { useTargetedModal } from './useTargetedModal';
import type { UseTargetedModalResult } from './useTargetedModal';
import type { AccountBalanceRow, AccountWithBalances } from './useAccounts';

export type UpdateBalanceTarget = {
  accountId: number;
  accountName: string;
  currencyId: number;
  currencyCode: string;
  currentBalance: number;
};

export type UpdateBalanceValues = {
  newValue: string;
  description: string;
};

export interface UseUpdateBalanceResult
  extends UseTargetedModalResult<UpdateBalanceTarget, UpdateBalanceValues> {
  // Thin adapter over the generic open(target) — callers (AccountListItem)
  // hand over the account + the specific balance row being corrected
  // rather than pre-building the target shape themselves, same signature
  // the original screen's own openUpdateBalance had.
  openUpdateBalance: (
    account: AccountWithBalances,
    balance: AccountBalanceRow,
  ) => void;
  // Granular wrappers over the generic setValues — nicer to bind directly
  // to a single TextInput's onChangeText than a per-field updater
  // function at every call site, same convention useRowEditState uses.
  setNewValue: (value: string) => void;
  setDescription: (value: string) => void;
}

// Same modal/handler pair regardless of what triggers it (month-start
// prompt or an anytime tap on a balance chip) — one code path calling
// updateAccountBalanceWithAudit, per the Stage 8 build order. Built on
// useTargetedModal (Step 8): both the "enter a valid balance" and
// "description required" checks, and any failure from
// updateAccountBalanceWithAudit itself, now surface as the hook's own
// inline `error` string instead of an Alert — the same inline-error
// convention useEntityFormModal's consumers (CategoriesScreen, etc.)
// already use for validation failures.
export function useUpdateBalance(
  onSaved: () => void | Promise<void>,
): UseUpdateBalanceResult {
  const modal = useTargetedModal<UpdateBalanceTarget, UpdateBalanceValues>({
    initialValues: target => ({
      newValue: String(target.currentBalance),
      description: '',
    }),
    validate: values => {
      const parsed = Number(values.newValue);
      if (!values.newValue || Number.isNaN(parsed)) {
        return 'Enter a valid balance.';
      }
      if (!values.description.trim()) {
        return 'Enter a description explaining this balance correction.';
      }
      return null;
    },
    onSubmit: (target, values) =>
      updateAccountBalanceWithAudit(
        target.accountId,
        target.currencyId,
        Number(values.newValue),
        values.description.trim(),
      ),
    onSaved,
  });

  const openUpdateBalance = (
    account: AccountWithBalances,
    balance: AccountBalanceRow,
  ) => {
    modal.open({
      accountId: account.id,
      accountName: account.name,
      currencyId: balance.currencyId,
      currencyCode: balance.currencyCode,
      currentBalance: balance.currentBalance,
    });
  };

  const setNewValue = (value: string) =>
    modal.setValues(current => ({ ...current, newValue: value }));
  const setDescription = (value: string) =>
    modal.setValues(current => ({ ...current, description: value }));

  return { ...modal, openUpdateBalance, setNewValue, setDescription };
}
