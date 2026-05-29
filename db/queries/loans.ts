import { and, eq, like } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db } from '../index';
import {
  accountBalances,
  accounts,
  currencies,
  loanDetails,
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

// The drizzle transaction handle, so the balance helper below can run
// inside the same transaction as the rest of a loan's writes.
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Borrowing puts money into the counterpart account; lending takes it out.
// Both directions follow from `type` alone, the same way a credit card's
// sign is inferred from its account type rather than stored separately.
function counterpartDeltaSign(type: LoanAccountType): 1 | -1 {
  return type === 'Liability' ? 1 : -1;
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
    const today = getCurrentDateString();
    return await db.transaction(async tx => {
      const [account] = await tx
        .insert(accounts)
        .values({
          name: params.counterpartyName.trim(),
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

