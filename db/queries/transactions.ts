import { and, asc, eq, like, sql } from 'drizzle-orm';
import { db } from '../index';
import {
  accounts,
  categories,
  currencies,
  installmentPayments,
  recurringOccurrences,
  transactions,
} from '../schema';
import { validationError } from '../../utils/appErrors';
import { requireMoneyAccount, requirePositiveAmount } from './balanceGuard';
import { setTransactionTagsWithin } from './tags';

type Transaction = typeof transactions.$inferSelect;

export type NewTransaction = {
  accountId: number;
  amount: number;
  categoryId: number;
  description?: string;
  date: string; // 'YYYY-MM-DD'
  entryType: 'Expense' | 'Income';
  currencyId: number;
  excludeFromBudget?: boolean; // Stage 16a — defaults to false when omitted
  // When given, the transaction's tag set is written in the SAME database
  // transaction as the row itself — an expense that saved while its tags
  // failed (or the reverse) is exactly the half-save this avoids.
  tagIds?: number[];
};

// No categoryId — Income entries carry no category at all, by design
// (the dedicated Income tab has no category picker anywhere in it).
export type NewIncome = {
  date: string; // 'YYYY-MM-DD'
  amount: number;
  description?: string;
  accountId: number;
  currencyId: number;
  excludeFromBudget?: boolean; // Stage 16a — defaults to false when omitted
  tagIds?: number[]; // see NewTransaction.tagIds
};

//If a backend is added later, replace this with a fetch() call
// to GET /api/transactions, keeping the same return type.
export async function getTransactions() {
  try {
    return await db.select().from(transactions);
  } catch (error) {
    console.error('getTransactions: failed to load all transactions', error);
    throw error;
  }
}

//  If a backend is added later, replace this with a fetch() call
// to POST /api/transactions, keeping the same input/return shape. Used
// for Expense entries; Income goes through addIncome instead, even
// though the two share the same underlying insert shape — kept as
// separate named functions per Stage 8's spec. No balance arithmetic
// happens here — this just records the row; getNetSpentForAccount is
// the only place that later decides what effect entryType has on the
// balance (via getBalanceDelta in utils/balanceMath.ts), so there's
// nothing here that could disagree with it.
//
// Checked before anything is written: the amount is a real positive
// number, and the account and currency exist, are open, and belong
// together (see requireMoneyAccount). An Expense is additionally refused
// if it would take a Cash/Bank/Crypto Wallet account below zero — checked
// INSIDE the transaction, against the balance as it is at that moment,
// so a stale figure on screen cannot let it through.
export async function addTransaction(data: NewTransaction) {
  const { tagIds, ...row } = data;
  try {
    requirePositiveAmount(row.amount);
    if (row.entryType === 'Expense' && row.categoryId == null) {
      throw validationError('Choose a category', 'categoryId');
    }
    await requireMoneyAccount(db, {
      accountId: row.accountId,
      currencyId: row.currencyId,
      requireActive: true,
    });
    return await db.transaction(async tx => {
      const insert = () =>
        tx
          .insert(transactions)
          .values({
            ...row,
            excludeFromBudget: row.excludeFromBudget ?? false,
            createdAt: Date.now(),
          })
          .returning();
      const inserted =
        row.entryType === 'Expense' ? await insert() : await insert();
      if (tagIds && inserted[0]) {
        await setTransactionTagsWithin(tx, inserted[0].id, tagIds);
      }
      return inserted;
    });
  } catch (error) {
    console.error('addTransaction: failed to insert transaction', data, error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to POST /api/transactions/income, keeping the same input/return
// shape. This is the single insert for the whole operation — account
// balances are never stored as a running total, they're always derived
// on read (getAccountBalance nets every transaction for the account
// against its stored baseline via getBalanceDelta), so there's no second
// write to account_balances that could fall out of sync with this one:
// the "balance effect" and "recording the transaction" are the same write.
// categoryId is always written as null — Income never gets a category.
export async function addIncome(data: NewIncome) {
  try {
    requirePositiveAmount(data.amount);
    await requireMoneyAccount(db, {
      accountId: data.accountId,
      currencyId: data.currencyId,
      requireActive: true,
    });
    return await db.transaction(async tx => {
      const inserted = await tx
        .insert(transactions)
        .values({
          accountId: data.accountId,
          amount: data.amount,
          categoryId: null,
          description: data.description,
          date: data.date,
          currencyId: data.currencyId,
          entryType: 'Income',
          excludeFromBudget: data.excludeFromBudget ?? false,
          createdAt: Date.now(),
        })
        .returning();
      if (data.tagIds && inserted[0]) {
        await setTransactionTagsWithin(tx, inserted[0].id, data.tagIds);
      }
      return inserted;
    });
  } catch (error) {
    console.error(
      'addIncome: failed to insert income transaction',
      data,
      error,
    );
    throw error;
  }
}

//  If a backend is added later, replace this with a fetch() call
// to GET /api/transactions?month=YYYY-MM, keeping the same return type.
export async function getTransactionsByMonth(month: string) {
  try {
    return await db
      .select({
        id: transactions.id,
        accountId: transactions.accountId,
        // Joined in (Stage: History account display) so HistoryListScreen
        // can show which account each expense/income actually moved
        // through, the same way it already shows from/to for transfers
        // and loan payments — accountId alone meant looking that up meant
        // a second round trip per row.
        accountName: accounts.name,
        amount: transactions.amount,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        description: transactions.description,
        date: transactions.date,
        entryType: transactions.entryType,
        currencyId: transactions.currencyId,
        // Joined in so History can show a currency tag on any row whose
        // currency differs from the app's default — see TransactionRow's
        // own render logic. Same join searchTransactions already does.
        currencyCode: currencies.code,
        excludeFromBudget: transactions.excludeFromBudget,
        createdAt: transactions.createdAt,
        // What this transaction really is, beyond an expense with a
        // date. A scheduled payment — an installment slot or a confirmed
        // recurring occurrence — is a real transactions row like any
        // other, but it is ALSO a step in a plan, and editing it alone
        // would leave the plan saying something the money no longer
        // supports. History reads these three to decide whether to offer
        // the edit action, and to route delete through the matching undo
        // rather than a bare row delete. Null on an ordinary
        // transaction, which stays fully editable.
        installmentPaymentId: installmentPayments.id,
        installmentIsCustomAmount: installmentPayments.isCustomAmount,
        recurringOccurrenceId: recurringOccurrences.id,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .innerJoin(currencies, eq(transactions.currencyId, currencies.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(
        installmentPayments,
        eq(installmentPayments.transactionId, transactions.id),
      )
      .leftJoin(
        recurringOccurrences,
        eq(recurringOccurrences.transactionId, transactions.id),
      )
      .where(like(transactions.date, `${month}%`));
  } catch (error) {
    console.error(
      `getTransactionsByMonth: failed to load transactions for month=${month}`,
      error,
    );
    throw error;
  }
}

//If a backend is added later, replace this with a fetch() call
// to GET /api/transactions?year=YYYY, keeping the same return type.
export async function getTransactionsByYear(year: string) {
  try {
    return await db
      .select({
        id: transactions.id,
        accountId: transactions.accountId,
        // See getTransactionsByMonth's own comment on this same join.
        accountName: accounts.name,
        amount: transactions.amount,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        description: transactions.description,
        date: transactions.date,
        entryType: transactions.entryType,
        currencyId: transactions.currencyId,
        currencyCode: currencies.code,
        excludeFromBudget: transactions.excludeFromBudget,
        createdAt: transactions.createdAt,
        // What this transaction really is, beyond an expense with a
        // date. A scheduled payment — an installment slot or a confirmed
        // recurring occurrence — is a real transactions row like any
        // other, but it is ALSO a step in a plan, and editing it alone
        // would leave the plan saying something the money no longer
        // supports. History reads these three to decide whether to offer
        // the edit action, and to route delete through the matching undo
        // rather than a bare row delete. Null on an ordinary
        // transaction, which stays fully editable.
        installmentPaymentId: installmentPayments.id,
        installmentIsCustomAmount: installmentPayments.isCustomAmount,
        recurringOccurrenceId: recurringOccurrences.id,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .innerJoin(currencies, eq(transactions.currencyId, currencies.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(
        installmentPayments,
        eq(installmentPayments.transactionId, transactions.id),
      )
      .leftJoin(
        recurringOccurrences,
        eq(recurringOccurrences.transactionId, transactions.id),
      )
      .where(like(transactions.date, `${year}%`));
  } catch (error) {
    console.error(
      `getTransactionsByYear: failed to load transactions for year=${year}`,
      error,
    );
    throw error;
  }
}

//If a backend is added later, replace this with a fetch() call
// to GET /api/transactions/summary?month=YYYY-MM&currencyId=&groupBy=category,
// keeping the same return shape. Expense-only — Income entries are tracked
// separately (getMonthlyIncome) rather than netted into "expenses by type".
// Currency-scoped and excludeFromBudget-filtered, matching getMonthlyTotal
// and getSpendingByCategory's semantics — this used to mix every currency
// together (a USD 10 coffee and an LKR 1000 coffee would add up to "11
// Food") and never respected excludeFromBudget at all; both were bugs,
// not intentional behavior differences from the rest of the budget layer.
export async function getExpensesByType(month: string, currencyId: number) {
  try {
    return await db
      .select({
        type: categories.name,
        total: sql<number>`sum(${transactions.amount})`,
      })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        and(
          like(transactions.date, `${month}%`),
          eq(transactions.entryType, 'Expense'),
          eq(transactions.currencyId, currencyId),
          eq(transactions.excludeFromBudget, false),
        ),
      )
      .groupBy(categories.name);
  } catch (error) {
    console.error(
      `getExpensesByType: failed to summarize expenses by category for month=${month} currency id=${currencyId}`,
      error,
    );
    throw error;
  }
}

export type ExpenseCurrencyOption = { id: number; code: string; name: string };

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/transactions/summary/currencies?month=YYYY-MM, keeping
// the same return shape. Backs ExpensesByTypeScreen's currency tabs —
// unlike CategoryBudgetsScreen's tabs (every app currency, since you can
// budget ahead of any spending), this is a view-only screen, so it only
// offers currencies that actually have expense activity this month —
// same "available currencies" idea as Reports' useReportData, just scoped
// to expenses-by-category instead of the full report set.
export async function getExpenseCurrenciesForMonth(
  month: string,
): Promise<ExpenseCurrencyOption[]> {
  try {
    return await db
      .selectDistinct({
        id: currencies.id,
        code: currencies.code,
        name: currencies.name,
      })
      .from(transactions)
      .innerJoin(currencies, eq(transactions.currencyId, currencies.id))
      .where(
        and(
          like(transactions.date, `${month}%`),
          eq(transactions.entryType, 'Expense'),
          eq(transactions.excludeFromBudget, false),
          // A currency the user has disabled on the Currencies screen
          // never gets its own tab here either, even if it has real
          // spending this month — same "disabled means hidden
          // everywhere" rule every other currency picker follows.
          eq(currencies.active, true),
        ),
      )
      .orderBy(asc(currencies.code));
  } catch (error) {
    console.error(
      `getExpenseCurrenciesForMonth: failed to list active currencies for month=${month}`,
      error,
    );
    throw error;
  }
}

//If a backend is added later, replace this with a fetch() call
// to GET /api/transactions/summary?month=YYYY-MM&total=1, keeping the same
// return shape. Expense-only, so Income entries don't mask how much was
// actually spent — see getMonthlyIncome for the income-side figure.
// Stage 16a: excludeFromBudget transactions are always left out here —
// this function backs the Dashboard/Budget screens, which have no
// "include excluded" toggle at all (that's a Reports-only concept). A
// transaction marked excludeFromBudget still exists and still shows up
// in History; it just never contributes to what "spent this month" means.
// Currency-scoped since Stage 21b — this used to sum every transaction's
// amount regardless of currency (an expense entered in USD would silently
// deduct from an LKR budget, arithmetically nonsensical since the two
// numbers aren't the same unit). Every caller must now say which
// currency's budget it's asking about.
export async function getMonthlyTotal(
  month: string,
  currencyId: number,
): Promise<number> {
  try {
    const [row] = await db
      .select({ total: sql<number>`sum(${transactions.amount})` })
      .from(transactions)
      .where(
        and(
          like(transactions.date, `${month}%`),
          eq(transactions.entryType, 'Expense'),
          eq(transactions.currencyId, currencyId),
          eq(transactions.excludeFromBudget, false),
        ),
      );
    return row?.total ?? 0;
  } catch (error) {
    console.error(
      `getMonthlyTotal: failed to sum expenses for month=${month} currency id=${currencyId}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/transactions/summary?month=YYYY-MM&total=1&entryType=Income,
// keeping the same return shape. Mirrors getMonthlyTotal but for Income —
// same Stage 16a excludeFromBudget exclusion, same reasoning.
export async function getMonthlyIncome(
  month: string,
  currencyId: number,
): Promise<number> {
  try {
    const [row] = await db
      .select({ total: sql<number>`sum(${transactions.amount})` })
      .from(transactions)
      .where(
        and(
          like(transactions.date, `${month}%`),
          eq(transactions.entryType, 'Income'),
          eq(transactions.currencyId, currencyId),
          eq(transactions.excludeFromBudget, false),
        ),
      );
    return row?.total ?? 0;
  } catch (error) {
    console.error(
      `getMonthlyIncome: failed to sum income for month=${month} currency id=${currencyId}`,
      error,
    );
    throw error;
  }
}

//If a backend is added later, replace this with a fetch() call
// to GET /api/transactions/:id, keeping the same return type.
export async function getTransactionById(
  id: number,
): Promise<Transaction | null> {
  const [row] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, id))
    .limit(1);
  return row ?? null;
}

// If a backend is added later, replace this with fetch(PATCH
// /api/transactions/:id), keeping the same input/return shape. There's no
// "reverse the old effect, apply the new one" step here — unlike a stored
// running-total balance, this app's balance is recomputed from scratch on
// every read (getAccountBalance -> getNetSpentForAccount), so editing this
// row is itself the entire update: the next read just nets a different
// set of transactions and gets the right answer for free, through the
// same getBalanceDelta direction logic as everything else.
//
// Same checks as addTransaction, applied to the row as it will be after
// the edit. The balance check runs on the account the edited entry will
// take money from, measured before and after the update inside one
// transaction — so it only asks the account to cover what the edit ADDS:
// lowering an expense, or leaving it as it was, always saves.
//
// An account or currency that has since been closed or turned off is
// accepted when the edit keeps it unchanged; old history stays editable.
export async function updateTransaction(
  id: number,
  data: Partial<NewTransaction>,
) {
  const { tagIds, ...changes } = data;
  try {
    const original = await getTransactionById(id);
    if (!original) {
      throw validationError(
        'That transaction no longer exists — it may have been deleted.',
      );
    }
    const next = { ...original, ...changes };
    requirePositiveAmount(next.amount);
    if (next.entryType === 'Expense' && next.categoryId == null) {
      throw validationError('Choose a category', 'categoryId');
    }
    await requireMoneyAccount(db, {
      accountId: next.accountId,
      currencyId: next.currencyId,
      requireActive:
        next.accountId !== original.accountId ||
        next.currencyId !== original.currencyId,
    });
    return await db.transaction(async tx => {
      const update = () =>
        tx
          .update(transactions)
          .set(changes)
          .where(eq(transactions.id, id))
          .returning();
      const updated =
        next.entryType === 'Expense' ? await update() : await update();
      if (tagIds) {
        await setTransactionTagsWithin(tx, id, tagIds);
      }
      return updated;
    });
  } catch (error) {
    console.error(
      `updateTransaction: failed to update transaction id=${id}`,
      data,
      error,
    );
    throw error;
  }
}

// If a backend is added later, replace this with fetch(DELETE
// /api/transactions/:id), keeping the same return shape. Same reasoning
// as updateTransaction above — deleting the row removes its effect from
// the next getNetSpentForAccount computation automatically, since nothing
// about the balance is ever stored per-transaction.
export async function deleteTransaction(id: number) {
  return db.delete(transactions).where(eq(transactions.id, id)).returning();
}

// NETWORK-READY: If a backend is added later, replace this with
// fetch(DELETE /api/history/transactions/:id), keeping the same
// behavior. THE one delete History should ever call for a transaction
// row, because a transaction row in History is not always just a
// transaction.
//
// Three kinds of row reach this function and each has to be unwound its
// own way:
//   * an installment payment — also a slot in a plan, so removing it has
//     to free that slot and reopen the month's reminder;
//   * a confirmed recurring occurrence — also a month in a schedule, so
//     removing it has to send that month back to pending;
//   * everything else — an ordinary expense or income, deleted outright.
//
// Deleting the bare transactions row in the first two cases is the bug
// this prevents: the plan or the schedule would go on claiming the month
// was handled, pointing at money that no longer exists, with no way back.
// Dispatching here rather than in the UI means every future caller gets
// that for free, and the three undos cannot drift apart.
//
// Imported lazily for the same reason deleteContribution imports
// deleteTransfer that way: both modules write to tables this one owns,
// so resolving them at call time keeps the module graph one-directional
// at load.
export async function deleteHistoryTransaction(id: number): Promise<void> {
  try {
    const { unpayInstallmentByTransaction } = await import('./installments');
    if (await unpayInstallmentByTransaction(id)) {
      return;
    }
    const { unconfirmOccurrenceByTransaction } = await import('./recurring');
    if (await unconfirmOccurrenceByTransaction(id)) {
      return;
    }
    await deleteTransaction(id);
  } catch (error) {
    console.error(
      `deleteHistoryTransaction: failed to delete transaction id=${id}`,
      error,
    );
    throw error;
  }
}
