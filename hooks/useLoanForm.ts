import {
  createLoanAccount,
  getActiveAccountCountByType,
  reactivateLoanAccount,
  type LoanAccountType,
} from '../db/queries';
import type { PaywallRequest } from '../contexts/PaywallContext';
import type { EntitlementTier } from './useEntitlement';
import { canAddAccount } from '../utils/entitlementChecks';
import { defaultCurrencyId } from '../utils/currencyHelpers';
import { useEntityFormModal } from './useEntityFormModal';
import type { UseEntityFormModalResult } from './useEntityFormModal';
import type {
  ActiveLoan,
  InactiveLoan,
  LoanAccountRow,
  LoanCurrencyRow,
} from './useLoanAccountsData';

export type LoanFormValues = {
  // Set only by picking a closed account from the name suggestions, which
  // is also what routes submit to reactivateLoanAccount instead of
  // createLoanAccount.
  reuseAccountId: number | null;
  counterpartyName: string;
  principal: string;
  currencyId: string;
  counterpartAccountId: string;
  dueDate: string | null;
  interestRate: string;
  interestPeriod: string;
};

export type LoanFormParams = {
  reuseAccountId: number | null;
  counterpartyName: string;
  principal: number;
  currencyId: number;
  counterpartAccountId: number;
  dueDate?: string;
  interestRate?: number;
  interestPeriod?: 'monthly' | 'annual';
};

export interface UseLoanFormResult
  extends UseEntityFormModalResult<{ id: number }, LoanFormValues> {
  setPrincipal: (value: string) => void;
  setCurrencyId: (value: string) => void;
  setCounterpartAccountId: (value: string) => void;
  setDueDate: (value: string | null) => void;
  setInterestRate: (value: string) => void;
  setInterestPeriod: (value: string) => void;
  handleNameChange: (text: string) => void;
  handlePickSuggestion: (loan: InactiveLoan) => void;
  clearReuse: () => void;
  activeNameMatches: ActiveLoan[];
  inactiveNameMatches: InactiveLoan[];
  hasNameMatches: boolean;
}

export interface UseLoanFormDeps {
  type: LoanAccountType;
  loans: ActiveLoan[];
  inactiveLoans: InactiveLoan[];
  currencies: LoanCurrencyRow[];
  counterpartAccounts: LoanAccountRow[];
  tier: EntitlementTier;
  openPaywall: (request: PaywallRequest) => void;
  onSaved: () => void | Promise<void>;
}

// Add a Liability/Receivable, built on useEntityFormModal (Step 6) —
// despite the hook's usual "add vs edit an existing row" shape, this
// screen never edits an existing loan; openEdit/populateFromRow are
// simply never called (same "required by the type, dead in practice"
// pattern CurrenciesScreen's add-only migration already established).
// Picking a closed account from the name-match suggestions only ever
// sets `reuseAccountId` on the CURRENT form values — none of that
// account's own old terms are prefilled — so it's modeled as a field on
// `values`, not as useEntityFormModal's editingId, and onCreate below
// branches on it to call reactivateLoanAccount instead of
// createLoanAccount.
export function useLoanForm(deps: UseLoanFormDeps): UseLoanFormResult {
  const {
    type,
    loans,
    inactiveLoans,
    currencies,
    counterpartAccounts,
    tier,
    openPaywall,
    onSaved,
  } = deps;

  const form = useEntityFormModal<
    { id: number },
    LoanFormValues,
    LoanFormParams
  >({
    initialValues: {
      reuseAccountId: null,
      counterpartyName: '',
      principal: '',
      currencyId: defaultCurrencyId(currencies),
      counterpartAccountId: String(counterpartAccounts[0]?.id ?? ''),
      dueDate: null,
      interestRate: '',
      interestPeriod: '',
    },
    // Never invoked — this form has no edit flow, only add/reuse.
    populateFromRow: () => {
      throw new Error('useLoanForm: openEdit is never used.');
    },
    validate: values => {
      if (!values.counterpartyName.trim()) {
        return 'Enter a counterparty name';
      }
      const parsedPrincipal = Number(values.principal);
      if (
        !values.principal ||
        Number.isNaN(parsedPrincipal) ||
        parsedPrincipal <= 0
      ) {
        return 'Enter a valid principal amount';
      }
      if (!values.currencyId) {
        return 'Select a currency';
      }
      if (!values.counterpartAccountId) {
        return 'Select the account this money moves through';
      }
      if (values.interestRate.trim()) {
        const rate = Number(values.interestRate);
        if (Number.isNaN(rate) || rate < 0) {
          return 'Enter a valid interest rate';
        }
        if (!values.interestPeriod) {
          return 'Select an interest period';
        }
      }
      return null;
    },
    // Stored as rate × 100 so it stays an integer all the way down.
    toParams: values => {
      let parsedRate: number | undefined;
      let period: 'monthly' | 'annual' | undefined;
      if (values.interestRate.trim()) {
        parsedRate = Math.round(Number(values.interestRate) * 100);
        period = values.interestPeriod as 'monthly' | 'annual';
      }
      return {
        reuseAccountId: values.reuseAccountId,
        counterpartyName: values.counterpartyName.trim(),
        principal: Number(values.principal),
        currencyId: Number(values.currencyId),
        counterpartAccountId: Number(values.counterpartAccountId),
        dueDate: values.dueDate ?? undefined,
        interestRate: parsedRate,
        interestPeriod: period,
      };
    },
    // Reactivating a closed loan account brings back an active
    // Liability/Receivable just as much as creating a new one does, so
    // it's gated the same way rather than treated as "editing existing
    // data" (which stays ungated everywhere else in this app) — both
    // branches below go through the same entitlement check first.
    onCreate: async params => {
      const performCreate = async () => {
        if (params.reuseAccountId != null) {
          await reactivateLoanAccount({
            accountId: params.reuseAccountId,
            principal: params.principal,
            currencyId: params.currencyId,
            counterpartAccountId: params.counterpartAccountId,
            dueDate: params.dueDate,
            interestRate: params.interestRate,
            interestPeriod: params.interestPeriod,
          });
        } else {
          await createLoanAccount({
            type,
            counterpartyName: params.counterpartyName,
            principal: params.principal,
            currencyId: params.currencyId,
            counterpartAccountId: params.counterpartAccountId,
            dueDate: params.dueDate,
            interestRate: params.interestRate,
            interestPeriod: params.interestPeriod,
          });
        }
      };

      const activeCountForType = await getActiveAccountCountByType(type);
      const check = canAddAccount(type, activeCountForType, tier);
      if (!check.allowed) {
        // Unlike AccountsScreen/CategoriesScreen/InstallmentPlansScreen's
        // onCreate, this deliberately preserves the original screen's own
        // behavior of NOT hiding the form sheet before opening the
        // paywall (and no onDismiss either) — that inconsistency already
        // existed before this refactor and fixing it isn't in scope here.
        openPaywall({
          reason: check.reason ?? `${type} accounts require Premium.`,
          onPurchaseSuccess: performCreate,
        });
        return;
      }
      await performCreate();
    },
    onSaved,
    errorTitle: 'Could not save',
  });

  const setField = <K extends keyof LoanFormValues>(
    key: K,
    value: LoanFormValues[K],
  ) => form.setValues(current => ({ ...current, [key]: value }));

  // Editing the name away from a picked account drops back to "create
  // new" — otherwise the typed name and the reused account could silently
  // disagree about who this loan is with.
  const handleNameChange = (text: string) =>
    form.setValues(current => ({
      ...current,
      counterpartyName: text,
      reuseAccountId: null,
    }));

  const handlePickSuggestion = (loan: InactiveLoan) =>
    form.setValues(current => ({
      ...current,
      counterpartyName: loan.counterpartyName,
      reuseAccountId: loan.accountId,
    }));

  const clearReuse = () => setField('reuseAccountId', null);

  // Every existing loan of this type — open or closed — whose
  // counterparty matches what's been typed so far. Showing the open ones
  // too (even though they can't be tapped to reuse) is what surfaces an
  // about-to-be-duplicated name before Save creates a second account for
  // the same person, rather than only warning about it after the fact.
  // Suppressed once a closed one is picked, so the list doesn't sit on
  // top of the field after the choice is made.
  const query = form.values.counterpartyName.trim().toLowerCase();
  const matchesQuery = (name: string) => name.toLowerCase().includes(query);
  const activeNameMatches =
    form.values.reuseAccountId != null || !query
      ? []
      : loans.filter(loan => matchesQuery(loan.counterpartyName));
  const inactiveNameMatches =
    form.values.reuseAccountId != null || !query
      ? []
      : inactiveLoans.filter(loan => matchesQuery(loan.counterpartyName));
  const hasNameMatches =
    activeNameMatches.length > 0 || inactiveNameMatches.length > 0;

  return {
    ...form,
    setPrincipal: value => setField('principal', value),
    setCurrencyId: value => setField('currencyId', value),
    setCounterpartAccountId: value => setField('counterpartAccountId', value),
    setDueDate: value => setField('dueDate', value),
    setInterestRate: value => setField('interestRate', value),
    setInterestPeriod: value => setField('interestPeriod', value),
    handleNameChange,
    handlePickSuggestion,
    clearReuse,
    activeNameMatches,
    inactiveNameMatches,
    hasNameMatches,
  };
}
