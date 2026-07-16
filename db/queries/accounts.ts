import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../index';
import { getDefaultCurrency } from './currencies';
import {
  accountBalances,
  accounts,
  categories,
  currencies,
  savingsContributions,
  savingsGoals,
  transactions,
} from '../schema';
import {
  getCurrentDateString,
} from '../../utils/date';
import { getBalanceDelta } from '../../utils/balanceMath';

const RESERVED_BANK_CATEGORY_NAME = 'Bank';

export type Account = typeof accounts.$inferSelect;

export type NewAccount = {
  name: string;
  type: string;
  openingBalance: number;
};

// If a backend is added later, replace this with a fetch() call
// to GET/POST /api/accounts/default, keeping the same
// return shape.
const DEFAULT_CASH_ACCOUNT_NAME = 'Cash in wallet';

// The literal this account used to be seeded with, before the rename —
// kept only so an existing install's untouched default account can be
// recognized and renamed in place below. An account a user has since
// renamed themselves (to anything, including back to plain "Cash") is
// never touched.
const LEGACY_DEFAULT_CASH_ACCOUNT_NAME = 'Cash';

export async function ensureDefaultAccount() {
  const existing = await db.select().from(accounts).limit(1);
  if (existing.length > 0) {
    // Runs on every app start, same idempotent-by-a-gate-check pattern
    // as seedReservedBankCategory (db/index.ts) — gated on name+type
    // instead of a missing flag, since there's no dedicated column to
    // mark "this is still the untouched seeded default."
    const [legacyDefault] = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.name, LEGACY_DEFAULT_CASH_ACCOUNT_NAME),
          eq(accounts.type, 'Cash'),
        ),
      )
      .limit(1);
    if (legacyDefault) {
      await db
        .update(accounts)
        .set({ name: DEFAULT_CASH_ACCOUNT_NAME })
        .where(eq(accounts.id, legacyDefault.id));
    }
    return existing[0];
  }
  const [account] = await db
    .insert(accounts)
    .values({
      name: DEFAULT_CASH_ACCOUNT_NAME,
      type: 'Cash',
      createdAt: Date.now(),
    })
    .returning();
  return account;
}

// If a backend is added later, replace this with a fetch() call to GET
// /api/accounts, keeping the same return type.
export async function getAccounts(): Promise<Account[]> {
  return db.select().from(accounts);
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// or PATCH /api/accounts/:id/balances), keeping the same input/return
// shape. Inserts or updates the (accountId, currencyId) balance row.
async function upsertAccountBalance(
  accountId: number,
  currencyId: number,
  balance: number,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(accountBalances)
    .where(
      and(
        eq(accountBalances.accountId, accountId),
        eq(accountBalances.currencyId, currencyId),
      ),
    )
    .limit(1);
  if (existing) {
    await db
      .update(accountBalances)
      .set({ balance })
      .where(eq(accountBalances.id, existing.id));
  } else {
    await db.insert(accountBalances).values({ accountId, currencyId, balance });
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/accounts), keeping the same input/return shape. Creates the
// account and its first account_balances row together, in the given
// currency.
export async function addAccountWithBalance(
  name: string,
  type: string,
  currencyId: number,
  initialBalance: number,
): Promise<Account> {
  const [account] = await db
    .insert(accounts)
    .values({ name, type, createdAt: Date.now() })
    .returning();
  await db.insert(accountBalances).values({
    accountId: account.id,
    currencyId,
    balance: initialBalance,
  });
  return account;
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/accounts/:id/balances), keeping the same input/return shape. Adds
// an additional currency balance to an existing account; rejects if the
// account already has a balance in this currency (the unique
// (accountId, currencyId) constraint from Stage 7a).
export async function addCurrencyToAccount(
  accountId: number,
  currencyId: number,
  initialBalance: number,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(accountBalances)
    .where(
      and(
        eq(accountBalances.accountId, accountId),
        eq(accountBalances.currencyId, currencyId),
      ),
    )
    .limit(1);
  if (existing) {
    throw new Error('This account already has a balance in this currency.');
  }
  await db.insert(accountBalances).values({
    accountId,
    currencyId,
    balance: initialBalance,
  });
}

// If a backend is added later, replace this with a fetch() call to POST
// /api/accounts, keeping the same input/return shape. The opening balance
// is stored in account_balances under the default currency.
export async function addAccount(data: NewAccount): Promise<Account> {
  const [account] = await db
    .insert(accounts)
    .values({
      name: data.name,
      type: data.type,
      createdAt: Date.now(),
    })
    .returning();
  const defaultCurrency = await getDefaultCurrency();
  if (defaultCurrency) {
    await upsertAccountBalance(account.id, defaultCurrency.id, data.openingBalance);
  }
  return account;
}

// If a backend is added later, replace this with fetch(PATCH
// /api/accounts/:id), keeping the same input/return shape. An updated
// opening balance is written to account_balances under the default
// currency.
export async function updateAccount(
  id: number,
  data: Partial<NewAccount>,
): Promise<Account> {
  const { openingBalance, ...rest } = data;
  if (Object.keys(rest).length > 0) {
    await db.update(accounts).set(rest).where(eq(accounts.id, id));
  }
  if (openingBalance !== undefined) {
    const defaultCurrency = await getDefaultCurrency();
    if (defaultCurrency) {
      await upsertAccountBalance(id, defaultCurrency.id, openingBalance);
    }
  }
  const [updated] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, id))
    .limit(1);
  return updated;
}

// If a backend is added later, replace this with fetch(DELETE
// /api/accounts/:id), keeping the same return shape.
export async function deleteAccount(id: number): Promise<Account[]> {
  const referencing = await db
    .select()
    .from(transactions)
    .where(eq(transactions.accountId, id))
    .limit(1);
  if (referencing.length > 0) {
    throw new Error(
      'Cannot delete this account because it has existing transactions.',
    );
  }
  // Unlike closeAccount, deletion offers no "and take the goals with it"
  // escape hatch: deleting an account is already reserved for one
  // created by mistake, and a mistaken account is not one that anybody
  // has been saving into. Pointing the goal elsewhere first is a single
  // edit, and it keeps that goal's history.
  const linkedGoals = await getGoalsSavingIntoAccount(id);
  if (linkedGoals.length > 0) {
    throw new Error(
      `Cannot delete this account because ${describeLinkedGoals(
        linkedGoals,
      )}. Point them at another account first.`,
    );
  }
  await db.delete(accountBalances).where(eq(accountBalances.accountId, id));
  return db.delete(accounts).where(eq(accounts.id, id)).returning();
}

export const CREDIT_CARD_TYPE = 'CreditCard';

// Liability/Receivable accounts never carry ordinary transactions (their
// balances belong entirely to createLoanAccount()/settleLoan()), so
// getBalanceDelta refuses to answer for them. Both call sites below check
// this first so a stray loan-type account never reaches getBalanceDelta
// and throws where nothing used to throw.
function isLoanManagedAccountType(accountType: string): boolean {
  return accountType === 'Liability' || accountType === 'Receivable';
}

// getBalanceDelta speaks in real-world terms: for a CreditCard, "Expense"
// means "you owe more," which it represents as a *positive* number. But
// this app stores every account's balance as a single signed number in
// account_balances, and for a CreditCard that stored number is the
// negative of what's owed (see getTotalCreditCardDebt's final negation
// below) — not the debt itself. So the real-world delta from
// getBalanceDelta has to be flipped before it's applied to that stored
// number. This is the only place that conversion happens; getBalanceDelta
// is still the only place that decides which direction Expense/Income go
// — this just translates that decision into the storage representation.
function getStoredBalanceDelta(
  accountType: string,
  entryType: 'Expense' | 'Income',
  amount: number,
): number {
  const realWorldDelta = getBalanceDelta(accountType, entryType, amount);
  return accountType === CREDIT_CARD_TYPE ? -realWorldDelta : realWorldDelta;
}

// Net "spent" for one (account, currency) pair: Expense entries add to
// it, Income entries subtract from it, so getAccountBalance can do a
// single subtraction (openingBalance - netSpent) and have Income
// correctly increase the resulting balance instead of reducing it like
// an Expense would. Now filtered by currencyId too — closing the "known
// simplification" flagged back in Stage 7b/7c now that transactions
// finally carry their own currency.
//
// Computed in JS (fetch rows, then reduce) rather than a SQL CASE
// expression as before, specifically so the sign decision goes through
// getStoredBalanceDelta/getBalanceDelta instead of being re-typed here —
// this and updateAccountBalanceWithAudit are the only two places in the
// app that ever decide which way an Expense/Income moves a balance, and
// both now defer to the same function. netSpent is kept as its own
// quantity (the negative of the total balance effect) purely because
// getAccountBalance's "openingBalance - netSpent" shape, and
// settleCreditCardAccount's use of this same return value as a new
// baseline, both predate this refactor and still expect it.
export async function getNetSpentForAccount(
  accountId: number,
  currencyId: number,
): Promise<number> {
  try {
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);
    // Falls back to a plain asset account if the account row is somehow
    // missing — matches the old SQL formula's behavior, which never
    // looked at account type at all.
    const accountType = account?.type ?? 'Bank';
    const rows = await db
      .select({
        entryType: transactions.entryType,
        amount: transactions.amount,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, accountId),
          eq(transactions.currencyId, currencyId),
        ),
      );
    const netBalanceEffect = rows.reduce(
      (sum, row) =>
        sum + getStoredBalanceDelta(accountType, row.entryType, row.amount),
      0,
    );
    return -netBalanceEffect;
  } catch (error) {
    console.error(
      `getNetSpentForAccount: failed to compute net expense/income for account id=${accountId} currency id=${currencyId}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/accounts/:id/balance?currencyId=, keeping the same
// return type. Replaces the single-currency version from Stage 4b/7a —
// returns the balance for one specific (account, currency) pair: that
// currency's stored balance minus everything net-spent from the account
// in that same currency (Income adds, Expense subtracts — see
// getNetSpentForAccount).
export async function getAccountBalance(
  accountId: number,
  currencyId: number,
): Promise<number> {
  try {
    const [balanceRow] = await db
      .select()
      .from(accountBalances)
      .where(
        and(
          eq(accountBalances.accountId, accountId),
          eq(accountBalances.currencyId, currencyId),
        ),
      )
      .limit(1);
    const openingBalance = balanceRow?.balance ?? 0;
    const netSpent = await getNetSpentForAccount(accountId, currencyId);
    return openingBalance - netSpent;
  } catch (error) {
    console.error(
      `getAccountBalance: failed to compute balance for account id=${accountId} currency id=${currencyId}`,
      error,
    );
    throw error;
  }
}

const CASH_LIKE_ACCOUNT_TYPES = [
  'Bank',
  'Cash',
  'CryptoWallet',
  'Receivable',
] as const;

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/accounts/cash-in-hand-by-currency, keeping the same
// return shape. Sums Bank + Cash + CryptoWallet + Receivable account
// balances (Liability and CreditCard are debts, not cash), grouped by
// currency code. Currencies are never summed together — the result is a
// map of currency code to that currency's total only.
export async function getTotalCashInHandByCurrency(): Promise<
  Record<string, number>
> {
  const rows = await db
    .select({
      currencyCode: currencies.code,
      total: sql<number>`sum(${accountBalances.balance})`,
    })
    .from(accountBalances)
    .innerJoin(accounts, eq(accountBalances.accountId, accounts.id))
    .innerJoin(currencies, eq(accountBalances.currencyId, currencies.id))
    .where(inArray(accounts.type, CASH_LIKE_ACCOUNT_TYPES))
    .groupBy(currencies.code);

  const totals: Record<string, number> = {};
  for (const row of rows) {
    totals[row.currencyCode] = row.total;
  }
  return totals;
}

// The reserved category from db/index.ts's seedReservedBankCategory
// should already exist by the time this runs, but this falls back to
// creating it rather than crash-failing a balance correction just
// because the one-time seed somehow hasn't happened yet.
async function getOrCreateBankCategoryId(): Promise<number> {
  const [existing] = await db
    .select()
    .from(categories)
    .where(eq(categories.name, RESERVED_BANK_CATEGORY_NAME))
    .limit(1);
  if (existing) {
    return existing.id;
  }
  const [created] = await db
    .insert(categories)
    .values({ name: RESERVED_BANK_CATEGORY_NAME, createdAt: Date.now() })
    .returning();
  return created.id;
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/accounts/:id/balances/:currencyId/correct), keeping the same
// input/return shape. Reconciles a (account, currency) balance to
// newBalance by posting a dated, categorized, described audit
// transaction for the difference — the same mechanism whether it's
// triggered by a month-start prompt or run anytime by hand.
//
// Why this doesn't just overwrite account_balances.balance to newBalance:
// getAccountBalance always recomputes as
// "stored baseline − every transaction ever recorded for this account
// and currency" (see getNetSpentForAccount) — it doesn't reset that
// history at a point in time. So the only way to make the *computed*
// balance come out to newBalance, without corrupting it the next time
// it's read, is to let the inserted audit transaction carry the entire
// delta and leave the stored baseline exactly as it was (the same trick
// settleCreditCardAccount uses to zero out a balance without a
// transaction). This function still explicitly touches account_balances
// so the row exists (relevant if this account/currency somehow has none
// yet) — for an existing row that's a same-value write, not a bug.
export async function updateAccountBalanceWithAudit(
  accountId: number,
  currencyId: number,
  newBalance: number,
  description: string,
): Promise<void> {
  try {
    if (!description.trim()) {
      throw new Error(
        'A description is required to correct a balance — that record is the whole point of the audit trail.',
      );
    }
    const current = await getAccountBalance(accountId, currencyId);
    const delta = newBalance - current;
    if (delta === 0) {
      return;
    }
    const bankCategoryId = await getOrCreateBankCategoryId();
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);
    const accountType = account?.type ?? 'Bank';
    // Same direction rule getNetSpentForAccount reads forward (entryType
    // -> stored delta), used backward here (desired delta -> entryType):
    // whichever entryType makes getStoredBalanceDelta produce this exact
    // signed delta is the one that belongs on the audit transaction.
    // Liability/Receivable accounts are excluded from that lookup — same
    // accounts getBalanceDelta refuses to handle — and fall back to the
    // plain sign check so a stray loan-type account (never expected here,
    // but not guarded against before this refactor either) keeps behaving
    // exactly as it did before, instead of suddenly throwing.
    const amount = Math.abs(delta);
    const entryType: 'Expense' | 'Income' = isLoanManagedAccountType(
      accountType,
    )
      ? delta > 0
        ? 'Income'
        : 'Expense'
      : getStoredBalanceDelta(accountType, 'Income', amount) === delta
        ? 'Income'
        : 'Expense';
    await db.insert(transactions).values({
      accountId,
      amount,
      categoryId: bankCategoryId,
      description: description.trim(),
      date: getCurrentDateString(),
      currencyId,
      entryType,
      createdAt: Date.now(),
    });
    const [existingBalanceRow] = await db
      .select()
      .from(accountBalances)
      .where(
        and(
          eq(accountBalances.accountId, accountId),
          eq(accountBalances.currencyId, currencyId),
        ),
      )
      .limit(1);
    await upsertAccountBalance(
      accountId,
      currencyId,
      existingBalanceRow?.balance ?? 0,
    );
  } catch (error) {
    console.error(
      `updateAccountBalanceWithAudit: failed to correct balance for account id=${accountId} currency id=${currencyId} to ${newBalance}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/accounts/:id/balances, keeping the same return shape.
export async function getAccountBalances(accountId: number) {
  return db
    .select({
      id: accountBalances.id,
      accountId: accountBalances.accountId,
      currencyId: accountBalances.currencyId,
      currencyCode: currencies.code,
      currencyName: currencies.name,
      balance: accountBalances.balance,
    })
    .from(accountBalances)
    .innerJoin(currencies, eq(accountBalances.currencyId, currencies.id))
    .where(eq(accountBalances.accountId, accountId));
}

export type AccountBalanceWithCurrent = Awaited<
  ReturnType<typeof getAccountBalances>
>[number] & { currentBalance: number };

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/accounts/balances, keeping the same return shape.
//
// AccountsScreen's list needs every account's every currency balance,
// current-balance included, on every load. The obvious way to get that —
// one getAccountBalances(accountId) call per account, then one
// getAccountBalance(accountId, currencyId) call per balance row (itself a
// full transactions-table query) — is an N+1 that used to run A + A×C
// queries for A accounts averaging C currencies each. This does it in
// three queries total: every account (for its type, which the sign flip
// below needs), every balance row joined with its currency, and every
// transaction — then reduces net-spent per (accountId, currencyId) in JS,
// the same math getNetSpentForAccount does per-pair, just batched.
export async function getAllAccountBalances(): Promise<
  AccountBalanceWithCurrent[]
> {
  try {
    const [accountRows, balanceRows, transactionRows] = await Promise.all([
      db.select().from(accounts),
      db
        .select({
          id: accountBalances.id,
          accountId: accountBalances.accountId,
          currencyId: accountBalances.currencyId,
          currencyCode: currencies.code,
          currencyName: currencies.name,
          balance: accountBalances.balance,
        })
        .from(accountBalances)
        .innerJoin(currencies, eq(accountBalances.currencyId, currencies.id)),
      db
        .select({
          accountId: transactions.accountId,
          currencyId: transactions.currencyId,
          entryType: transactions.entryType,
          amount: transactions.amount,
        })
        .from(transactions),
    ]);

    const accountTypeById = new Map(accountRows.map(a => [a.id, a.type]));

    // Same quantity getNetSpentForAccount calls netBalanceEffect (the sum
    // of getStoredBalanceDelta over every matching transaction) — kept
    // under that name here too so the two stay obviously in sync if
    // either is ever touched again. getAccountBalance's own formula,
    // openingBalance - netSpent (netSpent = -netBalanceEffect), collapses
    // to openingBalance + netBalanceEffect, which is what's applied below.
    const netBalanceEffectByKey = new Map<string, number>();
    for (const row of transactionRows) {
      const accountType = accountTypeById.get(row.accountId) ?? 'Bank';
      const key = `${row.accountId}:${row.currencyId}`;
      const delta = getStoredBalanceDelta(accountType, row.entryType, row.amount);
      netBalanceEffectByKey.set(key, (netBalanceEffectByKey.get(key) ?? 0) + delta);
    }

    return balanceRows.map(row => {
      const key = `${row.accountId}:${row.currencyId}`;
      const netBalanceEffect = netBalanceEffectByKey.get(key) ?? 0;
      return { ...row, currentBalance: row.balance + netBalanceEffect };
    });
  } catch (error) {
    console.error('getAllAccountBalances: failed to batch-compute account balances', error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/accounts/:id/is-zero-balance, keeping the same return
// type. Despite the name, this returns a boolean, not a number — currency
// balances are never summed together, so "total balance" here means
// "every currency balance is exactly zero," which is all account closure
// actually needs to know.
export async function getAccountTotalBalance(
  accountId: number,
): Promise<boolean> {
  try {
    const balances = await db
      .select()
      .from(accountBalances)
      .where(eq(accountBalances.accountId, accountId));
    return balances.every(balance => balance.balance === 0);
  } catch (error) {
    console.error(
      `getAccountTotalBalance: failed to check zero-balance status for account id=${accountId}`,
      error,
    );
    throw error;
  }
}

// The dependency between accounts and savings goals runs ONE WAY:
// db/queries/savingsGoals.ts reads getAllAccountBalances from this file,
// because a goal is defined against an account. So this file must not
// import that one back — the two small reads below query the savings
// tables directly instead of taking a module cycle to reuse a function.
// If you find yourself adding `from './savingsGoals'` here, that is the
// cycle re-forming.
async function getGoalsSavingIntoAccount(
  accountId: number,
): Promise<{ id: number; name: string }[]> {
  return db
    .select({ id: savingsGoals.id, name: savingsGoals.name })
    .from(savingsGoals)
    .where(eq(savingsGoals.accountId, accountId));
}

// Reads better than "N savings goals save into it" repeated twice.
function describeLinkedGoals(goals: { name: string }[]): string {
  return `${goals.length} savings goal${
    goals.length === 1 ? '' : 's'
  } save into this account (${goals.map(goal => goal.name).join(', ')})`;
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/accounts/:id/close), keeping the same input/return shape. Throws
// rather than silently proceeding if any currency balance is still
// nonzero — closing is meant to be a hard gate, not a soft hide.
//
// SAVINGS GOALS SAVING INTO THIS ACCOUNT ARE DESTROYED BY CLOSING IT,
// and this function will not do that unless the caller explicitly says
// so. A goal is defined by the account holding its money; there is no
// meaningful state for a goal whose account is gone, and silently
// leaving one pointing at a closed account would make it read zero
// forever with no explanation. So the choice is surfaced instead of
// guessed:
//
//   closeAccount(id)                                  -> throws, naming
//                                                        the goals
//   closeAccount(id, { deleteLinkedSavingsGoals: true }) -> closes and
//                                                        deletes them
//
// AccountsScreen asks the user first, listing the goals by name, and
// only then passes the flag. The refusal lives here rather than only in
// that screen so no other caller — a future bulk action, a backend
// replacement — can take goals down without a person having agreed to
// it.
export async function closeAccount(
  accountId: number,
  options?: { deleteLinkedSavingsGoals?: boolean },
): Promise<Account> {
  try {
    const isZeroBalance = await getAccountTotalBalance(accountId);
    if (!isZeroBalance) {
      throw new Error(
        'This account still has a nonzero balance in at least one currency. Transfer the remainder elsewhere or log a transaction accounting for it before closing.',
      );
    }
    const linkedGoals = await getGoalsSavingIntoAccount(accountId);
    if (linkedGoals.length > 0 && !options?.deleteLinkedSavingsGoals) {
      throw new Error(
        `${describeLinkedGoals(linkedGoals)}. Closing it deletes them.`,
      );
    }
    // One transaction so the account is never left closed with its goals
    // still pointing at it, nor its goals deleted while the account
    // stays open.
    const goalIds = linkedGoals.map(goal => goal.id);
    const [updated] = await db.transaction(async tx => {
      if (goalIds.length > 0) {
        await tx
          .delete(savingsContributions)
          .where(inArray(savingsContributions.savingsGoalId, goalIds));
        await tx.delete(savingsGoals).where(inArray(savingsGoals.id, goalIds));
      }
      return tx
        .update(accounts)
        .set({ active: false })
        .where(eq(accounts.id, accountId))
        .returning();
    });
    return updated;
  } catch (error) {
    console.error(`closeAccount: failed to close account id=${accountId}`, error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/accounts/:id/reactivate), keeping the same input/return shape.
// Used by Stage 9a's reactivateLoanAccount, which reopens a closed
// Liability/Receivable account instead of creating a new one once its old
// loan is settled.
export async function reactivateAccount(accountId: number): Promise<Account> {
  try {
    const [updated] = await db
      .update(accounts)
      .set({ active: true })
      .where(eq(accounts.id, accountId))
      .returning();
    return updated;
  } catch (error) {
    console.error(
      `reactivateAccount: failed to reactivate account id=${accountId}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/accounts/active-count?type=, keeping the same return
// type. Counts ACTIVE accounts only — canAddAccount()'s free-tier slot
// must not be occupied by a closed account, since closing one was the
// user deliberately giving that slot back.
export async function getActiveAccountCountByType(
  type: string,
): Promise<number> {
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(accounts)
      .where(and(eq(accounts.type, type), eq(accounts.active, true)));
    return row?.count ?? 0;
  } catch (error) {
    console.error(
      `getActiveAccountCountByType: failed to count active accounts of type=${type}`,
      error,
    );
    throw error;
  }
}

