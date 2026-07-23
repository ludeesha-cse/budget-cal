import { and, desc, eq, like, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db } from '../index';
import {
  accountBalances,
  accounts,
  currencies,
  loanDetails,
  loanOriginations,
  loanPayments,
} from '../schema';
import {
  getCurrentDateString,
} from '../../utils/date';
import { getTotalOwed } from '../../utils/interestCalculations';
import { getAccountBalance, reactivateAccount } from './accounts';
import type { Account } from './accounts';

export type LoanAccountType = 'Liability' | 'Receivable';

export type LoanTerms = {
  dueDate?: string; // 'YYYY-MM-DD'
  interestRate?: number; // rate × 100, e.g. 5.5% is 550
  interestPeriod?: 'monthly' | 'annual';
};

export type NewLoanAccount = LoanTerms & {
  type: LoanAccountType;
  counterpartyName: string;
  principal: number;
  currencyId: number;
  counterpartAccountId: number;
};

export type ReactivatedLoanAccount = LoanTerms & {
  accountId: number;
  principal: number;
  currencyId: number;
  counterpartAccountId: number;
};

// Adding more money to a loan that is already open, with the same
// counterparty — "I lent Hasindu another 2,000". Deliberately NOT a
// second account: the whole point of the duplicate-name fix is that one
// counterparty owes one running total, so this folds into the existing
// account's balance and records its own origination row.
export type TopUpLoanAccountParams = {
  accountId: number;
  amount: number;
  currencyId: number;
  counterpartAccountId: number;
  date: string; // 'YYYY-MM-DD'
};

// Correcting an open loan after the fact. `principal` here means the
// loan's CURRENT outstanding principal (the figure LoanCard shows as
// "Principal:"), not the amount originally handed over — see
// updateLoanAccount for why that distinction matters once a partial
// settlement has happened.
export type UpdateLoanAccountParams = LoanTerms & {
  accountId: number;
  counterpartyName: string;
  principal: number;
  currencyId: number;
  counterpartAccountId: number;
};

// The drizzle transaction handle, so the balance helper below can run
// inside the same transaction as the rest of a loan's writes.
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Borrowing puts money into the counterpart account; lending takes it out.
// Both directions follow from `type` alone, the same way a credit card's
// sign is inferred from its account type rather than stored separately.
function counterpartDeltaSign(type: LoanAccountType): 1 | -1 {
  return type === 'Liability' ? 1 : -1;
}

// accounts.name gets this prefixed form rather than the bare counterparty
// name — anywhere an account name surfaces without loan-specific context
// (NetWorth, a generic account picker, "Close {account.name}?"), a bare
// "John" reads as an ordinary account and is easy to mistake for one.
// loan_details.counterpartyName (and everywhere on the Liabilities &
// Receivables screen itself, which already labels Liability vs.
// Receivable) keeps the bare name — see createLoanAccount below.
function loanAccountName(type: LoanAccountType, counterpartyName: string): string {
  return type === 'Liability'
    ? `Borrowed_from_${counterpartyName}`
    : `Lend_to_${counterpartyName}`;
}

// Two counterparty names are "the same person" when they match ignoring
// surrounding whitespace and case — which is how a user reads them, and
// therefore the only comparison that stops "hasindu" and "Hasindu "
// becoming two accounts that each show half of what one person owes.
function normalizeCounterpartyName(name: string): string {
  return name.trim().toLowerCase();
}

// Refuses a second OPEN loan of the same type for a counterparty who
// already has one. This is the enforcement half of the duplicate fix;
// the form's own suggestion list is the discoverable half, offering the
// existing account as a top-up target before it ever gets here.
// `exceptAccountId` lets an edit keep its own name (a rename that
// changes nothing must not collide with itself).
async function assertNoOpenLoanWithName(
  type: LoanAccountType,
  counterpartyName: string,
  exceptAccountId?: number,
): Promise<void> {
  const target = normalizeCounterpartyName(counterpartyName);
  const openLoans = await db
    .select({
      accountId: accounts.id,
      counterpartyName: loanDetails.counterpartyName,
    })
    .from(accounts)
    .innerJoin(loanDetails, eq(loanDetails.accountId, accounts.id))
    .where(
      exceptAccountId == null
        ? and(eq(accounts.type, type), eq(accounts.active, true))
        : and(
            eq(accounts.type, type),
            eq(accounts.active, true),
            ne(accounts.id, exceptAccountId),
          ),
    );
  const clash = openLoans.find(
    row => normalizeCounterpartyName(row.counterpartyName) === target,
  );
  if (clash) {
    throw new Error(
      type === 'Liability'
        ? `You already have an open liability with ${counterpartyName.trim()}. Add to that one instead of opening a second.`
        : `You already have an open receivable with ${counterpartyName.trim()}. Add to that one instead of opening a second.`,
    );
  }
}

// Records the money actually crossing the loan edge, so History has a
// "Borrowed"/"Lent" row to show. Called from every path that hands money
// over: opening a loan, reopening a closed account, and topping an open
// one up.
async function recordLoanOriginationWithin(
  tx: DbTransaction,
  params: {
    loanAccountId: number;
    counterpartAccountId: number;
    amount: number;
    currencyId: number;
    date: string;
  },
): Promise<void> {
  await tx.insert(loanOriginations).values({
    loanAccountId: params.loanAccountId,
    counterpartAccountId: params.counterpartAccountId,
    amount: params.amount,
    currencyId: params.currencyId,
    date: params.date,
    createdAt: Date.now(),
  });
}

// Shifts a (account, currency) balance by `delta` by moving the stored
// baseline, not by posting a transaction. Deliberate: getAccountBalance
// computes "baseline − net transactions", so bumping the baseline moves
// the balance by exactly delta. Posting a transaction instead would work
// arithmetically but would make borrowed money show up as Income and lent
// money as an Expense on the Dashboard, which it isn't — a loan moves
// money between accounts, it doesn't earn or spend it.
export async function shiftAccountBaselineWithin(
  tx: DbTransaction,
  accountId: number,
  currencyId: number,
  delta: number,
): Promise<void> {
  const [existing] = await tx
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
    await tx
      .update(accountBalances)
      .set({ balance: existing.balance + delta })
      .where(eq(accountBalances.id, existing.id));
  } else {
    await tx
      .insert(accountBalances)
      .values({ accountId, currencyId, balance: delta });
  }
}

// Transaction-scoped twin of upsertAccountBalance: sets the balance
// outright rather than shifting it by a delta.
export async function upsertAccountBalanceWithin(
  tx: DbTransaction,
  accountId: number,
  currencyId: number,
  balance: number,
): Promise<void> {
  const [existing] = await tx
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
    await tx
      .update(accountBalances)
      .set({ balance })
      .where(eq(accountBalances.id, existing.id));
  } else {
    await tx.insert(accountBalances).values({ accountId, currencyId, balance });
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/loans?type=&active=false, keeping the same return
// shape. Powers the "reuse an existing account" step — inner-joined on
// loan_details because an account with no loan row has no counterparty
// name to reuse and nothing for reactivateLoanAccount to update.
export async function getInactiveLoanAccounts(type: LoanAccountType) {
  try {
    return await db
      .select({
        accountId: accounts.id,
        accountName: accounts.name,
        counterpartyName: loanDetails.counterpartyName,
        dateCreated: loanDetails.dateCreated,
      })
      .from(accounts)
      .innerJoin(loanDetails, eq(loanDetails.accountId, accounts.id))
      .where(and(eq(accounts.type, type), eq(accounts.active, false)));
  } catch (error) {
    console.error(
      `getInactiveLoanAccounts: failed to load inactive ${type} accounts`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/loans?type=&active=true, keeping the same return
// shape. currentBalance is the derived outstanding principal (see
// getAccountBalance); `principal` is the stored baseline it was opened at.
export async function getActiveLoanAccounts(type: LoanAccountType) {
  try {
    const rows = await db
      .select({
        accountId: accounts.id,
        accountName: accounts.name,
        counterpartyName: loanDetails.counterpartyName,
        dateCreated: loanDetails.dateCreated,
        lastAccrualAnchorDate: loanDetails.lastAccrualAnchorDate,
        dueDate: loanDetails.dueDate,
        interestRate: loanDetails.interestRate,
        interestPeriod: loanDetails.interestPeriod,
        // Which real account this loan's money moves through — read here
        // so the edit form can pre-select it (and updateLoanAccount can
        // put the old amount back into it). Null only for loans created
        // before migration 0027 added the column.
        counterpartAccountId: loanDetails.counterpartAccountId,
        currencyId: accountBalances.currencyId,
        currencyCode: currencies.code,
        principal: accountBalances.balance,
      })
      .from(accounts)
      .innerJoin(loanDetails, eq(loanDetails.accountId, accounts.id))
      .innerJoin(accountBalances, eq(accountBalances.accountId, accounts.id))
      .innerJoin(currencies, eq(accountBalances.currencyId, currencies.id))
      .where(and(eq(accounts.type, type), eq(accounts.active, true)));
    return await Promise.all(
      rows.map(async row => ({
        ...row,
        currentBalance: await getAccountBalance(row.accountId, row.currencyId),
      })),
    );
  } catch (error) {
    console.error(
      `getActiveLoanAccounts: failed to load active ${type} accounts`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/loans), keeping the same input/return shape. Creates the account,
// its loan_details row, its principal balance, and the counterpart
// account's offsetting adjustment as one atomic unit — a half-created
// loan would leave the counterpart account's balance silently wrong.
export async function createLoanAccount(
  params: NewLoanAccount,
): Promise<Account> {
  try {
    if (!params.counterpartyName.trim()) {
      throw new Error('A counterparty name is required to create a loan.');
    }
    await assertNoOpenLoanWithName(params.type, params.counterpartyName);
    const today = getCurrentDateString();
    return await db.transaction(async tx => {
      const [account] = await tx
        .insert(accounts)
        .values({
          name: loanAccountName(params.type, params.counterpartyName.trim()),
          type: params.type,
          active: true,
          createdAt: Date.now(),
        })
        .returning();
      await tx.insert(loanDetails).values({
        accountId: account.id,
        counterpartyName: params.counterpartyName.trim(),
        dateCreated: today,
        lastAccrualAnchorDate: today,
        dueDate: params.dueDate,
        interestRate: params.interestRate,
        interestPeriod: params.interestPeriod,
        counterpartAccountId: params.counterpartAccountId,
      });
      await tx.insert(accountBalances).values({
        accountId: account.id,
        currencyId: params.currencyId,
        balance: params.principal,
      });
      await shiftAccountBaselineWithin(
        tx,
        params.counterpartAccountId,
        params.currencyId,
        counterpartDeltaSign(params.type) * params.principal,
      );
      await recordLoanOriginationWithin(tx, {
        loanAccountId: account.id,
        counterpartAccountId: params.counterpartAccountId,
        amount: params.principal,
        currencyId: params.currencyId,
        date: today,
      });
      return account;
    });
  } catch (error) {
    console.error(
      `createLoanAccount: failed to create ${params.type} loan for counterparty="${params.counterpartyName}"`,
      params,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/loans/:accountId/reactivate), keeping the same input/return shape.
// Reuses a closed loan account for a brand new loan with the same
// counterparty: dateCreated and lastAccrualAnchorDate both reset to today,
// because for accrual purposes this is a new loan, not a continuation of
// the settled one. Updates the existing loan_details row rather than
// inserting — the accountId unique constraint allows only one.
export async function reactivateLoanAccount(
  params: ReactivatedLoanAccount,
): Promise<Account> {
  try {
    const today = getCurrentDateString();
    const [existingAccount] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, params.accountId))
      .limit(1);
    if (!existingAccount) {
      throw new Error('That loan account no longer exists.');
    }
    const [existingDetails] = await db
      .select()
      .from(loanDetails)
      .where(eq(loanDetails.accountId, params.accountId))
      .limit(1);
    if (existingDetails) {
      await assertNoOpenLoanWithName(
        existingAccount.type as LoanAccountType,
        existingDetails.counterpartyName,
        params.accountId,
      );
    }
    // Terms and balances are committed before the account is flipped back
    // to active, so a failure part-way leaves it closed and untouched
    // rather than active with a half-applied new loan on it.
    await db.transaction(async tx => {
      const updated = await tx
        .update(loanDetails)
        .set({
          dateCreated: today,
          lastAccrualAnchorDate: today,
          dueDate: params.dueDate ?? null,
          interestRate: params.interestRate ?? null,
          interestPeriod: params.interestPeriod ?? null,
          counterpartAccountId: params.counterpartAccountId,
        })
        .where(eq(loanDetails.accountId, params.accountId))
        .returning();
      if (updated.length === 0) {
        throw new Error(
          'This account has no loan details to reuse. Create a new loan account instead.',
        );
      }
      // A settled loan's principal row is zeroed, not deleted, so this
      // sets the new principal outright instead of adding to the old one.
      await upsertAccountBalanceWithin(
        tx,
        params.accountId,
        params.currencyId,
        params.principal,
      );
      await shiftAccountBaselineWithin(
        tx,
        params.counterpartAccountId,
        params.currencyId,
        counterpartDeltaSign(existingAccount.type as LoanAccountType) *
          params.principal,
      );
      await recordLoanOriginationWithin(tx, {
        loanAccountId: params.accountId,
        counterpartAccountId: params.counterpartAccountId,
        amount: params.principal,
        currencyId: params.currencyId,
        date: today,
      });
    });
    return await reactivateAccount(params.accountId);
  } catch (error) {
    console.error(
      `reactivateLoanAccount: failed to reactivate loan account id=${params.accountId}`,
      params,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/loans/:id/total-owed?asOf=YYYY-MM-DD, keeping the same
// return type. Composes the stored principal + loan_details with the pure
// getTotalOwed math — this is what live "total owed" figures on screen
// (and settleLoan's payment split below) always call instead of trusting
// any stored number, since accrued interest is never written back into
// the database. Assumes one balance row per loan account (true for every
// loan created via createLoanAccount/reactivateLoanAccount, which only
// ever set up a single currency) — takes the first if that assumption is
// ever violated by hand-editing accounts outside this flow.
export async function getLoanTotalOwed(
  accountId: number,
  asOfDate: string,
): Promise<number> {
  try {
    const [details] = await db
      .select()
      .from(loanDetails)
      .where(eq(loanDetails.accountId, accountId))
      .limit(1);
    if (!details) {
      throw new Error('No loan details found for this account.');
    }
    const [balanceRow] = await db
      .select()
      .from(accountBalances)
      .where(eq(accountBalances.accountId, accountId))
      .limit(1);
    const principal = balanceRow?.balance ?? 0;
    return getTotalOwed(
      principal,
      details.interestRate,
      details.interestPeriod,
      details.lastAccrualAnchorDate,
      asOfDate,
    );
  } catch (error) {
    console.error(
      `getLoanTotalOwed: failed to compute total owed for account id=${accountId} as of ${asOfDate}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/loans/:id/top-up), keeping the same input shape. Adds more money
// to a loan that is ALREADY open with this counterparty, instead of
// opening a second account for the same person.
//
// WHY IT FOLDS ACCRUED INTEREST IN FIRST: the loan account holds one
// number, and interest is never written back into it — it is recomputed
// from lastAccrualAnchorDate on every read. Adding to the stored
// principal without first settling what has accrued would silently
// restart the accrual clock on the combined figure and lose the interest
// earned so far. So this does exactly what a partial settlement does in
// reverse: bring the balance up to today's total owed, add the new
// money, and re-anchor accrual to today.
export async function topUpLoanAccount(
  params: TopUpLoanAccountParams,
): Promise<void> {
  try {
    if (params.amount <= 0) {
      throw new Error('Enter an amount greater than zero.');
    }
    const [loanAccount] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, params.accountId))
      .limit(1);
    if (!loanAccount) {
      throw new Error('That loan account no longer exists.');
    }
    if (!loanAccount.active) {
      throw new Error(
        'That loan is closed. Reopen it from the name suggestions instead.',
      );
    }
    const [balanceRow] = await db
      .select({
        currencyId: accountBalances.currencyId,
        currencyCode: currencies.code,
      })
      .from(accountBalances)
      .innerJoin(currencies, eq(accountBalances.currencyId, currencies.id))
      .where(eq(accountBalances.accountId, params.accountId))
      .limit(1);
    // One loan account holds exactly one currency (see getLoanTotalOwed's
    // note) — a top-up in a different one has no coherent meaning here,
    // so it is refused with the currency named rather than silently
    // opening a second balance row on the same account.
    if (balanceRow && balanceRow.currencyId !== params.currencyId) {
      throw new Error(
        `This loan is held in ${balanceRow.currencyCode}. Add to it in ${balanceRow.currencyCode}, or open a separate loan for another currency.`,
      );
    }
    const totalOwed = await getLoanTotalOwed(params.accountId, params.date);
    await db.transaction(async tx => {
      await upsertAccountBalanceWithin(
        tx,
        params.accountId,
        params.currencyId,
        totalOwed + params.amount,
      );
      await tx
        .update(loanDetails)
        .set({
          lastAccrualAnchorDate: params.date,
          counterpartAccountId: params.counterpartAccountId,
        })
        .where(eq(loanDetails.accountId, params.accountId));
      await shiftAccountBaselineWithin(
        tx,
        params.counterpartAccountId,
        params.currencyId,
        counterpartDeltaSign(loanAccount.type as LoanAccountType) *
          params.amount,
      );
      await recordLoanOriginationWithin(tx, {
        loanAccountId: params.accountId,
        counterpartAccountId: params.counterpartAccountId,
        amount: params.amount,
        currencyId: params.currencyId,
        date: params.date,
      });
    });
  } catch (error) {
    console.error(
      `topUpLoanAccount: failed to add ${params.amount} to loan account id=${params.accountId}`,
      params,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(PUT
// /api/loans/:id), keeping the same input shape. Edits an open loan in
// place and repairs every table that its original creation touched:
//
//   accounts.name          — the prefixed "Borrowed_from_X" form, so a
//                            rename follows through to History, Net
//                            Worth and every account picker at once
//   loan_details           — counterparty, due date, interest terms, and
//                            which account the money moves through
//   account_balances       — BOTH sides. The loan account is set to the
//                            new outstanding principal; the real account
//                            is corrected by exactly the difference, so
//                            dropping a lend from 6,000 to 5,000 puts
//                            1,000 back into the account it was paid
//                            from rather than leaving it short.
//   loan_originations      — the "Borrowed"/"Lent" row in History, moved
//                            by the same difference, so the ledger and
//                            the balances cannot disagree.
//
// `principal` is the CURRENT outstanding principal, not the amount
// originally handed over: that is the figure the card shows and the
// figure a user is looking at while editing. On a loan that has been
// partially settled those two differ, which is why the origination row
// is adjusted BY THE DIFFERENCE rather than overwritten — overwriting it
// would rewrite history to claim you had borrowed only what is left.
//
// Changing the currency or the counterpart account is treated as "put
// the whole old amount back, then hand the whole new amount over",
// because a delta across two different accounts (or two different
// currencies) is not a meaningful number. A loan created before
// loan_details.counterpart_account_id existed has nothing to put the old
// amount back INTO, so that half is skipped — the new side is still
// applied, and the user is not blocked from fixing the rest of the loan.
export async function updateLoanAccount(
  params: UpdateLoanAccountParams,
): Promise<void> {
  try {
    if (!params.counterpartyName.trim()) {
      throw new Error('A counterparty name is required.');
    }
    if (params.principal < 0) {
      throw new Error('Principal cannot be negative.');
    }
    const [loanAccount] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, params.accountId))
      .limit(1);
    if (!loanAccount) {
      throw new Error('That loan account no longer exists.');
    }
    const type = loanAccount.type as LoanAccountType;
    await assertNoOpenLoanWithName(
      type,
      params.counterpartyName,
      params.accountId,
    );
    const [details] = await db
      .select()
      .from(loanDetails)
      .where(eq(loanDetails.accountId, params.accountId))
      .limit(1);
    if (!details) {
      throw new Error('This account has no loan details to edit.');
    }
    const [balanceRow] = await db
      .select()
      .from(accountBalances)
      .where(eq(accountBalances.accountId, params.accountId))
      .limit(1);
    const oldPrincipal = balanceRow?.balance ?? 0;
    const oldCurrencyId = balanceRow?.currencyId ?? params.currencyId;
    const oldCounterpartAccountId = details.counterpartAccountId;
    const sign = counterpartDeltaSign(type);
    const crossedEdges =
      oldCurrencyId !== params.currencyId ||
      oldCounterpartAccountId !== params.counterpartAccountId;

    await db.transaction(async tx => {
      await tx
        .update(accounts)
        .set({ name: loanAccountName(type, params.counterpartyName.trim()) })
        .where(eq(accounts.id, params.accountId));
      await tx
        .update(loanDetails)
        .set({
          counterpartyName: params.counterpartyName.trim(),
          dueDate: params.dueDate ?? null,
          interestRate: params.interestRate ?? null,
          interestPeriod: params.interestPeriod ?? null,
          counterpartAccountId: params.counterpartAccountId,
        })
        .where(eq(loanDetails.accountId, params.accountId));

      // A loan account holds exactly one currency, so switching currency
      // means zeroing the old holding rather than leaving two live rows
      // that would both be read as "the" principal.
      if (oldCurrencyId !== params.currencyId) {
        await upsertAccountBalanceWithin(
          tx,
          params.accountId,
          oldCurrencyId,
          0,
        );
      }
      await upsertAccountBalanceWithin(
        tx,
        params.accountId,
        params.currencyId,
        params.principal,
      );

      if (crossedEdges) {
        if (oldCounterpartAccountId != null) {
          await shiftAccountBaselineWithin(
            tx,
            oldCounterpartAccountId,
            oldCurrencyId,
            -sign * oldPrincipal,
          );
        }
        await shiftAccountBaselineWithin(
          tx,
          params.counterpartAccountId,
          params.currencyId,
          sign * params.principal,
        );
      } else {
        await shiftAccountBaselineWithin(
          tx,
          params.counterpartAccountId,
          params.currencyId,
          sign * (params.principal - oldPrincipal),
        );
      }

      const [latestOrigination] = await tx
        .select()
        .from(loanOriginations)
        .where(eq(loanOriginations.loanAccountId, params.accountId))
        .orderBy(
          desc(loanOriginations.date),
          desc(loanOriginations.createdAt),
          desc(loanOriginations.id),
        )
        .limit(1);
      if (latestOrigination) {
        const corrected =
          latestOrigination.amount + (params.principal - oldPrincipal);
        await tx
          .update(loanOriginations)
          .set({
            // A correction big enough to drive the recorded amount to or
            // below zero means the delta rule has run out of room (the
            // loan has been settled down past what this row recorded);
            // falling back to the new principal keeps the row a real,
            // non-negative figure instead of an impossible one.
            amount: corrected > 0 ? corrected : params.principal,
            currencyId: params.currencyId,
            counterpartAccountId: params.counterpartAccountId,
          })
          .where(eq(loanOriginations.id, latestOrigination.id));
      }
    });
  } catch (error) {
    console.error(
      `updateLoanAccount: failed to update loan account id=${params.accountId}`,
      params,
      error,
    );
    throw error;
  }
}

export type SettleLoanParams = {
  loanAccountId: number;
  counterpartAccountId: number;
  paymentAmount: number;
  currencyId: number;
  date: string; // 'YYYY-MM-DD'
};

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/loans/:id/settle), keeping the same input/return shape. A payment
// is applied against interest-inclusive total owed (getLoanTotalOwed),
// not principal alone — otherwise accrued-but-unpaid interest would just
// vanish on a full payoff, or never get collected on a partial one.
// Everything below runs in a single DB transaction: a partial failure
// here (say, the loan closes but the counterpart account never moves)
// would be a real accounting bug, not a cosmetic one, so there's no
// sequencing that leaves it half-applied.
export async function settleLoan(params: SettleLoanParams): Promise<void> {
  try {
    if (params.paymentAmount <= 0) {
      throw new Error('Enter a payment amount greater than zero.');
    }
    const [loanAccount] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, params.loanAccountId))
      .limit(1);
    if (!loanAccount) {
      throw new Error('That loan account no longer exists.');
    }
    const totalOwed = await getLoanTotalOwed(params.loanAccountId, params.date);
    const isFullPayoff = params.paymentAmount >= totalOwed;

    await db.transaction(async tx => {
      if (isFullPayoff) {
        // Set directly, computed by us moments ago — this bypasses
        // closeAccount()'s zero-balance gate (and its user-facing prompt)
        // on purpose, per the Stage 9b spec: there's nothing to ask about
        // when we've just zeroed the balance ourselves in this same
        // transaction.
        await upsertAccountBalanceWithin(
          tx,
          params.loanAccountId,
          params.currencyId,
          0,
        );
        await tx
          .update(accounts)
          .set({ active: false })
          .where(eq(accounts.id, params.loanAccountId));
      } else {
        // The new, smaller principal absorbs whatever interest wasn't
        // covered by this payment — accrual then restarts from `date`
        // against that new principal, not from the loan's original date,
        // which is exactly what resetting lastAccrualAnchorDate does.
        const newPrincipal = totalOwed - params.paymentAmount;
        await upsertAccountBalanceWithin(
          tx,
          params.loanAccountId,
          params.currencyId,
          newPrincipal,
        );
        await tx
          .update(loanDetails)
          .set({ lastAccrualAnchorDate: params.date })
          .where(eq(loanDetails.accountId, params.loanAccountId));
      }
      // Liability settlement pays down what you owe, so the counterpart
      // account drains; Receivable settlement is someone paying you back,
      // so it fills up — the exact opposite direction of
      // counterpartDeltaSign at loan creation, since money is now flowing
      // back across the same edge it originally crossed.
      await shiftAccountBaselineWithin(
        tx,
        params.counterpartAccountId,
        params.currencyId,
        -counterpartDeltaSign(loanAccount.type as LoanAccountType) *
          params.paymentAmount,
      );
      await tx.insert(loanPayments).values({
        loanAccountId: params.loanAccountId,
        counterpartAccountId: params.counterpartAccountId,
        amount: params.paymentAmount,
        currencyId: params.currencyId,
        date: params.date,
        createdAt: Date.now(),
      });
    });
  } catch (error) {
    console.error(
      `settleLoan: failed to settle a payment of ${params.paymentAmount} against loan account id=${params.loanAccountId}`,
      params,
      error,
    );
    throw error;
  }
}

// Aliased twice because a loan_payments row references `accounts` from
// both sides (the loan account and the counterpart account) — a plain
// join can't disambiguate two references to the same table.
const loanAccountAlias = alias(accounts, 'loan_account_alias');

const counterpartAccountAlias = alias(accounts, 'counterpart_account_alias');

function selectLoanPaymentColumns() {
  return {
    id: loanPayments.id,
    loanAccountId: loanPayments.loanAccountId,
    loanAccountName: loanAccountAlias.name,
    loanAccountType: loanAccountAlias.type,
    counterpartAccountId: loanPayments.counterpartAccountId,
    counterpartAccountName: counterpartAccountAlias.name,
    amount: loanPayments.amount,
    currencyId: loanPayments.currencyId,
    currencyCode: currencies.code,
    date: loanPayments.date,
    createdAt: loanPayments.createdAt,
  };
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/loan-payments?month=YYYY-MM, keeping the same return
// shape. Mirrors getTransactionsByMonth's month-prefix filter so
// HistoryListScreen can fetch both with the same `month` value and merge
// them into one list.
export async function getLoanPaymentsByMonth(month: string) {
  try {
    return await db
      .select(selectLoanPaymentColumns())
      .from(loanPayments)
      .innerJoin(
        loanAccountAlias,
        eq(loanPayments.loanAccountId, loanAccountAlias.id),
      )
      .innerJoin(
        counterpartAccountAlias,
        eq(loanPayments.counterpartAccountId, counterpartAccountAlias.id),
      )
      .innerJoin(currencies, eq(loanPayments.currencyId, currencies.id))
      .where(like(loanPayments.date, `${month}%`));
  } catch (error) {
    console.error(
      `getLoanPaymentsByMonth: failed to load loan payments for month=${month}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/loan-payments?year=YYYY, keeping the same return shape.
export async function getLoanPaymentsByYear(year: string) {
  try {
    return await db
      .select(selectLoanPaymentColumns())
      .from(loanPayments)
      .innerJoin(
        loanAccountAlias,
        eq(loanPayments.loanAccountId, loanAccountAlias.id),
      )
      .innerJoin(
        counterpartAccountAlias,
        eq(loanPayments.counterpartAccountId, counterpartAccountAlias.id),
      )
      .innerJoin(currencies, eq(loanPayments.currencyId, currencies.id))
      .where(like(loanPayments.date, `${year}%`));
  } catch (error) {
    console.error(
      `getLoanPaymentsByYear: failed to load loan payments for year=${year}`,
      error,
    );
    throw error;
  }
}


// The origination ledger's own aliases. counterpart_account_id is
// nullable (migration 0027 backfilled pre-existing loans without one), so
// this side is LEFT joined — an inner join would silently drop exactly
// the historical rows the backfill exists to surface.
const originationLoanAccountAlias = alias(accounts, 'origination_loan_account');

const originationCounterpartAlias = alias(
  accounts,
  'origination_counterpart_account',
);

function selectLoanOriginationColumns() {
  return {
    id: loanOriginations.id,
    loanAccountId: loanOriginations.loanAccountId,
    loanAccountName: originationLoanAccountAlias.name,
    loanAccountType: originationLoanAccountAlias.type,
    counterpartyName: loanDetails.counterpartyName,
    counterpartAccountId: loanOriginations.counterpartAccountId,
    counterpartAccountName: originationCounterpartAlias.name,
    amount: loanOriginations.amount,
    currencyId: loanOriginations.currencyId,
    currencyCode: currencies.code,
    date: loanOriginations.date,
    createdAt: loanOriginations.createdAt,
  };
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/loan-originations?month=YYYY-MM, keeping the same
// return shape. Mirrors getLoanPaymentsByMonth exactly so History can
// fetch both with the same `month` value and merge them into one list.
export async function getLoanOriginationsByMonth(month: string) {
  try {
    return await db
      .select(selectLoanOriginationColumns())
      .from(loanOriginations)
      .innerJoin(
        originationLoanAccountAlias,
        eq(loanOriginations.loanAccountId, originationLoanAccountAlias.id),
      )
      .innerJoin(
        loanDetails,
        eq(loanDetails.accountId, loanOriginations.loanAccountId),
      )
      .leftJoin(
        originationCounterpartAlias,
        eq(loanOriginations.counterpartAccountId, originationCounterpartAlias.id),
      )
      .innerJoin(currencies, eq(loanOriginations.currencyId, currencies.id))
      .where(like(loanOriginations.date, `${month}%`));
  } catch (error) {
    console.error(
      `getLoanOriginationsByMonth: failed to load loan originations for month=${month}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/loan-originations?year=YYYY, keeping the same return
// shape.
export async function getLoanOriginationsByYear(year: string) {
  try {
    return await db
      .select(selectLoanOriginationColumns())
      .from(loanOriginations)
      .innerJoin(
        originationLoanAccountAlias,
        eq(loanOriginations.loanAccountId, originationLoanAccountAlias.id),
      )
      .innerJoin(
        loanDetails,
        eq(loanDetails.accountId, loanOriginations.loanAccountId),
      )
      .leftJoin(
        originationCounterpartAlias,
        eq(loanOriginations.counterpartAccountId, originationCounterpartAlias.id),
      )
      .innerJoin(currencies, eq(loanOriginations.currencyId, currencies.id))
      .where(like(loanOriginations.date, `${year}%`));
  } catch (error) {
    console.error(
      `getLoanOriginationsByYear: failed to load loan originations for year=${year}`,
      error,
    );
    throw error;
  }
}
