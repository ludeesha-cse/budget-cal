import {
  getActiveAccountCountByType,
  type LoanAccountType,
} from '../db/queries';
import type { PaywallRequest } from '../contexts/PaywallContext';
import type { EntitlementTier } from './useEntitlement';
import { canAddAccount } from '../utils/entitlementChecks';
import { defaultCurrencyId } from '../utils/currencyHelpers';
import { getCurrentDateString } from '../utils/date';
import { useEntityFormModal } from './useEntityFormModal';
import type { UseEntityFormModalResult } from './useEntityFormModal';
import type {
  ActiveLoan,
  InactiveLoan,
  LoanAccountRow,
  LoanCurrencyRow,
} from './useLoanAccountsData';
import {
  useCreateLoanAccount as useCreateLoanAccountMutation,
  useReactivateLoanAccount as useReactivateLoanAccountMutation,
  useTopUpLoanAccount as useTopUpLoanAccountMutation,
  useUpdateLoanAccount as useUpdateLoanAccountMutation,
} from './queries';

// useEntityFormModal keys its edit flow off `row.id`, but a loan row is
// keyed by `accountId` (an ActiveLoan is an account joined to its loan
// details and its one balance, so it has no `id` of its own). This is
// that same row with the key it needs, produced at the call site — see
// LiabilitiesReceivablesScreen's onEdit.
export type LoanEditRow = ActiveLoan & { id: number };

export type LoanFormValues = {
  // Set only by picking a CLOSED account from the name suggestions,
  // which is also what routes submit to reactivateLoanAccount instead of
  // createLoanAccount.
  reuseAccountId: number | null;
  // Set only by picking an OPEN account from the name suggestions. That
  // is the fix for "two accounts with the same name": the second amount
  // is added to the loan that already exists rather than opening a
  // rival account for the same person, so one counterparty always shows
  // one running total.
  topUpAccountId: number | null;
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
  topUpAccountId: number | null;
  counterpartyName: string;
  principal: number;
  currencyId: number;
  counterpartAccountId: number;
  dueDate?: string;
  interestRate?: number;
  interestPeriod?: 'monthly' | 'annual';
};

// Which of the four things this one sheet is currently doing. Only the
// wording and which fields are shown differ between them — the money
// rules live in db/queries/loans.ts, not here.
export type LoanFormMode = 'add' | 'reopen' | 'topUp' | 'edit';

export interface UseLoanFormResult
  extends UseEntityFormModalResult<LoanEditRow, LoanFormValues> {
  mode: LoanFormMode;
  setPrincipal: (value: string) => void;
  setCurrencyId: (value: string) => void;
  setCounterpartAccountId: (value: string) => void;
  setDueDate: (value: string | null) => void;
  setInterestRate: (value: string) => void;
  setInterestPeriod: (value: string) => void;
  handleNameChange: (text: string) => void;
  handlePickSuggestion: (loan: InactiveLoan) => void;
  handlePickOpenLoan: (loan: ActiveLoan) => void;
  clearReuse: () => void;
  clearTopUp: () => void;
  // The open loan currently being topped up, so the form body can name
  // it and show what is already outstanding.
  topUpTarget: ActiveLoan | null;
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
  // Optional since the TanStack Query refactor: a caller used to pass
  // its screen's load() here purely to re-read the database after a
  // successful write. The mutation hooks now invalidate every affected
  // query themselves, so that job is done — this is left for callers
  // that still need to do something ELSE once a save lands (reset
  // local UI state, navigate away).
  onSaved?: () => void | Promise<void>;
}

// Add, reopen, top up or edit a Liability/Receivable, built on
// useEntityFormModal.
//
// The two "which existing account is this really about" choices are
// modeled as FIELDS on `values` (reuseAccountId, topUpAccountId) rather
// than as useEntityFormModal's editingId, because neither of them is an
// edit: both hand over new money and neither prefills the chosen
// account's own terms. editingId is reserved for the genuine edit flow
// added here — openEdit(row) populates the form from an open loan and
// submit() routes to updateLoanAccount.
export function useLoanForm(deps: UseLoanFormDeps): UseLoanFormResult {
  // Write paths go through the caching layer's mutation hooks: each
  // one runs the same db/queries function as before and then
  // invalidates every query its write can affect (see
  // hooks/queries/invalidation.ts).
  const createLoanAccount = useCreateLoanAccountMutation();
  const reactivateLoanAccount = useReactivateLoanAccountMutation();
  const topUpLoanAccount = useTopUpLoanAccountMutation();
  const updateLoanAccount = useUpdateLoanAccountMutation();
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

  const form = useEntityFormModal<LoanEditRow, LoanFormValues, LoanFormParams>({
    initialValues: {
      reuseAccountId: null,
      topUpAccountId: null,
      counterpartyName: '',
      principal: '',
      currencyId: defaultCurrencyId(currencies),
      counterpartAccountId: String(counterpartAccounts[0]?.id ?? ''),
      dueDate: null,
      interestRate: '',
      interestPeriod: '',
    },
    // `principal` is filled from the loan's CURRENT outstanding balance,
    // not from whatever it was opened at — that is the figure the card
    // shows and the one updateLoanAccount corrects against. The stored
    // rate is an integer at rate × 100 (5.5% is 550), so it is divided
    // back out for display and re-multiplied in toParams.
    populateFromRow: row => ({
      reuseAccountId: null,
      topUpAccountId: null,
      counterpartyName: row.counterpartyName,
      principal: String(row.principal),
      currencyId: String(row.currencyId),
      counterpartAccountId: String(
        row.counterpartAccountId ?? counterpartAccounts[0]?.id ?? '',
      ),
      dueDate: row.dueDate ?? null,
      interestRate:
        row.interestRate != null ? String(row.interestRate / 100) : '',
      interestPeriod: row.interestPeriod ?? '',
    }),
    validate: values => {
      if (!values.counterpartyName.trim()) {
        return 'Enter a counterparty name';
      }
      const parsedPrincipal = Number(values.principal);
      if (!values.principal.trim()) {
        return values.topUpAccountId != null
          ? 'Enter the amount to add'
          : 'Enter an amount';
      }
      if (Number.isNaN(parsedPrincipal) || parsedPrincipal <= 0) {
        return 'Enter an amount greater than 0';
      }
      if (!values.currencyId) {
        return 'Choose a currency';
      }
      if (!values.counterpartAccountId) {
        return 'Choose the account this money moves through';
      }
      if (values.interestRate.trim()) {
        const rate = Number(values.interestRate);
        if (Number.isNaN(rate) || rate < 0) {
          return 'Enter a valid interest rate';
        }
        if (!values.interestPeriod) {
          return 'Choose an interest period';
        }
      }
      return null;
    },
    // interestPeriod is only required once an interest RATE has been
    // typed — a loan with no interest needs neither, which is why this
    // pair is conditional in the same way validate() is.
    requiredFields: values => {
      const missing: string[] = [];
      if (!values.counterpartyName.trim()) {
        missing.push('counterpartyName');
      }
      if (!values.principal.trim()) {
        missing.push('principal');
      }
      if (!values.currencyId) {
        missing.push('currencyId');
      }
      if (!values.counterpartAccountId) {
        missing.push('counterpartAccountId');
      }
      if (values.interestRate.trim() && !values.interestPeriod) {
        missing.push('interestPeriod');
      }
      return missing;
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
        topUpAccountId: values.topUpAccountId,
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
    //
    // A TOP-UP is deliberately outside that gate: it opens no account
    // and adds no row to the list the free tier caps, it only makes an
    // existing loan bigger. Charging for it would also be charging for
    // the fix to duplicate accounts, since "add to the one you have" and
    // "open a second one for the same person" would then cost the same.
    onCreate: async params => {
      if (params.topUpAccountId != null) {
        await topUpLoanAccount({
          accountId: params.topUpAccountId,
          amount: params.principal,
          currencyId: params.currencyId,
          counterpartAccountId: params.counterpartAccountId,
          date: getCurrentDateString(),
        });
        return;
      }

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
    // Editing never touches the entitlement gate: the loan already
    // exists and stays one loan, so nothing about the count the free
    // tier caps changes.
    onUpdate: async (accountId, params) => {
      await updateLoanAccount({
        accountId,
        counterpartyName: params.counterpartyName,
        principal: params.principal,
        currencyId: params.currencyId,
        counterpartAccountId: params.counterpartAccountId,
        dueDate: params.dueDate,
        interestRate: params.interestRate,
        interestPeriod: params.interestPeriod,
      });
    },
    onSaved,
    errorTitle: 'Could not save',
    // Lending, or adding to a lend, takes money out of the chosen account
    // — "Insufficient balance…" goes under that picker.
    inlineErrorFields: ['account'],
  });

  const setField = <K extends keyof LoanFormValues>(
    key: K,
    value: LoanFormValues[K],
  ) => form.setValues(current => ({ ...current, [key]: value }));

  // Editing the name away from a picked account drops back to "create
  // new" — otherwise the typed name and the chosen account could
  // silently disagree about who this loan is with. Applies to both kinds
  // of pick, reopen and top-up alike.
  const handleNameChange = (text: string) =>
    form.setValues(current => ({
      ...current,
      counterpartyName: text,
      reuseAccountId: null,
      topUpAccountId: null,
    }));

  const handlePickSuggestion = (loan: InactiveLoan) =>
    form.setValues(current => ({
      ...current,
      counterpartyName: loan.counterpartyName,
      reuseAccountId: loan.accountId,
      topUpAccountId: null,
    }));

  // A loan account holds exactly one currency, and topUpLoanAccount
  // refuses a top-up in any other one — so picking the target sets the
  // currency here rather than leaving the user to guess and be rejected
  // on save. The currency picker is hidden in this mode for the same
  // reason (see LoanFormFields).
  const handlePickOpenLoan = (loan: ActiveLoan) =>
    form.setValues(current => ({
      ...current,
      counterpartyName: loan.counterpartyName,
      topUpAccountId: loan.accountId,
      reuseAccountId: null,
      currencyId: String(loan.currencyId),
    }));

  const clearReuse = () => setField('reuseAccountId', null);
  const clearTopUp = () => setField('topUpAccountId', null);

  const mode: LoanFormMode =
    form.editingId != null
      ? 'edit'
      : form.values.topUpAccountId != null
        ? 'topUp'
        : form.values.reuseAccountId != null
          ? 'reopen'
          : 'add';

  const topUpTarget =
    form.values.topUpAccountId != null
      ? loans.find(loan => loan.accountId === form.values.topUpAccountId) ??
        null
      : null;

  // Every existing loan of this type — open or closed — whose
  // counterparty matches what's been typed so far. Both lists are now
  // TAPPABLE and both lead somewhere real: an open one tops itself up,
  // a closed one reopens. That is what makes the duplicate impossible to
  // reach by accident rather than merely warned about — before this, the
  // open matches were shown greyed out with no action, so the only way
  // forward from "you already have one of these" was to create the
  // duplicate anyway.
  //
  // Suppressed once either kind is picked (so the list does not sit on
  // top of the field after the choice is made) and while editing, where
  // the name belongs to a loan that already exists.
  const query = form.values.counterpartyName.trim().toLowerCase();
  const suppressed =
    form.editingId != null ||
    form.values.reuseAccountId != null ||
    form.values.topUpAccountId != null ||
    !query;
  const matchesQuery = (name: string) => name.toLowerCase().includes(query);
  const activeNameMatches = suppressed
    ? []
    : loans.filter(loan => matchesQuery(loan.counterpartyName));
  const inactiveNameMatches = suppressed
    ? []
    : inactiveLoans.filter(loan => matchesQuery(loan.counterpartyName));
  const hasNameMatches =
    activeNameMatches.length > 0 || inactiveNameMatches.length > 0;

  return {
    ...form,
    mode,
    setPrincipal: value => setField('principal', value),
    setCurrencyId: value => setField('currencyId', value),
    setCounterpartAccountId: value => setField('counterpartAccountId', value),
    setDueDate: value => setField('dueDate', value),
    setInterestRate: value => setField('interestRate', value),
    setInterestPeriod: value => setField('interestPeriod', value),
    handleNameChange,
    handlePickSuggestion,
    handlePickOpenLoan,
    clearReuse,
    clearTopUp,
    topUpTarget,
    activeNameMatches,
    inactiveNameMatches,
    hasNameMatches,
  };
}
