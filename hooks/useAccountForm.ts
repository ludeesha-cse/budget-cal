import {
  getActiveAccountCountByType,
} from '../db/queries';
import type { PaywallRequest } from '../contexts/PaywallContext';
import type { EntitlementTier } from './useEntitlement';
import { canAddAccount } from '../utils/entitlementChecks';
import { defaultCurrencyId } from '../utils/currencyHelpers';
import { useEntityFormModal } from './useEntityFormModal';
import type { UseEntityFormModalResult } from './useEntityFormModal';
import type { AccountWithBalances, CurrencyRow } from './useAccounts';
import {
  useAddAccountWithBalance as useAddAccountWithBalanceMutation,
  useUpdateAccount as useUpdateAccountMutation,
} from './queries';

export const ACCOUNT_TYPES = [
  'Cash',
  'Bank',
  'CreditCard',
  'CryptoWallet',
  'Receivable',
  'Liability',
] as const;

export type AccountFormValues = {
  // Not part of the literal state list this hook was asked to cover, but
  // required for correctness: validate() below only ever sees `values`,
  // never `editingId`, yet whether currency/balance are required depends
  // entirely on whether this is an edit (name only) or a create (name +
  // currency + balance) — mirroring the original accountFormCanSave's own
  // `editingId != null || (...)` branch. Carrying that one bit on the
  // values themselves is the only way validate can still tell the two
  // apart.
  isEditing: boolean;
  name: string;
  type: string;
  initialCurrencyId: string;
  initialBalance: string;
};

export type AccountFormParams = {
  name: string;
  type: string;
  initialCurrencyId: number;
  initialBalance: number;
};

export type UseAccountFormResult = UseEntityFormModalResult<
  AccountWithBalances,
  AccountFormValues
>;

export interface UseAccountFormDeps {
  currencies: CurrencyRow[];
  tier: EntitlementTier;
  openPaywall: (request: PaywallRequest) => void;
  // Optional since the TanStack Query refactor: a caller used to pass
  // its screen's load() here purely to re-read the database after a
  // successful write. The mutation hooks now invalidate every affected
  // query themselves, so that job is done — this is left for callers
  // that still need to do something ELSE once a save lands (reset
  // local UI state, navigate away).
  onSaved?: () => void | Promise<void>;
}

// Add/Edit Account, built on useEntityFormModal (Step 6). Creating is
// entitlement-gated (canAddAccount); editing never is — existing data
// stays fully usable regardless of tier, the same standing rule
// CategoriesScreen's own useEntityFormModal migration follows.
export function useAccountForm(deps: UseAccountFormDeps): UseAccountFormResult {
  // Write paths go through the caching layer's mutation hooks: each
  // one runs the same db/queries function as before and then
  // invalidates every query its write can affect (see
  // hooks/queries/invalidation.ts). The call sites below are
  // unchanged — these hooks take the wrapped function's own arguments.
  const addAccountWithBalance = useAddAccountWithBalanceMutation();
  const updateAccount = useUpdateAccountMutation();
  const { currencies, tier, openPaywall, onSaved } = deps;

  const form = useEntityFormModal<
    AccountWithBalances,
    AccountFormValues,
    AccountFormParams
  >({
    initialValues: {
      isEditing: false,
      name: '',
      type: ACCOUNT_TYPES[0],
      initialCurrencyId: defaultCurrencyId(currencies),
      initialBalance: '',
    },
    // Editing never touches currency/balance — AccountFormModal hides
    // those fields once editingId is set, matching the original
    // handleEditPress, which likewise left them untouched.
    populateFromRow: account => ({
      isEditing: true,
      name: account.name,
      type: account.type,
      initialCurrencyId: '',
      initialBalance: '',
    }),
    validate: values => {
      if (values.name.trim() === '') {
        return 'Enter a name.';
      }
      if (values.isEditing) {
        return null;
      }
      if (values.initialCurrencyId === '') {
        return 'Select a starting currency.';
      }
      if (
        values.initialBalance === '' ||
        Number.isNaN(Number(values.initialBalance))
      ) {
        return 'Enter a valid starting balance.';
      }
      return null;
    },
    // Editing an existing account only exposes name and type — the
    // currency and starting balance belong to creation, which is why
    // they are only required when `isEditing` is false (the same branch
    // validate() takes above).
    requiredFields: values => {
      const missing: string[] = [];
      if (!values.name.trim()) {
        missing.push('name');
      }
      if (!values.isEditing) {
        if (values.initialCurrencyId === '') {
          missing.push('initialCurrencyId');
        }
        if (
          values.initialBalance === '' ||
          Number.isNaN(Number(values.initialBalance))
        ) {
          missing.push('initialBalance');
        }
      }
      return missing;
    },
    toParams: values => ({
      name: values.name.trim(),
      type: values.type,
      initialCurrencyId: Number(values.initialCurrencyId),
      initialBalance: Number(values.initialBalance),
    }),
    onUpdate: (id, params) =>
      updateAccount(id, { name: params.name, type: params.type }),
    onCreate: async params => {
      // Form is fully valid at this point — the paywall (if it appears at
      // all) is the very last thing standing between the user and Create,
      // not the first thing they see.
      const performCreate = () =>
        addAccountWithBalance(
          params.name,
          params.type,
          params.initialCurrencyId,
          params.initialBalance,
        );

      const activeCountForType = await getActiveAccountCountByType(
        params.type,
      );
      const check = canAddAccount(params.type, activeCountForType, tier);
      if (check.allowed) {
        await performCreate();
        return;
      }

      // Hide this screen's own form sheet first — showing PaywallModal's
      // <Modal> while this one is still visible=true is what freezes iOS
      // solid (two native Modals open at once never finishes presenting
      // there; Android tolerates it). onDismiss restores the form, still
      // filled in, if the user backs out without buying. This promise
      // deliberately never resolves in the dismiss case — submit() only
      // closes the sheet and reloads once onCreate resolves, so a decline
      // must leave both untouched. `form` is referenced here even though
      // this closure is defined inside the same `useEntityFormModal(...)`
      // call that produces it: by the time onCreate actually runs (later,
      // on submit), the assignment below has long since completed —
      // exactly the pattern CategoriesScreen's own onCreate uses.
      //
      // setVisible(false) alone isn't enough: BottomSheetModal keeps its
      // native Modal mounted until it actually finishes tearing itself
      // down, so opening the paywall immediately here can still overlap
      // two native Modals — iOS silently drops the second Modal's
      // presentation when that happens, with no error to log (see
      // useInstallmentForm's own onCreate, where this was actually
      // reproduced). waitForFullyClosed() resolves only once
      // BottomSheetModal's onFullyClosed (wired up in AccountFormModal)
      // confirms the native Modal is really gone.
      form.setVisible(false);
      await form.waitForFullyClosed();
      await new Promise<void>(resolve => {
        openPaywall({
          reason: check.reason ?? `${params.type} accounts require Premium.`,
          onPurchaseSuccess: async () => {
            await performCreate();
            resolve();
          },
          onDismiss: () => form.setVisible(true),
        });
      });
    },
    onSaved,
    errorTitle: 'Cannot save account',
  });

  return form;
}
