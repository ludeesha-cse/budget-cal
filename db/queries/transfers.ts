import { and, eq, inArray, like } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db } from '../index';
import {
  accountBalances,
  accounts,
  currencies,
  transfers,
} from '../schema';
import { getBalanceDelta } from '../../utils/balanceMath';
import type { Account } from './accounts';
import { shiftAccountBaselineWithin } from './loans';

const TRANSFERABLE_ACCOUNT_TYPES = ['Bank', 'Cash', 'CryptoWallet'];

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/accounts/transferable?currencyId=, keeping the same
// return shape. Only ordinary asset accounts can send or receive a
// transfer — CreditCard, Liability, and Receivable balances are all
// managed by their own dedicated flows (payOffCreditCard, settleLoan),
// never by moving money directly between accounts. When currencyId is
// given, the result is further filtered to accounts that already hold a
// balance row in that currency — a transfer can only move money within a
// currency both accounts already hold, never create a new holding.
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
// between disallowed account types or into a currency an account never
// actually held just by skipping the UI.
async function validateTransferAccounts(
  fromAccountId: number,
  toAccountId: number,
  currencyId: number,
): Promise<{ fromAccount: Account; toAccount: Account }> {
  if (fromAccountId === toAccountId) {
    throw new Error('Choose two different accounts to transfer between.');
  }
  const [fromAccount] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, fromAccountId))
    .limit(1);
  if (!fromAccount || !TRANSFERABLE_ACCOUNT_TYPES.includes(fromAccount.type)) {
    throw new Error('The source account is not a transferable account type.');
  }
  const [toAccount] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, toAccountId))
    .limit(1);
  if (!toAccount || !TRANSFERABLE_ACCOUNT_TYPES.includes(toAccount.type)) {
    throw new Error('The destination account is not a transferable account type.');
  }
  const [fromBalanceRow] = await db
    .select()
    .from(accountBalances)
    .where(
      and(
        eq(accountBalances.accountId, fromAccountId),
        eq(accountBalances.currencyId, currencyId),
      ),
    )
    .limit(1);
  if (!fromBalanceRow) {
    throw new Error('The source account has no balance in this currency.');
  }
  const [toBalanceRow] = await db
    .select()
    .from(accountBalances)
    .where(
      and(
        eq(accountBalances.accountId, toAccountId),
        eq(accountBalances.currencyId, currencyId),
      ),
    )
    .limit(1);
  if (!toBalanceRow) {
    throw new Error('The destination account has no balance in this currency.');
  }
  return { fromAccount, toAccount };
}

export type CreateTransferParams = {
  fromAccountId: number;
  toAccountId: number;
  amount: number;
  currencyId: number;
  date: string; // 'YYYY-MM-DD'
};

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/transfers), keeping the same input/return shape. Routes both
// balance changes through getBalanceDelta (Stage 10a) — the from-side as
// an 'Expense', the to-side as an 'Income' — even though direct
// arithmetic would give the same answer today (every account type this
// function allows is a plain asset account, never CreditCard), so
// there's still exactly one place that ever decides which direction
// money moves. Creates no `transactions` row: a transfer is money moving
// between two accounts the user already owns, not spending or income, so
// it must never carry a category or affect a budget.
export async function createTransfer(
  params: CreateTransferParams,
): Promise<void> {
  try {
    if (params.amount <= 0) {
      throw new Error('Enter a transfer amount greater than zero.');
    }
    const { fromAccount, toAccount } = await validateTransferAccounts(
      params.fromAccountId,
      params.toAccountId,
      params.currencyId,
    );
    await db.transaction(async tx => {
      const fromDelta = getBalanceDelta(
        fromAccount.type,
        'Expense',
        params.amount,
      );
      const toDelta = getBalanceDelta(toAccount.type, 'Income', params.amount);
      await shiftAccountBaselineWithin(
        tx,
        params.fromAccountId,
        params.currencyId,
        fromDelta,
      );
      await shiftAccountBaselineWithin(
        tx,
        params.toAccountId,
        params.currencyId,
        toDelta,
      );
      await tx.insert(transfers).values({
        fromAccountId: params.fromAccountId,
        toAccountId: params.toAccountId,
        amount: params.amount,
        currencyId: params.currencyId,
        date: params.date,
        createdAt: Date.now(),
      });
    });
  } catch (error) {
    console.error(
      `createTransfer: failed to transfer ${params.amount} from account id=${params.fromAccountId} to account id=${params.toAccountId}`,
      params,
      error,
    );
    throw error;
  }
}

export type UpdateTransferParams = {
  fromAccountId: number;
  toAccountId: number;
  amount: number;
  currencyId: number;
  date: string; // 'YYYY-MM-DD'
};

// NETWORK-READY: If a backend is added later, replace this with fetch(PATCH
// /api/transfers/:id), keeping the same input/return shape.
//
// Unlike updateTransaction (whose balance effect is entirely recomputed
// from scratch on every read via getAccountBalance, so editing that row
// alone is the whole update), a transfer's balance effect was applied
// directly to account_balances via shiftAccountBaselineWithin at
// creation time — nothing ever recomputes that later from the transfers
// table. So editing a transfer must explicitly undo the ORIGINAL
// amount/accounts/currency first — negating exactly what createTransfer
// applied — before applying the new values, or the old effect would
// still be sitting in two balances, silently doubled up alongside the
// new one. Both the reversal and the reapplication run inside the same
// DB transaction as the row update, so a failure partway through never
// leaves one side reversed and the other not.
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
      throw new Error('That transfer no longer exists.');
    }
    if (params.amount <= 0) {
      throw new Error('Enter a transfer amount greater than zero.');
    }
    const { fromAccount, toAccount } = await validateTransferAccounts(
      params.fromAccountId,
      params.toAccountId,
      params.currencyId,
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

    await db.transaction(async tx => {
      // Reverse the ORIGINAL transfer's effect first, using its own
      // stored account/currency/amount fields (these may differ from the
      // new params if the user changed accounts or currency, not just
      // the amount) — the negative of exactly what createTransfer/the
      // previous updateTransfer applied.
      const reverseFromDelta = -getBalanceDelta(
        originalFromAccount?.type ?? 'Bank',
        'Expense',
        original.amount,
      );
      const reverseToDelta = -getBalanceDelta(
        originalToAccount?.type ?? 'Bank',
        'Income',
        original.amount,
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
        original.currencyId,
        reverseToDelta,
      );

      // Apply the new transfer's effect.
      const newFromDelta = getBalanceDelta(
        fromAccount.type,
        'Expense',
        params.amount,
      );
      const newToDelta = getBalanceDelta(
        toAccount.type,
        'Income',
        params.amount,
      );
      await shiftAccountBaselineWithin(
        tx,
        params.fromAccountId,
        params.currencyId,
        newFromDelta,
      );
      await shiftAccountBaselineWithin(
        tx,
        params.toAccountId,
        params.currencyId,
        newToDelta,
      );

      await tx
        .update(transfers)
        .set({
          fromAccountId: params.fromAccountId,
          toAccountId: params.toAccountId,
          amount: params.amount,
          currencyId: params.currencyId,
          date: params.date,
        })
        .where(eq(transfers.id, id));
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
export async function deleteTransfer(id: number): Promise<void> {
  try {
    const [original] = await db
      .select()
      .from(transfers)
      .where(eq(transfers.id, id))
      .limit(1);
    if (!original) {
      throw new Error('That transfer no longer exists.');
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
    await db.transaction(async tx => {
      const reverseFromDelta = -getBalanceDelta(
        fromAccount?.type ?? 'Bank',
        'Expense',
        original.amount,
      );
      const reverseToDelta = -getBalanceDelta(
        toAccount?.type ?? 'Bank',
        'Income',
        original.amount,
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
        original.currencyId,
        reverseToDelta,
      );
      await tx.delete(transfers).where(eq(transfers.id, id));
    });
  } catch (error) {
    console.error(`deleteTransfer: failed to delete transfer id=${id}`, error);
    throw error;
  }
}

// Aliased twice for the same reason as loanAccountAlias/counterpartAccountAlias
// above — a transfer row references `accounts` from both the sending and
// receiving side, so a plain join can't tell them apart.
const transferFromAccountAlias = alias(accounts, 'transfer_from_account_alias');

const transferToAccountAlias = alias(accounts, 'transfer_to_account_alias');

function selectTransferColumns() {
  return {
    id: transfers.id,
    fromAccountId: transfers.fromAccountId,
    fromAccountName: transferFromAccountAlias.name,
    toAccountId: transfers.toAccountId,
    toAccountName: transferToAccountAlias.name,
    amount: transfers.amount,
    currencyId: transfers.currencyId,
    currencyCode: currencies.code,
    date: transfers.date,
    createdAt: transfers.createdAt,
  };
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/transfers?month=YYYY-MM, keeping the same return
// shape. Mirrors getTransactionsByMonth/getLoanPaymentsByMonth's
// month-prefix filter so HistoryListScreen can fetch all three with the
// same `month` value and merge them into one list.
export async function getTransfers(month: string) {
  try {
    return await db
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
      .innerJoin(currencies, eq(transfers.currencyId, currencies.id))
      .where(like(transfers.date, `${month}%`));
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
export async function getTransfersByYear(year: string) {
  try {
    return await db
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
      .innerJoin(currencies, eq(transfers.currencyId, currencies.id))
      .where(like(transfers.date, `${year}%`));
  } catch (error) {
    console.error(
      `getTransfersByYear: failed to load transfers for year=${year}`,
      error,
    );
    throw error;
  }
}

