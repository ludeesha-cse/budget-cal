import { useCallback, useRef } from 'react';
import {
  useMutation,
  useQueryClient,
  type QueryKey,
  type UseMutationResult,
} from '@tanstack/react-query';
import { queryKeys } from '../../db/queryKeys';

// What each class of write can move, named once and reused by every
// mutation hook — so "which queries does this affect?" is answered in
// one place per kind of write rather than re-derived (and mis-derived)
// at 50 call sites.
//
// The keys below are PREFIXES. `transactions.all` covers every month,
// year, search, monthly-total and per-id variant at once, which is what
// makes the exhaustive choice also the cheap one to write. The guiding
// asymmetry, from this refactor's own brief: a redundant invalidation
// costs one extra database read; a missing one silently shows a wrong
// number on screen. Where a write's reach is uncertain, it is included.
//
// Note there is deliberately no "net worth" entry: net worth is a pure
// aggregation over cached balances, loan positions and installment
// balances (see hooks/useNetWorthData.ts), so invalidating those three
// already refreshes it. Caching the aggregate separately would be the
// one way to make it disagree with its own inputs.

const k = queryKeys;

// Every slice of the raw transaction ledger, plus the report aggregates
// that are GROUP BYs over exactly those rows.
const LEDGER: QueryKey[] = [k.transactional.transactions.all, k.transactional.reports.all];

// Anything derived from what is actually in an account right now.
// Credit-card debt belongs here because it is a card account's live
// balance with the sign flipped, not a separate ledger.
const ACCOUNT_MONEY: QueryKey[] = [
  k.transactional.balances.all,
  k.transactional.creditCards.all,
];

// Overall monthly budgets and per-category budgets. Included on every
// transaction write because "spent vs limit" is read as one sentence:
// refreshing the spend half without the limit half is how the two come
// to disagree on screen.
const BUDGET_FIGURES: QueryKey[] = [
  k.transactional.budgets.all,
  k.transactional.categoryBudgets.all,
];

const LOAN_POSITIONS: QueryKey[] = [k.transactional.loans.all];
const INSTALLMENT_POSITIONS: QueryKey[] = [k.transactional.installments.all];
const SAVINGS_POSITIONS: QueryKey[] = [k.transactional.savingsGoals.all];
const TRANSFER_LEDGER: QueryKey[] = [k.transactional.transfers.all];
const RECURRING_STATE: QueryKey[] = [k.transactional.recurring.all];

const ACCOUNT_ROSTER: QueryKey[] = [k.reference.accounts.all];
const CATEGORY_ROSTER: QueryKey[] = [k.reference.categories.all];
const TAG_ROSTER: QueryKey[] = [k.reference.tags.all];
const CURRENCY_ROSTER: QueryKey[] = [k.reference.currencies.all];
const SETTINGS: QueryKey[] = [k.reference.settings.all];

export const invalidates = {
  // Adding, editing or deleting a transaction. Covers, in order of the
  // brief: that month's transaction list (LEDGER, by prefix — plus the
  // year view, search results and monthly totals), the account
  // balance(s) it touched (ACCOUNT_MONEY), the relevant category budget
  // and the overall monthly budget (BUDGET_FIGURES), and net worth via
  // its inputs.
  //
  // The last three lines look broad for "a transaction changed", and are
  // deliberate: a transactions row is also the backing row for an
  // installment payment, for a confirmed recurring occurrence, and for
  // the spend that a savings goal's progress is read against. Editing or
  // deleting an arbitrary transaction can therefore move any of those
  // positions, and there is no way to tell from the transaction alone.
  transactionWrite: [
    ...LEDGER,
    ...ACCOUNT_MONEY,
    ...BUDGET_FIGURES,
    ...INSTALLMENT_POSITIONS,
    ...RECURRING_STATE,
    ...SAVINGS_POSITIONS,
  ] as QueryKey[],

  // A credit card payoff moves money between two accounts by shifting
  // their stored baselines and writing a credit_card_payoffs row. It
  // does NOT write a transactions row, and per this project's existing
  // rule a payoff is not an expense — so this deliberately invalidates
  // neither any transaction list nor any category/overall budget. Both
  // accounts' balances (and the card debt derived from one of them) are
  // the entire blast radius.
  creditCardPayoff: [...ACCOUNT_MONEY] as QueryKey[],

  // A loan settlement updates both accounts' baselines and writes a
  // loan_payments row: both accounts' balances, plus that loan's own
  // detail (total owed / active / settled), which the loans prefix
  // covers along with the loan-payment rows History merges in. Like a
  // payoff, it writes no transactions row, so no transaction list or
  // budget figure is invalidated.
  loanSettlement: [...ACCOUNT_MONEY, ...LOAN_POSITIONS] as QueryKey[],

  // Creating or reactivating a loan account adds an account, so the
  // account roster moves too — unlike a settlement, which only changes
  // an existing one's state.
  loanAccountWrite: [
    ...ACCOUNT_MONEY,
    ...LOAN_POSITIONS,
    ...ACCOUNT_ROSTER,
  ] as QueryKey[],

  // A transfer shifts two account baselines and writes a transfers row.
  // Same reasoning as a payoff: money moved between the user's own
  // accounts is not spending, so no transaction list and no budget
  // figure is touched — only the two balances and the transfer ledger
  // History reads.
  transferWrite: [...ACCOUNT_MONEY, ...TRANSFER_LEDGER] as QueryKey[],

  // Creating, editing, closing or reopening an account changes both the
  // roster (name/type/active) and, for a new or reopened one, what
  // balances exist. Transferable-account pickers are filtered by
  // account, so the transfer prefix goes too.
  accountWrite: [
    ...ACCOUNT_ROSTER,
    ...ACCOUNT_MONEY,
    ...TRANSFER_LEDGER,
  ] as QueryKey[],

  // A balance correction posts a real transactions row (an audit entry),
  // so it is a transaction write in every sense plus the balance itself.
  balanceCorrection: [...LEDGER, ...ACCOUNT_MONEY, ...BUDGET_FIGURES] as QueryKey[],

  // Saving or deleting a budget changes only the limit side. The spend
  // side is unaffected — no transaction moved — so the ledger is left
  // alone.
  budgetWrite: [...BUDGET_FIGURES] as QueryKey[],

  // Category add/rename/delete: its own reference query, and nothing
  // else — with one exception. A delete reassigns or clears the
  // categoryId on existing transactions, and both a delete and a RENAME
  // change a name that budget and report rows are currently displaying,
  // so those two paths use `categoryWriteAffectingNames` below instead.
  categoryWrite: [...CATEGORY_ROSTER] as QueryKey[],
  categoryWriteAffectingNames: [
    ...CATEGORY_ROSTER,
    ...LEDGER,
    ...BUDGET_FIGURES,
  ] as QueryKey[],

  // Tag add/delete/rename: the tag roster, plus the per-transaction tag
  // assignments and the tag-filtered search results that display those
  // names.
  tagWrite: [...TAG_ROSTER, ...LEDGER] as QueryKey[],

  // Setting a transaction's tags changes only that assignment and the
  // lists that render it — never the tag roster itself.
  transactionTagAssignment: [...LEDGER] as QueryKey[],

  // Currency add/enable/disable/delete/set-default. The roster moves,
  // and because nearly every money figure in the app is scoped by
  // currency (and the default currency decides which one the dashboard
  // shows at all), the transactional figures downstream of that choice
  // go too.
  currencyWrite: [
    ...CURRENCY_ROSTER,
    ...LEDGER,
    ...ACCOUNT_MONEY,
    ...BUDGET_FIGURES,
    ...INSTALLMENT_POSITIONS,
    ...LOAN_POSITIONS,
  ] as QueryKey[],

  // Installment plan create/update/delete, and pay/unpay. Pay and unpay
  // write a transactions row, hence the full ledger and budget reach on
  // top of the plan's own position.
  installmentPlanWrite: [...INSTALLMENT_POSITIONS] as QueryKey[],
  installmentPayment: [
    ...INSTALLMENT_POSITIONS,
    ...LEDGER,
    ...ACCOUNT_MONEY,
    ...BUDGET_FIGURES,
  ] as QueryKey[],

  // Recurring rule create/edit/activate/delete moves only the rule list
  // and what can be generated from it.
  recurringRuleWrite: [...RECURRING_STATE] as QueryKey[],

  // Confirming an occurrence writes a real transactions row; skipping
  // one does not, so it only clears the pending list.
  occurrenceConfirm: [
    ...RECURRING_STATE,
    ...LEDGER,
    ...ACCOUNT_MONEY,
    ...BUDGET_FIGURES,
  ] as QueryKey[],
  occurrenceSkip: [...RECURRING_STATE] as QueryKey[],

  // Savings goals and contributions are deliberately self-contained:
  // addContribution's own doc comment states a contribution is a log of
  // intent, never a movement of money, and touches neither
  // account_balances nor transactions. Invalidating balances here would
  // contradict that.
  savingsGoalWrite: [...SAVINGS_POSITIONS] as QueryKey[],

  // Onboarding / default-currency-confirmed flags.
  settingsWrite: [...SETTINGS] as QueryKey[],

  // A wipe or an import can change literally anything, so both clear the
  // entire cache rather than trying to enumerate a blast radius.
  everything: [k.transactional.all, k.reference.all] as QueryKey[],
} as const;

// Invalidates a set of key prefixes and resolves once every affected
// ACTIVE query has refetched — so a screen that awaits a mutation is
// looking at fresh numbers by the time the await returns, which is what
// lets the migrated screens drop their manual reload() calls without
// anything flickering through an old value first.
export function useInvalidate() {
  const queryClient = useQueryClient();
  return useCallback(
    (keys: readonly QueryKey[]) =>
      Promise.all(
        keys.map(queryKey => queryClient.invalidateQueries({ queryKey })),
      ),
    [queryClient],
  );
}

// The shape every mutation hook in hooks/queries/mutations/ is built
// from: run the existing db/queries write function untouched, then
// invalidate the named set for that class of write.
//
// The returned value is CALLABLE WITH THE UNDERLYING FUNCTION'S OWN
// SIGNATURE. That is deliberate: a screen that used to
// `import { updateAccount } from '../db/queries'` and call
// `await updateAccount(id, data)` now does
// `const updateAccount = useUpdateAccount()` and leaves the call line
// exactly as it was — so routing ~50 write sites through the cache
// changed which import they use, not what they do. `.mutation` on the
// same value exposes the full UseMutationResult (isPending, error, ...)
// for anything that wants it.
//
// The promise returned from onSuccess is awaited by TanStack before
// mutateAsync() resolves, and useInvalidate above waits for the affected
// active queries to refetch — so `await someWrite(...)` returning is the
// signal that every screen showing an affected figure has already been
// updated. That is what replaced the manual `await load()` that used to
// follow each write.
export type DbMutation<TArgs extends unknown[], TResult> = ((
  ...args: TArgs
) => Promise<TResult>) & {
  mutation: UseMutationResult<TResult, Error, TArgs>;
};

export function useDbMutation<TArgs extends unknown[], TResult>(
  writeFn: (...args: TArgs) => Promise<TResult>,
  keys: readonly QueryKey[],
): DbMutation<TArgs, TResult> {
  const invalidate = useInvalidate();
  const mutation = useMutation<TResult, Error, TArgs>({
    mutationFn: (args: TArgs) => writeFn(...args),
    onSuccess: () => invalidate(keys),
  });
  // Read through a ref so `call` below is created exactly once and keeps
  // one identity for the component's whole life. That matters because
  // several call sites now list these callables in a useCallback/useMemo
  // dependency array (they replaced a `load` that used to sit there), and
  // a callable whose identity changed each render would silently rebuild
  // those callbacks every time. Going through the ref makes the
  // stability this file's own guarantee rather than an assumption about
  // whether the library keeps mutateAsync stable.
  const mutateAsyncRef = useRef(mutation.mutateAsync);
  mutateAsyncRef.current = mutation.mutateAsync;
  const call = useCallback(
    (...args: TArgs) => mutateAsyncRef.current(args),
    [],
  ) as DbMutation<TArgs, TResult>;

  // Object.assign returns its target, so this keeps handing back the very
  // same `call` object — it only refreshes the live result hanging off it.
  call.mutation = mutation;
  return call;
}
