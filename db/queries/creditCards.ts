import { eq } from 'drizzle-orm';
import { db } from '../index';
import {
  accounts,
  creditCardPayoffs,
} from '../schema';
import {
  getAccounts,
  getAccountBalance,
  getNetSpentForAccount,
  updateAccount,
  CREDIT_CARD_TYPE,
} from './accounts';
import type { Account } from './accounts';
import { getDefaultCurrency } from './currencies';
import { shiftAccountBaselineWithin } from './loans';

// If a backend is added later, replace this with a fetch() call to GET
// /api/accounts/credit-card-debt, keeping the same return type. Card
// balances are negative (owed to the bank); debt is shown as the positive
// amount you owe. Computed in the default currency only — multi-currency
// credit card debt isn't tracked separately yet.
export async function getTotalCreditCardDebt(): Promise<number> {
  const defaultCurrency = await getDefaultCurrency();
  if (!defaultCurrency) {
    return 0;
  }
  const cardAccounts = (await getAccounts()).filter(
    account => account.type === CREDIT_CARD_TYPE,
  );
  const balances = await Promise.all(
    cardAccounts.map(account =>
      getAccountBalance(account.id, defaultCurrency.id),
    ),
  );
  const totalBalance = balances.reduce((sum, balance) => sum + balance, 0);
  return -totalBalance;
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/accounts/:id/credit-card-debt?currencyId=, keeping the
// same return type. Single-card, single-currency version of
// getTotalCreditCardDebt — same "stored balance is the negative of what's
// owed" convention (see getStoredBalanceDelta above), just for one card
// instead of summed across every card in the default currency.
export async function getCreditCardDebt(
  accountId: number,
  currencyId: number,
): Promise<number> {
  try {
    const balance = await getAccountBalance(accountId, currencyId);
    return -balance;
  } catch (error) {
    console.error(
      `getCreditCardDebt: failed to compute debt for account id=${accountId} currency id=${currencyId}`,
      error,
    );
    throw error;
  }
}

// If a backend is added later, replace this with fetch(POST
// /api/accounts/:id/settle), keeping the same return type. Settling a
// credit card doesn't delete its transaction history — it raises the
// account's opening balance (in the default currency, same as the rest
// of the credit-card-debt flow) to match what's been net-spent so far,
// so the computed balance (and debt) resets to zero going forward.
export async function settleCreditCardAccount(
  accountId: number,
): Promise<Account> {
  try {
    const defaultCurrency = await getDefaultCurrency();
    const netSpent = defaultCurrency
      ? await getNetSpentForAccount(accountId, defaultCurrency.id)
      : 0;
    return await updateAccount(accountId, { openingBalance: netSpent });
  } catch (error) {
    console.error(
      `settleCreditCardAccount: failed to settle account id=${accountId}`,
      error,
    );
    throw error;
  }
}

export type PayOffCreditCardParams = {
  creditCardAccountId: number;
  payingAccountId: number;
  amount: number;
  currencyId: number;
  date: string; // 'YYYY-MM-DD'
};

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/credit-cards/:id/payoffs), keeping the same input/return shape.
// Moves `amount` off the card's debt and out of the paying account in one
// atomic step, using the same baseline-shifting trick as settleLoan
// (shiftAccountBaselineWithin) rather than posting an Expense/Income
// transaction — a payoff isn't new spending or income, it's money moving
// between two accounts the user already owns, and the purchases it's
// paying down were already expensed (and already counted toward a
// budget) when they happened. Recording this as a transaction too would
// double-count them. Never closes the card even if this pays it off
// exactly to zero — unlike a settled loan, a paid-off credit card's
// normal resting state is active, ready for the next purchase.
export async function payOffCreditCard(
  params: PayOffCreditCardParams,
): Promise<void> {
  try {
    if (params.amount <= 0) {
      throw new Error('Enter a payment amount greater than zero.');
    }
    const [creditCardAccount] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, params.creditCardAccountId))
      .limit(1);
    if (!creditCardAccount || creditCardAccount.type !== CREDIT_CARD_TYPE) {
      throw new Error('That account is not a credit card.');
    }
    const [payingAccount] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, params.payingAccountId))
      .limit(1);
    if (!payingAccount) {
      throw new Error('The paying account no longer exists.');
    }
    if (payingAccount.type === CREDIT_CARD_TYPE) {
      throw new Error(
        'You cannot pay off a credit card with another credit card.',
      );
    }
    const currentDebt = await getCreditCardDebt(
      params.creditCardAccountId,
      params.currencyId,
    );
    if (params.amount > currentDebt) {
      throw new Error(
        `That payment (${params.amount.toFixed(2)}) is more than the ` +
          `current debt (${currentDebt.toFixed(2)}). Overpaying a card ` +
          'into a credit balance is not supported.',
      );
    }
    await db.transaction(async tx => {
      // Paying down debt raises the card's stored balance toward zero
      // (that balance is the negative of what's owed — see
      // getStoredBalanceDelta above) and drains the paying account by the
      // same amount, the same two-sided move settleLoan makes for a loan
      // repayment.
      await shiftAccountBaselineWithin(
        tx,
        params.creditCardAccountId,
        params.currencyId,
        params.amount,
      );
      await shiftAccountBaselineWithin(
        tx,
        params.payingAccountId,
        params.currencyId,
        -params.amount,
      );
      await tx.insert(creditCardPayoffs).values({
        creditCardAccountId: params.creditCardAccountId,
        payingAccountId: params.payingAccountId,
        amount: params.amount,
        currencyId: params.currencyId,
        date: params.date,
        createdAt: Date.now(),
      });
    });
  } catch (error) {
    console.error(
      `payOffCreditCard: failed to pay off ${params.amount} against credit card account id=${params.creditCardAccountId}`,
      params,
      error,
    );
    throw error;
  }
}

