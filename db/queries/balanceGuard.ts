import { and, eq, sql } from 'drizzle-orm';
import { db } from '../index';
import { accountBalances, accounts, currencies, transactions } from '../schema';
import { AppError } from '../../utils/appErrors';
import { NON_TRANSACTABLE_ACCOUNT_TYPES } from '../../utils/accountTypes';

// The query layer's half of two rules every money-moving write shares:
//
//   1. the account and currency it uses must exist, be open/enabled, and
//      the account must actually hold that currency — checked up front,
//      with a sentence that names what is missing;
//   2. money may not leave a Cash/Bank/Crypto Wallet account that does
//      not have it — checked INSIDE the write's own transaction, by
//      reading the balance on both sides of the write.
//
// Forms check both before saving, against what is on screen. These are
// the safety net for when what is on screen is out of date.
//
// Not exported through db/queries/index.ts: these are building blocks
// for other query functions, not app-level entry points.

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbExecutor = Pick<typeof db, 'select'>;

// Current balance of an ordinary asset account (Cash/Bank/CryptoWallet)
// in one currency: the stored baseline plus every Income minus every
// Expense recorded against it. Same formula as getAccountBalance in
// ./accounts.ts, as one SQL aggregate, and readable through a
// transaction handle so it sees that transaction's own uncommitted
// writes. Only meaningful for the account types the balance rule
// applies to — a credit card stores its balance inverted (see
// getStoredBalanceDelta), which is one more reason the guard below skips
// card accounts entirely.
export async function getAssetBalanceWithin(
  executor: DbExecutor,
  accountId: number,
  currencyId: number,
): Promise<number> {
  const [baseline] = await executor
    .select({ balance: accountBalances.balance })
    .from(accountBalances)
    .where(
      and(
        eq(accountBalances.accountId, accountId),
        eq(accountBalances.currencyId, currencyId),
      ),
    )
    .limit(1);
  const [net] = await executor
    .select({
      total: sql<number>`coalesce(sum(case when ${transactions.entryType} = 'Income' then ${transactions.amount} else -${transactions.amount} end), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        eq(transactions.currencyId, currencyId),
      ),
    );
  return (baseline?.balance ?? 0) + Number(net?.total ?? 0);
}

export type MoneyAccountCheck = {
  accountId: number;
  currencyId: number;
  // New entries must use an open account and an enabled currency. An
  // edit of an existing entry is allowed to keep the account/currency it
  // already had even if one has since been closed or turned off —
  // otherwise old history would become uneditable.
  requireActive: boolean;
  // Most writes need the account to ALREADY hold the currency (a
  // transaction in a currency the account has no balance row for would
  // move money nobody can see). Loan writes are the exception: opening
  // a loan into an account creates that holding by design, so they pass
  // false here.
  requireHolding?: boolean;
};

// Resolves and checks the account and currency a money-moving write is
// about to use, throwing an AppError that names the actual problem. The
// field on each error says which control a form should point at.
export async function requireMoneyAccount(
  executor: DbExecutor,
  check: MoneyAccountCheck,
): Promise<{
  account: typeof accounts.$inferSelect;
  currency: typeof currencies.$inferSelect;
}> {
  if (!Number.isInteger(check.accountId)) {
    throw new AppError('ACCOUNT_MISSING', 'Choose an account', {
      field: 'account',
    });
  }
  if (!Number.isInteger(check.currencyId)) {
    throw new AppError('CURRENCY_MISSING', 'Choose a currency', {
      field: 'currency',
    });
  }
  const [account] = await executor
    .select()
    .from(accounts)
    .where(eq(accounts.id, check.accountId))
    .limit(1);
  if (!account) {
    throw new AppError(
      'ACCOUNT_MISSING',
      'That account no longer exists — it may have been deleted. Choose another account.',
      { field: 'account' },
    );
  }
  // Loan accounts only ever move through the loan flows — see
  // NON_TRANSACTABLE_ACCOUNT_TYPES for why.
  if (NON_TRANSACTABLE_ACCOUNT_TYPES.includes(account.type)) {
    throw new AppError(
      'VALIDATION',
      `${account.name} is a loan account. Choose a cash, bank, card or crypto account instead.`,
      { field: 'account' },
    );
  }
  if (check.requireActive && !account.active) {
    throw new AppError(
      'ACCOUNT_INACTIVE',
      `${account.name} is closed. Choose an open account.`,
      { field: 'account' },
    );
  }
  const [currency] = await executor
    .select()
    .from(currencies)
    .where(eq(currencies.id, check.currencyId))
    .limit(1);
  if (!currency) {
    throw new AppError(
      'CURRENCY_MISSING',
      'That currency no longer exists. Choose another currency.',
      { field: 'currency' },
    );
  }
  if (check.requireActive && !currency.active) {
    throw new AppError(
      'CURRENCY_INACTIVE',
      `${currency.code} is turned off. Turn it back on in More › Currencies, or choose another currency.`,
      { field: 'currency' },
    );
  }
  if (check.requireHolding === false) {
    return { account, currency };
  }
  const [holding] = await executor
    .select({ id: accountBalances.id })
    .from(accountBalances)
    .where(
      and(
        eq(accountBalances.accountId, check.accountId),
        eq(accountBalances.currencyId, check.currencyId),
      ),
    )
    .limit(1);
  if (!holding) {
    throw new AppError(
      'ACCOUNT_CURRENCY_MISSING',
      `${account.name} doesn't hold ${currency.code} yet — add ${currency.code} to it or pick another account`,
      { field: 'account' },
    );
  }
  return { account, currency };
}

// The amount rule every money write shares. Throws an AppError naming
// the problem rather than letting a NaN or a negative number reach the
// database.
export function requirePositiveAmount(amount: number, field = 'amount'): void {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new AppError('INVALID_AMOUNT', 'Enter an amount', { field });
  }
  if (amount <= 0) {
    throw new AppError('INVALID_AMOUNT', 'Enter an amount greater than 0', {
      field,
    });
  }
}
