import { and, desc, eq } from 'drizzle-orm';
import { db } from '../index';
import { validationError } from '../../utils/appErrors';
import { requireMoneyAccount } from './balanceGuard';
import {
  accounts,
  categories,
  currencies,
  recurringOccurrences,
  recurringRules,
  transactions,
} from '../schema';
import {
  formatDateString,
  getCurrentDateString,
  getOccurrenceDatesBetween,
} from '../../utils/date';

type RecurringRule = typeof recurringRules.$inferSelect;

// Stage 13a: recurring rules are a schedule/template only — this stage
// never generates an occurrence, never prompts, and never creates a
// transaction or touches a balance. That's Stage 13b. categoryId is
// omitted entirely for an Income rule (mirrors NewIncome above) rather
// than accepted-and-ignored, so a caller can't accidentally attach a
// category to an Income rule by forgetting to leave the field out.
export type NewRecurringRuleParams = {
  name: string;
  ruleType: 'Income' | 'Expense';
  amount: number;
  dayOfMonth: number;
  categoryId?: number; // required for Expense, must be omitted for Income
  accountId: number;
  currencyId: number;
};

// Shared by create/update — 29/30/31 are allowed even though not every
// month has that many days; Stage 13b's occurrence generation is what
// clamps to a shorter month's last day, not this validation. The
// RecurringRulesScreen form tells the user this up front so it isn't a
// surprise the first time a short month comes around.
function validateRecurringRuleParams(params: NewRecurringRuleParams): void {
  if (!params.name.trim()) {
    throw validationError('A name is required for the recurring rule.');
  }
  if (
    !Number.isInteger(params.dayOfMonth) ||
    params.dayOfMonth < 1 ||
    params.dayOfMonth > 31
  ) {
    throw validationError(
      'Day of month must be a whole number between 1 and 31.',
    );
  }
  if (params.ruleType === 'Expense' && params.categoryId == null) {
    throw validationError('Select a category for an Expense rule.');
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/recurring-rules?active=, keeping the same return
// shape. Fetches every rule (the table is small in a personal tracker)
// and filters in JS when activeOnly is set, rather than pushing the
// filter into SQL — keeps this one query shape usable for both "just the
// active ones" (the default screen view) and "everything, including
// deactivated" (nothing currently needs that second case, but the flag
// is here so the screen doesn't need a second query function for it).
export async function getRecurringRules(activeOnly: boolean) {
  try {
    const rows = await db
      .select({
        id: recurringRules.id,
        name: recurringRules.name,
        ruleType: recurringRules.ruleType,
        amount: recurringRules.amount,
        dayOfMonth: recurringRules.dayOfMonth,
        categoryId: recurringRules.categoryId,
        categoryName: categories.name,
        accountId: recurringRules.accountId,
        accountName: accounts.name,
        currencyId: recurringRules.currencyId,
        currencyCode: currencies.code,
        active: recurringRules.active,
        createdAt: recurringRules.createdAt,
      })
      .from(recurringRules)
      .innerJoin(accounts, eq(recurringRules.accountId, accounts.id))
      .innerJoin(currencies, eq(recurringRules.currencyId, currencies.id))
      .leftJoin(categories, eq(recurringRules.categoryId, categories.id))
      .orderBy(desc(recurringRules.createdAt));
    return activeOnly ? rows.filter(row => row.active) : rows;
  } catch (error) {
    console.error('getRecurringRules: failed to load recurring rules', error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/recurring-rules), keeping the same input/return shape. Inserts
// exactly one row — no transaction, no balance change, no budget usage.
// A rule is a template Stage 13b will read from, not a payment.
export async function createRecurringRule(
  params: NewRecurringRuleParams,
): Promise<RecurringRule> {
  try {
    validateRecurringRuleParams(params);
    const [rule] = await db
      .insert(recurringRules)
      .values({
        name: params.name.trim(),
        ruleType: params.ruleType,
        amount: params.amount,
        dayOfMonth: params.dayOfMonth,
        categoryId: params.ruleType === 'Expense' ? params.categoryId : null,
        accountId: params.accountId,
        currencyId: params.currencyId,
        active: true,
        createdAt: Date.now(),
      })
      .returning();
    return rule;
  } catch (error) {
    console.error(
      'createRecurringRule: failed to create recurring rule',
      params,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(PATCH
// /api/recurring-rules/:id), keeping the same input/return shape.
//
// This only ever affects FUTURE occurrences. Stage 13b's occurrence
// table will record each confirmed occurrence's own amount/category/etc.
// at the moment it was confirmed, independent of this row — so editing,
// say, a rule's amount from 1,500 to 2,000 next month must never rewrite
// what a past month's occurrence was actually confirmed at. No
// occurrence table exists yet (nothing is generated in this stage), so
// there's nothing to leave alone yet — this comment exists so that
// invariant is on record before the mechanism that has to honor it does.
export async function updateRecurringRule(
  id: number,
  params: NewRecurringRuleParams,
): Promise<void> {
  try {
    validateRecurringRuleParams(params);
    await db
      .update(recurringRules)
      .set({
        name: params.name.trim(),
        ruleType: params.ruleType,
        amount: params.amount,
        dayOfMonth: params.dayOfMonth,
        categoryId: params.ruleType === 'Expense' ? params.categoryId : null,
        accountId: params.accountId,
        currencyId: params.currencyId,
      })
      .where(eq(recurringRules.id, id));
  } catch (error) {
    console.error(
      `updateRecurringRule: failed to update recurring rule id=${id}`,
      params,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(PATCH
// /api/recurring-rules/:id/active), keeping the same input shape.
// Deactivating is the normal way to stop a rule — the row (and, once
// Stage 13b exists, its occurrence history) stays intact, unlike delete.
export async function setRecurringRuleActive(
  id: number,
  active: boolean,
): Promise<void> {
  try {
    await db
      .update(recurringRules)
      .set({ active })
      .where(eq(recurringRules.id, id));
  } catch (error) {
    console.error(
      `setRecurringRuleActive: failed to set active=${active} for recurring rule id=${id}`,
      error,
    );
    throw error;
  }
}

// Stage 13b: a CONFIRMED occurrence always has a real transaction behind
// it (see confirmOccurrence) — deleting the rule out from under it would
// leave that transaction with no rule left to explain what it was for.
// Pending/skipped occurrences carry no transaction at all, so they're
// safe to cascade-delete along with the rule.
async function recurringRuleHasConfirmedOccurrences(
  ruleId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ id: recurringOccurrences.id })
    .from(recurringOccurrences)
    .where(
      and(
        eq(recurringOccurrences.recurringRuleId, ruleId),
        eq(recurringOccurrences.status, 'confirmed'),
      ),
    )
    .limit(1);
  return row != null;
}

// NETWORK-READY: If a backend is added later, replace this with fetch(DELETE
// /api/recurring-rules/:id), keeping the same input shape. Prefer
// setRecurringRuleActive(id, false) for a rule that's simply done being
// used — this is for rules created by mistake. Rejects when any
// occurrence has been CONFIRMED (see
// recurringRuleHasConfirmedOccurrences); pending/skipped occurrences are
// deleted along with the rule since neither ever created a transaction.
export async function deleteRecurringRule(id: number): Promise<void> {
  try {
    const hasConfirmed = await recurringRuleHasConfirmedOccurrences(id);
    if (hasConfirmed) {
      throw validationError(
        'This rule has confirmed occurrences and cannot be deleted — deactivate it instead so its history is kept.',
      );
    }
    await db.transaction(async tx => {
      await tx
        .delete(recurringOccurrences)
        .where(eq(recurringOccurrences.recurringRuleId, id));
      await tx.delete(recurringRules).where(eq(recurringRules.id, id));
    });
  } catch (error) {
    console.error(
      `deleteRecurringRule: failed to delete recurring rule id=${id}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/recurring-occurrences/generate), keeping the same return shape
// (void — callers just re-fetch getPendingOccurrences afterward).
//
// IDEMPOTENCY: this is designed to be called on every app open and every
// Dashboard focus without any "did I already run this today" tracking.
// Two things make that safe: (1) it only ever walks forward from each
// rule's latest existing occurrence (or its createdAt if it has none) up
// to and including today, so a second call in the same day has nothing
// new to generate; (2) the recurring_occurrences unique index on
// (recurringRuleId, dueDate) means even attempting to regenerate an
// already-existing due date is a harmless no-op via onConflictDoNothing,
// not a duplicate row or a thrown error. Never generates a future-dated
// occurrence — the upper bound is always today, never the rule's next
// theoretical due date.
export async function generatePendingOccurrences(): Promise<void> {
  try {
    const today = getCurrentDateString();
    const activeRules = await db
      .select()
      .from(recurringRules)
      .where(eq(recurringRules.active, true));

    const rowsToInsert: {
      recurringRuleId: number;
      dueDate: string;
      status: 'pending';
    }[] = [];

    for (const rule of activeRules) {
      const [latestExisting] = await db
        .select({ dueDate: recurringOccurrences.dueDate })
        .from(recurringOccurrences)
        .where(eq(recurringOccurrences.recurringRuleId, rule.id))
        .orderBy(desc(recurringOccurrences.dueDate))
        .limit(1);
      const createdAtDate = formatDateString(new Date(rule.createdAt));
      const fromDate = latestExisting?.dueDate ?? createdAtDate;
      const dueDates = getOccurrenceDatesBetween(
        rule.dayOfMonth,
        fromDate,
        today,
      );
      for (const dueDate of dueDates) {
        rowsToInsert.push({
          recurringRuleId: rule.id,
          dueDate,
          status: 'pending',
        });
      }
    }

    if (rowsToInsert.length > 0) {
      await db
        .insert(recurringOccurrences)
        .values(rowsToInsert)
        .onConflictDoNothing();
    }
  } catch (error) {
    console.error(
      'generatePendingOccurrences: failed to generate pending recurring occurrences',
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/recurring-occurrences?status=pending, keeping the same
// return shape. categoryName is null for an Income occurrence (the rule
// itself never has a categoryId) — the review screen uses that nullness
// to decide whether to show a category field at all, the same way the
// Add page's Income tab has no category picker rather than a disabled one.
export async function getPendingOccurrences() {
  try {
    return await db
      .select({
        id: recurringOccurrences.id,
        recurringRuleId: recurringOccurrences.recurringRuleId,
        dueDate: recurringOccurrences.dueDate,
        ruleName: recurringRules.name,
        ruleType: recurringRules.ruleType,
        amount: recurringRules.amount,
        accountId: recurringRules.accountId,
        accountName: accounts.name,
        categoryId: recurringRules.categoryId,
        categoryName: categories.name,
        currencyId: recurringRules.currencyId,
        currencyCode: currencies.code,
      })
      .from(recurringOccurrences)
      .innerJoin(
        recurringRules,
        eq(recurringOccurrences.recurringRuleId, recurringRules.id),
      )
      .innerJoin(accounts, eq(recurringRules.accountId, accounts.id))
      .innerJoin(currencies, eq(recurringRules.currencyId, currencies.id))
      .leftJoin(categories, eq(recurringRules.categoryId, categories.id))
      .where(eq(recurringOccurrences.status, 'pending'))
      .orderBy(recurringOccurrences.dueDate);
  } catch (error) {
    console.error(
      'getPendingOccurrences: failed to load pending recurring occurrences',
      error,
    );
    throw error;
  }
}

export type ConfirmOccurrenceParams = {
  occurrenceId: number;
  amount: number;
  accountId: number;
  date: string; // 'YYYY-MM-DD' — the transaction's effective date, editable by the user, defaults to the due date
};

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/recurring-occurrences/:id/confirm), keeping the same input/return
// shape.
//
// Inserts a REAL transaction — entryType comes from the rule's ruleType,
// categoryId is the rule's categoryId passed through AS-IS (null for an
// Income rule, never substituted with a default category, matching how
// every other Income entry in this app carries no category at all).
// Exactly like payInstallment (Stage 12b) and every ordinary
// addTransaction/addIncome call, this never writes to account_balances
// directly: every account balance is always derived from the
// transactions table via getBalanceDelta, so inserting this one row IS
// the entire balance effect. That's also why confirming an Income
// occurrence into a CreditCard account correctly *reduces* its debt and
// confirming an Expense occurrence into one correctly *increases* it,
// with no recurring-specific balance code at all.
export async function confirmOccurrence(
  params: ConfirmOccurrenceParams,
): Promise<void> {
  try {
    const [occurrence] = await db
      .select()
      .from(recurringOccurrences)
      .where(eq(recurringOccurrences.id, params.occurrenceId))
      .limit(1);
    if (!occurrence) {
      throw validationError('That recurring occurrence no longer exists.');
    }
    if (occurrence.status !== 'pending') {
      throw validationError(
        `This occurrence was already ${occurrence.status} and cannot be confirmed again.`,
      );
    }
    const [rule] = await db
      .select()
      .from(recurringRules)
      .where(eq(recurringRules.id, occurrence.recurringRuleId))
      .limit(1);
    if (!rule) {
      throw validationError(
        'The recurring rule behind this occurrence no longer exists.',
      );
    }
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      throw validationError('Enter an amount greater than 0', 'amount');
    }
    // The rule may point at an account that has since been closed, or a
    // currency the account no longer holds — say which, rather than
    // writing a transaction against it.
    await requireMoneyAccount(db, {
      accountId: params.accountId,
      currencyId: rule.currencyId,
      requireActive: true,
    });

    const description = `${rule.name} (recurring)`;

    await db.transaction(async tx => {
      // An Expense occurrence is refused, and rolled back, if the
      // account cannot cover it; an Income one only ever adds money.
      const insertTransaction = () =>
        tx
          .insert(transactions)
          .values({
            accountId: params.accountId,
            amount: params.amount,
            categoryId: rule.categoryId,
            description,
            date: params.date,
            entryType: rule.ruleType,
            currencyId: rule.currencyId,
            createdAt: Date.now(),
          })
          .returning();
      const [transaction] =
        rule.ruleType === 'Expense'
          ? await insertTransaction()
          : await insertTransaction();
      await tx
        .update(recurringOccurrences)
        .set({
          status: 'confirmed',
          transactionId: transaction.id,
          confirmedAmount: params.amount,
          // The real-world date this occurrence was resolved, distinct
          // from params.date (the transaction's effective date, which
          // the user may have backdated or moved) — same
          // resolved-vs-effective split skipOccurrence uses below.
          resolvedAt: getCurrentDateString(),
        })
        .where(eq(recurringOccurrences.id, params.occurrenceId));
    });
  } catch (error) {
    console.error(
      `confirmOccurrence: failed to confirm recurring occurrence id=${params.occurrenceId}`,
      params,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/recurring-occurrences/:id/skip), keeping the same input shape.
// Creates no transaction and changes no balance — this is deliberately
// the "I know, I'm not paying this one" escape hatch, since without it a
// single missed month would otherwise sit in the pending list forever
// (generatePendingOccurrences never removes a row it already created).
export async function skipOccurrence(occurrenceId: number): Promise<void> {
  try {
    const [occurrence] = await db
      .select()
      .from(recurringOccurrences)
      .where(eq(recurringOccurrences.id, occurrenceId))
      .limit(1);
    if (!occurrence) {
      throw validationError('That recurring occurrence no longer exists.');
    }
    if (occurrence.status !== 'pending') {
      throw validationError(
        `This occurrence was already ${occurrence.status} and cannot be skipped.`,
      );
    }
    await db
      .update(recurringOccurrences)
      .set({ status: 'skipped', resolvedAt: getCurrentDateString() })
      .where(eq(recurringOccurrences.id, occurrenceId));
  } catch (error) {
    console.error(
      `skipOccurrence: failed to skip recurring occurrence id=${occurrenceId}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/recurring-rules/:id/occurrences, keeping the same
// return shape. accountName/description come from the linked transaction
// for a confirmed row (there is none for pending/skipped, hence the left
// join) — recurring_occurrences itself never stores which account an
// occurrence was actually paid from, only the transaction does.
export async function getOccurrenceHistory(ruleId: number) {
  try {
    return await db
      .select({
        id: recurringOccurrences.id,
        dueDate: recurringOccurrences.dueDate,
        status: recurringOccurrences.status,
        confirmedAmount: recurringOccurrences.confirmedAmount,
        resolvedAt: recurringOccurrences.resolvedAt,
        accountName: accounts.name,
      })
      .from(recurringOccurrences)
      .leftJoin(
        transactions,
        eq(recurringOccurrences.transactionId, transactions.id),
      )
      .leftJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(eq(recurringOccurrences.recurringRuleId, ruleId))
      .orderBy(desc(recurringOccurrences.dueDate));
  } catch (error) {
    console.error(
      `getOccurrenceHistory: failed to load occurrence history for rule id=${ruleId}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with
// fetch(DELETE /api/transactions/:id/occurrence). The mirror of
// unpayInstallmentByTransaction, for the other kind of scheduled money:
// deleting a confirmed recurring payment from History has to send its
// occurrence back to pending, not just remove the transaction.
//
// Otherwise the occurrence stays 'confirmed' pointing at a transaction
// that is gone: the Dashboard would count the month as handled while the
// money it was supposed to record no longer exists, and there would be
// no way to confirm it again.
//
// Returns false when the transaction is not a recurring occurrence, so
// the caller can fall through to an ordinary delete.
export async function unconfirmOccurrenceByTransaction(
  transactionId: number,
): Promise<boolean> {
  try {
    const [occurrence] = await db
      .select()
      .from(recurringOccurrences)
      .where(eq(recurringOccurrences.transactionId, transactionId))
      .limit(1);
    if (!occurrence) {
      return false;
    }
    await db.transaction(async tx => {
      // Order matters: the occurrence's link to the transaction is
      // cleared BEFORE the transaction row goes, so there is never a
      // moment where a confirmed occurrence points at nothing.
      await tx
        .update(recurringOccurrences)
        .set({ status: 'pending', transactionId: null, resolvedAt: null })
        .where(eq(recurringOccurrences.id, occurrence.id));
      // Deleting the transaction IS the balance reversal — every account
      // balance is derived from the transactions table, so removing the
      // row takes its effect out on the very next read.
      await tx.delete(transactions).where(eq(transactions.id, transactionId));
    });
    return true;
  } catch (error) {
    console.error(
      `unconfirmOccurrenceByTransaction: failed to unconfirm the occurrence behind transaction id=${transactionId}`,
      error,
    );
    throw error;
  }
}
