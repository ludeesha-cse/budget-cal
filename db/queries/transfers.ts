import { and, eq, inArray, like } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db } from '../index';
import { validationError } from '../../utils/appErrors';
import {
  accountBalances,
  accounts,
  currencies,
  savingsContributions,
  transfers,
} from '../schema';
import { getBalanceDelta } from '../../utils/balanceMath';
import type { Account } from './accounts';
import { shiftAccountBaselineWithin } from './loans';

const TRANSFERABLE_ACCOUNT_TYPES = ['Bank', 'Cash', 'CryptoWallet'];

// A transfer now has two sides that can differ in BOTH account and
// currency:
//
//   from: (fromAccountId, currencyId, amount)
//   to:   (toAccountId,   toCurrencyId, toAmount)
//
// Same-currency transfers are the case where the two currencies match,
// not a separate code path. Two consequences worth stating plainly,
// because both reverse an older rule:
//
// 1. THE SAME ACCOUNT ON BOTH SIDES IS NOW LEGAL, as long as the
//    currencies differ. "BOC USD -> BOC LKR" is a real thing a bank
//    does, and refusing it would mean the user has to invent a second
//    account to model one conversion. Same account AND same currency is
//    still refused — that moves nothing.
//
// 2. THE TWO AMOUNTS ARE INDEPENDENT STORED FACTS. The app pre-fills
//    the to-amount from the configured rate, but the user can overwrite
//    it and what they accepted is what gets stored. Nothing here ever
//    recomputes one side from the other, so editing the rate in Settings
//    later cannot rewrite what a past transfer says it moved.
//
// Still true, and non-negotiable: a transfer writes NO `transactions`
// row. Money moving between accounts the user already owns is neither
// spending nor income, so it must never carry a category, never reach a
// budget, and never appear in a report's spending total.

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/accounts/transferable?currencyId=, keeping the same
// return shape. Only ordinary asset accounts can send or receive a
// transfer — CreditCard, Liability, and Receivable balances are all
// managed by their own dedicated flows (payOffCreditCard, settleLoan),
// never by moving money directly between accounts. When currencyId is
// given, the result is further filtered to accounts that already hold a
// balance row in that currency — a transfer moves money between existing
// holdings, it never creates a new one. That rule is what keeps
// "add a currency to an account" a single deliberate action in the
// Accounts screen rather than a side effect two features can cause.
export async function getTransferableAccounts(
  currencyId?: number,
): Promise<Account[]> {
  try {
    const rows = await db
      .select()
      .from(accounts)
      .where(
        and(
          inArray(accounts.type, TRANSFERABLE_ACCOUNT_TYPES),
          eq(accounts.active, true),
        ),
      );
    if (currencyId === undefined) {
      return rows;
    }
    const balanceRows = await db
      .select({ accountId: accountBalances.accountId })
      .from(accountBalances)
      .where(eq(accountBalances.currencyId, currencyId));
    const accountIdsWithCurrency = new Set(
      balanceRows.map(row => row.accountId),
    );
    return rows.filter(row => accountIdsWithCurrency.has(row.id));
  } catch (error) {
    console.error(
      `getTransferableAccounts: failed to load transferable accounts${
        currencyId !== undefined ? ` for currency id=${currencyId}` : ''
      }`,
      error,
    );
    throw error;
  }
}

// Shared by createTransfer and updateTransfer — every rule here is
// enforced in the query layer, not just the transfer form, so a future
// caller (another screen, a backend replacement) can't move money
// between disallowed account types, into a currency an account never
// actually held, or from an account to itself in the same currency just
// by skipping the UI.
export async function validateTransferSides(
  fromAccountId: number,
  fromCurrencyId: number,
  toAccountId: number,
  toCurrencyId: number,
): Promise<{ fromAccount: Account; toAccount: Account }> {
  // The one thing that genuinely moves nothing. Note this is deliberately
  // NOT "the accounts must differ" any more: same account + different
  // currencies is the in-place conversion this stage exists to support.
  if (fromAccountId === toAccountId && fromCurrencyId === toCurrencyId) {
    throw validationError(
      'Choose two different accounts, or two different currencies on the same account.',
    );
  }
  const [fromAccount] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, fromAccountId))
    .limit(1);
  if (!fromAccount || !TRANSFERABLE_ACCOUNT_TYPES.includes(fromAccount.type)) {
    throw validationError(
      fromAccount
        ? `${fromAccount.name} can't send a transfer. Choose a cash, bank or crypto account.`
        : 'That account no longer exists — it may have been deleted.',
      'account',
    );
  }
  const [toAccount] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, toAccountId))
    .limit(1);
  if (!toAccount || !TRANSFERABLE_ACCOUNT_TYPES.includes(toAccount.type)) {
    throw validationError(
      toAccount
        ? `${toAccount.name} can't receive a transfer. Choose a cash, bank or crypto account.`
        : 'The account you are sending to no longer exists — it may have been deleted.',
      'toAccount',
    );
  }
  const [fromBalanceRow] = await db
    .select()
    .from(accountBalances)
    .where(
      and(
        eq(accountBalances.accountId, fromAccountId),
        eq(accountBalances.currencyId, fromCurrencyId),
      ),
    )
    .limit(1);
  if (!fromBalanceRow) {
    throw validationError(
      `${fromAccount.name} doesn't hold that currency yet — add it to the account or pick another account`,
      'account',
    );
  }
  const [toBalanceRow] = await db
    .select()
    .from(accountBalances)
    .where(
      and(
        eq(accountBalances.accountId, toAccountId),
        eq(accountBalances.currencyId, toCurrencyId),
      ),
    )
    .limit(1);
  if (!toBalanceRow) {
    throw validationError(
      `${toAccount.name} doesn't hold that currency yet — add it to the account or pick another account`,
      'toAccount',
    );
  }
  return { fromAccount, toAccount };
}

export type TransferSides = {
  fromAccountId: number;
  toAccountId: number;
  // The from side: what leaves the source account, in the source
  // account's currency.
  amount: number;
  currencyId: number;
  // The to side: what lands in the destination account, in the
  // destination account's currency. Both optional, and both defaulting
  // to the from side, so every existing same-currency caller keeps
  // working unchanged — omitting them means "same currency, same
  // amount", which is exactly what a same-currency transfer is.
  toCurrencyId?: number;
  toAmount?: number;
  date: string; // 'YYYY-MM-DD'
  description?: string | null;
};

export type CreateTransferParams = TransferSides;
export type UpdateTransferParams = TransferSides;

// Fills in the to-side defaults once, so neither createTransfer nor
// updateTransfer has to repeat the `?? fromSide` fallback at four
// different points and risk the two drifting apart.
function resolveSides(params: TransferSides) {
  const toCurrencyId = params.toCurrencyId ?? params.currencyId;
  const toAmount = params.toAmount ?? params.amount;
  return { toCurrencyId, toAmount };
}

// Both sides have to be real, positive money. Checked as one function
// because "the amount is fine but the converted amount is zero" is a
// completely ordinary thing to do by accident in a two-field form, and
// it would otherwise create a transfer that takes money out and puts
// nothing back.
function validateAmounts(fromAmount: number, toAmount: number): void {
  if (!Number.isFinite(fromAmount) || fromAmount <= 0) {
    throw validationError('Enter an amount greater than 0', 'amount');
  }
  if (!Number.isFinite(toAmount) || toAmount <= 0) {
    throw validationError(
      'Enter a converted amount greater than 0',
      'convertedAmount',
    );
  }
}

// Applies both balance shifts and writes the transfers row, INSIDE a
// caller-supplied transaction. Split out of createTransfer so
// createSavingsTransfer (db/queries/savingsGoals.ts) can put the
// transfer and the savings contribution that points at it in the SAME
// atomic unit — calling createTransfer and then inserting the
// contribution afterwards would leave an unlinked transfer behind if the
// second write failed, which reads to the user as money that left an
// account for no recorded reason.
//
// Takes an already-resolved and already-validated set of sides: it does
// no checking of its own, because both callers validate before opening
// their transaction (reads inside a write transaction would be the more
// expensive way to reach the same answer).
export async function insertTransferWithin(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  sides: TransferSides & { toCurrencyId: number; toAmount: number },
  fromAccountType: string,
  toAccountType: string,
): Promise<number> {
  const fromDelta = getBalanceDelta(fromAccountType, 'Expense', sides.amount);
  const toDelta = getBalanceDelta(toAccountType, 'Income', sides.toAmount);
  await shiftAccountBaselineWithin(
    tx,
    sides.fromAccountId,
    sides.currencyId,
    fromDelta,
  );
  await shiftAccountBaselineWithin(
    tx,
    sides.toAccountId,
    sides.toCurrencyId,
    toDelta,
  );
  const [inserted] = await tx
    .insert(transfers)
    .values({
      fromAccountId: sides.fromAccountId,
      toAccountId: sides.toAccountId,
      amount: sides.amount,
      currencyId: sides.currencyId,
      toCurrencyId: sides.toCurrencyId,
      toAmount: sides.toAmount,
      description: sides.description ?? null,
      date: sides.date,
      createdAt: Date.now(),
    })
    .returning({ id: transfers.id });
  return inserted.id;
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/transfers), keeping the same input/return shape. Routes both
// balance changes through getBalanceDelta (Stage 10a) — the from-side as
// an 'Expense', the to-side as an 'Income' — even though direct
// arithmetic would give the same answer today (every account type this
// function allows is a plain asset account, never CreditCard), so
// there's still exactly one place that ever decides which direction
// money moves.
//
// When both sides are the SAME account (a currency conversion in place),
// the two shifts still target different account_balances rows, because a
// row is keyed by (account, currency) — so there is no read-modify-write
// collision to worry about, and no special case needed here.
export async function createTransfer(
  params: CreateTransferParams,
): Promise<number> {
  try {
    const { toCurrencyId, toAmount } = resolveSides(params);
    validateAmounts(params.amount, toAmount);
    const { fromAccount, toAccount } = await validateTransferSides(
      params.fromAccountId,
      params.currencyId,
      params.toAccountId,
      toCurrencyId,
    );
    let insertedId = 0;
    await db.transaction(async tx => {
      insertedId = await insertTransferWithin(
        tx,
        { ...params, toCurrencyId, toAmount },
        fromAccount.type,
        toAccount.type,
      );
    });
    // Returned (this used to be void) so createSavingsTransfer can link
    // the contribution it writes to the transfer that backs it.
    return insertedId;
  } catch (error) {
    console.error(
      `createTransfer: failed to transfer ${params.amount} from account id=${params.fromAccountId} to account id=${params.toAccountId}`,
      params,
      error,
    );
    throw error;
  }
}

// The stored to-side of a transfer row, with the pre-cross-currency
// fallback applied. Every read path goes through this rather than
// repeating `?? row.currencyId`, so a database restored from a backup
// taken before migration 0025 behaves exactly like a migrated one.
function storedToSide(row: typeof transfers.$inferSelect) {
  return {
    toCurrencyId: row.toCurrencyId ?? row.currencyId,
    toAmount: row.toAmount ?? row.amount,
  };
}

// NETWORK-READY: If a backend is added later, replace this with fetch(PATCH
// /api/transfers/:id), keeping the same input/return shape.
//
// Unlike updateTransaction (whose balance effect is entirely recomputed
// from scratch on every read via getAccountBalance, so editing that row
// alone is the whole update), a transfer's balance effect was applied
// directly to account_balances via shiftAccountBaselineWithin at
// creation time — nothing ever recomputes that later from the transfers
// table. So editing a transfer must explicitly undo the ORIGINAL
// amounts/accounts/currencies first — negating exactly what
// createTransfer applied, on BOTH sides independently — before applying
// the new values, or the old effect would still be sitting in the
// balances, silently doubled up alongside the new one. Both the reversal
// and the reapplication run inside the same DB transaction as the row
// update, so a failure partway through never leaves one side reversed
// and the other not.
//
// If a savings contribution is linked to this transfer, it is updated in
// the same DB transaction to match the new to-side amount and date —
// the contribution exists to say "this transfer put money into that
// goal", so letting it keep a stale figure would make History and the
// goal's progress disagree about the same event.
export async function updateTransfer(
  id: number,
  params: UpdateTransferParams,
): Promise<void> {
  try {
    const [original] = await db
      .select()
      .from(transfers)
      .where(eq(transfers.id, id))
      .limit(1);
    if (!original) {
      throw validationError(
        'That transfer no longer exists — it may have been deleted.',
      );
    }
    const { toCurrencyId, toAmount } = resolveSides(params);
    validateAmounts(params.amount, toAmount);
    const { fromAccount, toAccount } = await validateTransferSides(
      params.fromAccountId,
      params.currencyId,
      params.toAccountId,
      toCurrencyId,
    );
    const [originalFromAccount] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, original.fromAccountId))
      .limit(1);
    const [originalToAccount] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, original.toAccountId))
      .limit(1);
    const originalTo = storedToSide(original);

    await db.transaction(async tx => {
      // Reverse the ORIGINAL transfer's effect first, using its own
      // stored account/currency/amount fields on each side (these may
      // differ from the new params if the user changed accounts or
      // currency, not just the amount) — the negative of exactly what
      // createTransfer/the previous updateTransfer applied.
      const reverseFromDelta = -getBalanceDelta(
        originalFromAccount?.type ?? 'Bank',
        'Expense',
        original.amount,
      );
      const reverseToDelta = -getBalanceDelta(
        originalToAccount?.type ?? 'Bank',
        'Income',
        originalTo.toAmount,
      );
      await shiftAccountBaselineWithin(
        tx,
        original.fromAccountId,
        original.currencyId,
        reverseFromDelta,
      );
      await shiftAccountBaselineWithin(
        tx,
        original.toAccountId,
        originalTo.toCurrencyId,
        reverseToDelta,
      );

      // Apply the new transfer's effect.
      const newFromDelta = getBalanceDelta(
        fromAccount.type,
        'Expense',
        params.amount,
      );
      const newToDelta = getBalanceDelta(toAccount.type, 'Income', toAmount);
      await shiftAccountBaselineWithin(
        tx,
        params.fromAccountId,
        params.currencyId,
        newFromDelta,
      );
      await shiftAccountBaselineWithin(
        tx,
        params.toAccountId,
        toCurrencyId,
        newToDelta,
      );

      await tx
        .update(transfers)
        .set({
          fromAccountId: params.fromAccountId,
          toAccountId: params.toAccountId,
          amount: params.amount,
          currencyId: params.currencyId,
          toCurrencyId,
          toAmount,
          // Left alone when the caller doesn't pass one: the edit-transfer
          // sheet only exposes amount and date, and a savings transfer's
          // description is the goal's name — clobbering it to null there
          // would strip the goal's name out of History as a side effect
          // of correcting a typo in the amount.
          ...(params.description !== undefined
            ? { description: params.description }
            : {}),
          date: params.date,
        })
        .where(eq(transfers.id, id));

      // Keep the linked savings contribution in step with the money.
      // The contribution is always denominated in the goal's currency,
      // which is the transfer's TO side — so toAmount, never amount.
      await tx
        .update(savingsContributions)
        .set({ amount: toAmount, date: params.date })
        .where(eq(savingsContributions.transferId, id));
    });
  } catch (error) {
    console.error(
      `updateTransfer: failed to update transfer id=${id}`,
      params,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(DELETE
// /api/transfers/:id), keeping the same return shape. Reverses both
// balance effects the same way updateTransfer's reversal step does —
// negating exactly what was originally applied — before removing the
// row, otherwise the money the transfer moved would stay moved even
// though the record of it moving is gone.
//
// Any savings contribution linked to this transfer goes with it, in the
// same DB transaction. That is the deliberate answer to "what happens to
// the goal when I delete the transfer that funded it": the money is
// coming back out of the account, so the goal must stop claiming credit
// for it. Deleting the CONTRIBUTION from the goal's own screen runs the
// same reversal from the other direction (see deleteContribution).
export async function deleteTransfer(id: number): Promise<void> {
  try {
    const [original] = await db
      .select()
      .from(transfers)
      .where(eq(transfers.id, id))
      .limit(1);
    if (!original) {
      throw validationError(
        'That transfer no longer exists — it may have been deleted.',
      );
    }
    const [fromAccount] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, original.fromAccountId))
      .limit(1);
    const [toAccount] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, original.toAccountId))
      .limit(1);
    const originalTo = storedToSide(original);
    await db.transaction(async tx => {
      const reverseFromDelta = -getBalanceDelta(
        fromAccount?.type ?? 'Bank',
        'Expense',
        original.amount,
      );
      const reverseToDelta = -getBalanceDelta(
        toAccount?.type ?? 'Bank',
        'Income',
        originalTo.toAmount,
      );
      await shiftAccountBaselineWithin(
        tx,
        original.fromAccountId,
        original.currencyId,
        reverseFromDelta,
      );
      await shiftAccountBaselineWithin(
        tx,
        original.toAccountId,
        originalTo.toCurrencyId,
        reverseToDelta,
      );
      // Contribution first: it holds the foreign key, so removing it
      // before the transfer keeps the delete order valid regardless of
      // whether foreign keys are being enforced.
      await tx
        .delete(savingsContributions)
        .where(eq(savingsContributions.transferId, id));
      await tx.delete(transfers).where(eq(transfers.id, id));
    });
  } catch (error) {
    console.error(`deleteTransfer: failed to delete transfer id=${id}`, error);
    throw error;
  }
}

// Aliased twice for the same reason as loanAccountAlias/counterpartAccountAlias
// elsewhere — a transfer row references `accounts` from both the sending
// and receiving side, so a plain join can't tell them apart. The same is
// now true of `currencies`, which a converted transfer references twice.
const transferFromAccountAlias = alias(accounts, 'transfer_from_account_alias');

const transferToAccountAlias = alias(accounts, 'transfer_to_account_alias');

const transferFromCurrencyAlias = alias(
  currencies,
  'transfer_from_currency_alias',
);

const transferToCurrencyAlias = alias(currencies, 'transfer_to_currency_alias');

function selectTransferColumns() {
  return {
    id: transfers.id,
    fromAccountId: transfers.fromAccountId,
    fromAccountName: transferFromAccountAlias.name,
    toAccountId: transfers.toAccountId,
    toAccountName: transferToAccountAlias.name,
    // `amount`/`currencyId`/`currencyCode` keep their original names so
    // every existing consumer (History rows, Excel export, the edit
    // sheet) reads unchanged — they were always the from side. The
    // to-side fields below are the addition.
    amount: transfers.amount,
    currencyId: transfers.currencyId,
    currencyCode: transferFromCurrencyAlias.code,
    toAmount: transfers.toAmount,
    toCurrencyId: transfers.toCurrencyId,
    toCurrencyCode: transferToCurrencyAlias.code,
    description: transfers.description,
    date: transfers.date,
    createdAt: transfers.createdAt,
  };
}

// A left join on the to-side currency (rather than inner) so a row
// written before migration 0025 — which has a null to_currency_id if it
// somehow escaped the backfill — still appears in History instead of
// silently vanishing from the list. normalizeTransferRow below fills the
// nulls back in from the from side.
function transferQuery() {
  return db
    .select(selectTransferColumns())
    .from(transfers)
    .innerJoin(
      transferFromAccountAlias,
      eq(transfers.fromAccountId, transferFromAccountAlias.id),
    )
    .innerJoin(
      transferToAccountAlias,
      eq(transfers.toAccountId, transferToAccountAlias.id),
    )
    .innerJoin(
      transferFromCurrencyAlias,
      eq(transfers.currencyId, transferFromCurrencyAlias.id),
    )
    .leftJoin(
      transferToCurrencyAlias,
      eq(transfers.toCurrencyId, transferToCurrencyAlias.id),
    );
}

// transferQuery returns a Drizzle select builder, which is itself
// thenable — so one Awaited over its return type gives the row array,
// not two.
type RawTransferRow = Awaited<ReturnType<typeof transferQuery>>[number];

export type TransferListRow = Omit<
  RawTransferRow,
  'toAmount' | 'toCurrencyId' | 'toCurrencyCode'
> & {
  toAmount: number;
  toCurrencyId: number;
  toCurrencyCode: string;
  // True when the two sides are different currencies. Precomputed here
  // rather than compared at each render site, so "is this a converted
  // transfer?" has exactly one definition.
  isCrossCurrency: boolean;
};

// Collapses the nullable to-side into a guaranteed one, so no consumer
// ever has to know that null means "same as the from side".
function normalizeTransferRow(row: RawTransferRow): TransferListRow {
  const toCurrencyId = row.toCurrencyId ?? row.currencyId;
  return {
    ...row,
    toAmount: row.toAmount ?? row.amount,
    toCurrencyId,
    toCurrencyCode: row.toCurrencyCode ?? row.currencyCode,
    isCrossCurrency: toCurrencyId !== row.currencyId,
  };
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/transfers?month=YYYY-MM, keeping the same return
// shape. Mirrors getTransactionsByMonth/getLoanPaymentsByMonth's
// month-prefix filter so HistoryListScreen can fetch all three with the
// same `month` value and merge them into one list.
export async function getTransfers(month: string): Promise<TransferListRow[]> {
  try {
    const rows = await transferQuery().where(like(transfers.date, `${month}%`));
    return rows.map(normalizeTransferRow);
  } catch (error) {
    console.error(
      `getTransfers: failed to load transfers for month=${month}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/transfers?year=YYYY, keeping the same return shape.
// Sibling of getTransfers the same way getLoanPaymentsByYear is a sibling
// of getLoanPaymentsByMonth — HistoryListScreen's "whole year" view needs
// this exact shape to merge transfers in alongside everything else.
export async function getTransfersByYear(
  year: string,
): Promise<TransferListRow[]> {
  try {
    const rows = await transferQuery().where(like(transfers.date, `${year}%`));
    return rows.map(normalizeTransferRow);
  } catch (error) {
    console.error(
      `getTransfersByYear: failed to load transfers for year=${year}`,
      error,
    );
    throw error;
  }
}
