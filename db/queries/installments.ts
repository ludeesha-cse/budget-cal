import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../index';
import {
  accounts,
  categories,
  currencies,
  installmentPayments,
  installmentPlans,
  transactions,
} from '../schema';
import {
  getCurrentDateString,
  getNextOccurrenceDate,
} from '../../utils/date';
import { calculateFromMonthly, calculateFromPrincipal } from '../../utils/installmentMath';

type InstallmentPlan = typeof installmentPlans.$inferSelect;

// Mode A (principal + rate) and Mode B (a known flat monthly amount)
// share every field except how the schedule is derived — a tagged union
// keeps the two call shapes from being confused with each other (e.g.
// passing a rate that gets silently ignored in Mode B).
export type NewInstallmentPlanParams = {
  name: string;
  numberOfMonths: number;
  categoryId: number;
  currencyId: number;
  startDate: string; // 'YYYY-MM-DD'
  // 1-31, optional — no due day set means this plan never surfaces as a
  // Dashboard reminder (see getInstallmentReminders). Same
  // clamp-to-shorter-month convention as recurring_rules.dayOfMonth.
  dueDayOfMonth?: number | null;
} & (
  | { mode: 'principal'; principalAmount: number; interestRate: number }
  | { mode: 'monthly'; monthlyAmount: number }
);

function scheduleForInstallmentPlan(params: NewInstallmentPlanParams) {
  return params.mode === 'principal'
    ? calculateFromPrincipal(
        params.principalAmount,
        params.interestRate,
        params.numberOfMonths,
      )
    : calculateFromMonthly(params.monthlyAmount, params.numberOfMonths);
}

// Real check as of Stage 12b — installment_payments now exists, so
// updateInstallmentPlan and deleteInstallmentPlan's "reject if payments
// exist" guard actually enforces something. Both call sites were already
// written against this exact function in Stage 12a, so neither needed to
// change; only this implementation did.
async function installmentPlanHasPayments(planId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: installmentPayments.id })
    .from(installmentPayments)
    .where(eq(installmentPayments.installmentPlanId, planId))
    .limit(1);
  return row != null;
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/installment-plans), keeping the same input/return shape. Computes
// the schedule once via utils/installmentMath.ts and stores every
// resulting number — see installment_plans' schema comment for why that
// beats recomputing on every read. Creates NO transaction and changes NO
// account balance: Stage 12a is schedule-only, nothing has been paid yet.
export async function createInstallmentPlan(
  params: NewInstallmentPlanParams,
): Promise<InstallmentPlan> {
  try {
    if (!params.name.trim()) {
      throw new Error('A name is required for the installment plan.');
    }
    if (!Number.isInteger(params.numberOfMonths) || params.numberOfMonths <= 0) {
      throw new Error('Number of months must be a whole number greater than zero.');
    }
    if (
      params.dueDayOfMonth != null &&
      (!Number.isInteger(params.dueDayOfMonth) ||
        params.dueDayOfMonth < 1 ||
        params.dueDayOfMonth > 31)
    ) {
      throw new Error('Due date must be a day between 1 and 31.');
    }
    const schedule = scheduleForInstallmentPlan(params);
    const [plan] = await db
      .insert(installmentPlans)
      .values({
        name: params.name.trim(),
        principalAmount:
          params.mode === 'principal' ? params.principalAmount : null,
        interestRate: params.mode === 'principal' ? params.interestRate : null,
        numberOfMonths: params.numberOfMonths,
        monthlyAmount: schedule.monthlyAmount,
        finalInstallmentAmount: schedule.finalInstallmentAmount,
        totalRepayable: schedule.totalRepayable,
        categoryId: params.categoryId,
        currencyId: params.currencyId,
        startDate: params.startDate,
        dueDayOfMonth: params.dueDayOfMonth ?? null,
        createdAt: Date.now(),
      })
      .returning();
    return plan;
  } catch (error) {
    console.error(
      'createInstallmentPlan: failed to create installment plan',
      params,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/installment-plans, keeping the same return shape.
// "Paid 0 of N" (Stage 12a always shows 0 — payment tracking is Stage
// 12b) is computed by the screen from numberOfMonths, not stored here.
export async function getInstallmentPlans() {
  try {
    return await db
      .select({
        id: installmentPlans.id,
        name: installmentPlans.name,
        principalAmount: installmentPlans.principalAmount,
        interestRate: installmentPlans.interestRate,
        numberOfMonths: installmentPlans.numberOfMonths,
        monthlyAmount: installmentPlans.monthlyAmount,
        finalInstallmentAmount: installmentPlans.finalInstallmentAmount,
        totalRepayable: installmentPlans.totalRepayable,
        categoryId: installmentPlans.categoryId,
        categoryName: categories.name,
        currencyId: installmentPlans.currencyId,
        currencyCode: currencies.code,
        startDate: installmentPlans.startDate,
        dueDayOfMonth: installmentPlans.dueDayOfMonth,
        createdAt: installmentPlans.createdAt,
      })
      .from(installmentPlans)
      .innerJoin(categories, eq(installmentPlans.categoryId, categories.id))
      .innerJoin(currencies, eq(installmentPlans.currencyId, currencies.id))
      .orderBy(desc(installmentPlans.createdAt));
  } catch (error) {
    console.error(
      'getInstallmentPlans: failed to load installment plans',
      error,
    );
    throw error;
  }
}

export type InstallmentReminderRow = {
  id: number;
  name: string;
  currencyCode: string;
  nextInstallmentNumber: number;
  numberOfMonths: number;
  nextAmountDue: number;
  nextDueDate: string; // 'YYYY-MM-DD'
};

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/installment-plans/reminders, keeping the same return
// shape. Dashboard-facing — only plans with a dueDayOfMonth set AND not
// yet fully paid ever show up here; the "within N days" cutoff itself is
// left to the caller (DashboardScreen), same as upcomingLoans' own
// daysUntil filtering, so both reminder types share one filtering
// convention instead of each baking its own window into the query layer.
//
// Fetches every installment_payments row in one query and counts paid
// installments per plan in JS rather than a SQL GROUP BY — same
// "plan/payment counts are small in a personal tracker" reasoning
// InstallmentPlansScreen's own load() already leans on.
export async function getInstallmentReminders(): Promise<
  InstallmentReminderRow[]
> {
  try {
    const plans = await db
      .select({
        id: installmentPlans.id,
        name: installmentPlans.name,
        numberOfMonths: installmentPlans.numberOfMonths,
        monthlyAmount: installmentPlans.monthlyAmount,
        finalInstallmentAmount: installmentPlans.finalInstallmentAmount,
        dueDayOfMonth: installmentPlans.dueDayOfMonth,
        currencyCode: currencies.code,
      })
      .from(installmentPlans)
      .innerJoin(currencies, eq(installmentPlans.currencyId, currencies.id));

    const plansWithDueDate = plans.filter(
      (plan): plan is typeof plan & { dueDayOfMonth: number } =>
        plan.dueDayOfMonth != null,
    );
    if (plansWithDueDate.length === 0) {
      return [];
    }

    const allPayments = await db
      .select({ installmentPlanId: installmentPayments.installmentPlanId })
      .from(installmentPayments);
    const paidCountByPlan = new Map<number, number>();
    for (const payment of allPayments) {
      paidCountByPlan.set(
        payment.installmentPlanId,
        (paidCountByPlan.get(payment.installmentPlanId) ?? 0) + 1,
      );
    }

    const today = getCurrentDateString();
    const reminders: InstallmentReminderRow[] = [];
    for (const plan of plansWithDueDate) {
      const paidCount = paidCountByPlan.get(plan.id) ?? 0;
      if (paidCount >= plan.numberOfMonths) {
        continue;
      }
      const nextInstallmentNumber = paidCount + 1;
      const nextAmountDue =
        nextInstallmentNumber === plan.numberOfMonths
          ? plan.finalInstallmentAmount
          : plan.monthlyAmount;
      reminders.push({
        id: plan.id,
        name: plan.name,
        currencyCode: plan.currencyCode,
        nextInstallmentNumber,
        numberOfMonths: plan.numberOfMonths,
        nextAmountDue,
        nextDueDate: getNextOccurrenceDate(plan.dueDayOfMonth, today),
      });
    }
    return reminders;
  } catch (error) {
    console.error(
      'getInstallmentReminders: failed to load installment reminders',
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(PATCH
// /api/installment-plans/:id), keeping the same input/return shape.
// Recomputes the whole schedule from the new inputs — exactly like
// createInstallmentPlan — but only once installmentPlanHasPayments
// confirms nothing has been paid against this plan yet. Editing a
// schedule that already has recorded payments against the OLD schedule
// would silently corrupt whatever "remaining balance" Stage 12b computes
// from it, so this rejects instead of guessing how to reconcile the two.
export async function updateInstallmentPlan(
  id: number,
  params: NewInstallmentPlanParams,
): Promise<void> {
  try {
    const hasPayments = await installmentPlanHasPayments(id);
    if (hasPayments) {
      throw new Error(
        'This plan already has recorded payments — delete and recreate it instead of editing the schedule.',
      );
    }
    if (!params.name.trim()) {
      throw new Error('A name is required for the installment plan.');
    }
    if (!Number.isInteger(params.numberOfMonths) || params.numberOfMonths <= 0) {
      throw new Error('Number of months must be a whole number greater than zero.');
    }
    if (
      params.dueDayOfMonth != null &&
      (!Number.isInteger(params.dueDayOfMonth) ||
        params.dueDayOfMonth < 1 ||
        params.dueDayOfMonth > 31)
    ) {
      throw new Error('Due date must be a day between 1 and 31.');
    }
    const schedule = scheduleForInstallmentPlan(params);
    await db
      .update(installmentPlans)
      .set({
        name: params.name.trim(),
        principalAmount:
          params.mode === 'principal' ? params.principalAmount : null,
        interestRate: params.mode === 'principal' ? params.interestRate : null,
        numberOfMonths: params.numberOfMonths,
        monthlyAmount: schedule.monthlyAmount,
        finalInstallmentAmount: schedule.finalInstallmentAmount,
        totalRepayable: schedule.totalRepayable,
        categoryId: params.categoryId,
        currencyId: params.currencyId,
        startDate: params.startDate,
        dueDayOfMonth: params.dueDayOfMonth ?? null,
      })
      .where(eq(installmentPlans.id, id));
  } catch (error) {
    console.error(
      `updateInstallmentPlan: failed to update installment plan id=${id}`,
      params,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(DELETE
// /api/installment-plans/:id), keeping the same return shape. Rejects if
// any installment has ever been paid against this plan — deleting it
// would orphan those installment_payments rows (and the real
// transactions they point to) with no plan left to explain what they
// were for.
export async function deleteInstallmentPlan(id: number): Promise<void> {
  try {
    const hasPayments = await installmentPlanHasPayments(id);
    if (hasPayments) {
      throw new Error(
        'This plan has recorded payments and cannot be deleted.',
      );
    }
    await db.delete(installmentPlans).where(eq(installmentPlans.id, id));
  } catch (error) {
    console.error(
      `deleteInstallmentPlan: failed to delete installment plan id=${id}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/installment-plans/:id/payments, keeping the same
// return shape. amount comes from the linked transaction rather than
// being stored redundantly on installment_payments — that transaction
// row is the single source of truth for what was actually paid.
export async function getInstallmentPayments(planId: number) {
  try {
    return await db
      .select({
        id: installmentPayments.id,
        installmentPlanId: installmentPayments.installmentPlanId,
        installmentNumber: installmentPayments.installmentNumber,
        accountId: installmentPayments.accountId,
        accountName: accounts.name,
        transactionId: installmentPayments.transactionId,
        amount: transactions.amount,
        paidDate: installmentPayments.paidDate,
        createdAt: installmentPayments.createdAt,
      })
      .from(installmentPayments)
      .innerJoin(accounts, eq(installmentPayments.accountId, accounts.id))
      .innerJoin(
        transactions,
        eq(installmentPayments.transactionId, transactions.id),
      )
      .where(eq(installmentPayments.installmentPlanId, planId))
      .orderBy(installmentPayments.installmentNumber);
  } catch (error) {
    console.error(
      `getInstallmentPayments: failed to load payments for plan id=${planId}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/installment-plans/:id/next-unpaid, keeping the same
// return type. Walks 1..numberOfMonths looking for the first number with
// no installment_payments row rather than just counting paid rows and
// adding one — that would give the wrong answer the moment undo ever
// creates a gap-free-but-not-just-a-suffix history (it can't today, since
// unpayInstallment only ever removes the latest one, but this stays
// correct even if that rule ever loosens).
export async function getNextUnpaidInstallmentNumber(
  planId: number,
): Promise<number | null> {
  try {
    const [plan] = await db
      .select()
      .from(installmentPlans)
      .where(eq(installmentPlans.id, planId))
      .limit(1);
    if (!plan) {
      throw new Error('That installment plan no longer exists.');
    }
    const paidRows = await db
      .select({ installmentNumber: installmentPayments.installmentNumber })
      .from(installmentPayments)
      .where(eq(installmentPayments.installmentPlanId, planId));
    const paidNumbers = new Set(paidRows.map(row => row.installmentNumber));
    for (let n = 1; n <= plan.numberOfMonths; n++) {
      if (!paidNumbers.has(n)) {
        return n;
      }
    }
    return null;
  } catch (error) {
    console.error(
      `getNextUnpaidInstallmentNumber: failed to compute next unpaid installment for plan id=${planId}`,
      error,
    );
    throw error;
  }
}

export type PayInstallmentParams = {
  planId: number;
  accountId: number;
  date: string; // 'YYYY-MM-DD'
};

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/installment-plans/:id/payments), keeping the same input/return
// shape.
//
// Unlike creditCardPayoffs/transfers/loanPayments, an installment payment
// IS genuine spending — it needs to show up in History and count toward
// its category's budget the same as any ordinary Expense — so this
// inserts a REAL `transactions` row (entryType 'Expense') rather than
// shifting a stored baseline directly the way those other three do.
// Because every account balance is always derived from the transactions
// table (see getAccountBalance / getNetSpentForAccount), that single
// insert IS the entire balance effect: there's no second write to
// account_balances to keep in sync. That's also why paying with a
// CreditCard account correctly increases its debt with no
// installment-specific code for it at all — it goes through the exact
// same getBalanceDelta-based derivation Stage 10a already built for
// every ordinary Expense transaction.
export async function payInstallment(
  params: PayInstallmentParams,
): Promise<void> {
  try {
    const [plan] = await db
      .select()
      .from(installmentPlans)
      .where(eq(installmentPlans.id, params.planId))
      .limit(1);
    if (!plan) {
      throw new Error('That installment plan no longer exists.');
    }
    const nextInstallmentNumber = await getNextUnpaidInstallmentNumber(
      params.planId,
    );
    if (nextInstallmentNumber === null) {
      throw new Error('This plan is already fully paid.');
    }
    // Every installment is the plan's flat monthlyAmount EXCEPT the very
    // last one, which absorbs the rounding remainder — see
    // utils/installmentMath.ts's invariant comment for why that split
    // exists at all.
    const amount =
      nextInstallmentNumber === plan.numberOfMonths
        ? plan.finalInstallmentAmount
        : plan.monthlyAmount;
    const description = `${plan.name} — ${nextInstallmentNumber} of ${plan.numberOfMonths}`;

    await db.transaction(async tx => {
      const [transaction] = await tx
        .insert(transactions)
        .values({
          accountId: params.accountId,
          amount,
          categoryId: plan.categoryId,
          description,
          date: params.date,
          currencyId: plan.currencyId,
          entryType: 'Expense',
          createdAt: Date.now(),
        })
        .returning();
      await tx.insert(installmentPayments).values({
        installmentPlanId: params.planId,
        installmentNumber: nextInstallmentNumber,
        accountId: params.accountId,
        transactionId: transaction.id,
        paidDate: params.date,
        createdAt: Date.now(),
      });
    });
  } catch (error) {
    console.error(
      `payInstallment: failed to pay next installment for plan id=${params.planId}`,
      params,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(DELETE
// /api/installment-payments/:id), keeping the same input/return shape.
//
// Only the MOST RECENT payment for a plan may be undone. Installment
// numbers are meant to stay a gapless 1..N prefix of "paid so far" (the
// plan_installment_unique index only stops the same number being paid
// twice, not a gap from opening up) — deleting an EARLIER payment out of
// order would leave one, e.g. installment 3 gone while 4 and 5 are still
// paid, and there's no sane answer for what
// getNextUnpaidInstallmentNumber should do with that: is 3 "next due"
// again, ahead of the already-paid 4 and 5? Restricting undo to the
// latest payment keeps the paid set always a clean prefix, so that
// question never comes up.
export async function unpayInstallment(paymentId: number): Promise<void> {
  try {
    const [payment] = await db
      .select()
      .from(installmentPayments)
      .where(eq(installmentPayments.id, paymentId))
      .limit(1);
    if (!payment) {
      throw new Error('That payment no longer exists.');
    }
    const [latest] = await db
      .select()
      .from(installmentPayments)
      .where(
        eq(installmentPayments.installmentPlanId, payment.installmentPlanId),
      )
      .orderBy(desc(installmentPayments.installmentNumber))
      .limit(1);
    if (!latest || latest.id !== payment.id) {
      throw new Error(
        'Only the most recent payment for this plan can be undone. Undo later payments first.',
      );
    }
    await db.transaction(async tx => {
      // Deleting the transaction row IS the balance reversal — balances
      // are always derived from the transactions table, so removing this
      // row takes its effect out of that computation on the very next
      // read, exactly the way deleteTransaction works for any other
      // transaction.
      await tx
        .delete(transactions)
        .where(eq(transactions.id, payment.transactionId));
      await tx
        .delete(installmentPayments)
        .where(eq(installmentPayments.id, paymentId));
    });
  } catch (error) {
    console.error(
      `unpayInstallment: failed to undo payment id=${paymentId}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/installment-plans/remaining-balance?currencyId=,
// keeping the same return type. Used by net worth (utils/netWorth.ts).
// Sums, across every plan in this currency, totalRepayable minus what's
// actually been paid so far — the paid amount is read from the linked
// transactions' amounts rather than trusting
// installmentNumber * monthlyAmount, since the final installment is a
// different amount and this needs to stay correct however many
// installments have been paid or undone.
export async function getRemainingInstallmentBalance(
  currencyId: number,
): Promise<number> {
  try {
    const plans = await db
      .select()
      .from(installmentPlans)
      .where(eq(installmentPlans.currencyId, currencyId));
    let remaining = 0;
    for (const plan of plans) {
      const [paidRow] = await db
        .select({
          total: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
        })
        .from(installmentPayments)
        .innerJoin(
          transactions,
          eq(installmentPayments.transactionId, transactions.id),
        )
        .where(eq(installmentPayments.installmentPlanId, plan.id));
      const paid = paidRow?.total ?? 0;
      remaining += plan.totalRepayable - paid;
    }
    return remaining;
  } catch (error) {
    console.error(
      `getRemainingInstallmentBalance: failed to compute remaining installment balance for currency id=${currencyId}`,
      error,
    );
    throw error;
  }
}

