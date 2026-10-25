import { and, desc, eq, gt, lte, sql } from 'drizzle-orm';
import { db } from '../index';
import { validationError } from '../../utils/appErrors';
import { requireMoneyAccount } from './balanceGuard';
import {
  accounts,
  categories,
  currencies,
  installmentOccurrences,
  installmentPayments,
  installmentPlans,
  transactions,
} from '../schema';
import {
  addDays,
  clampDayToMonth,
  getCurrentDateString,
} from '../../utils/date';
import {
  calculateFromMonthly,
  calculateFromPrincipal,
} from '../../utils/installmentMath';

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
  // 1-31, optional. It is the day of the month this plan's occurrences
  // are anchored to (see occurrenceAnchorDay); a plan with none falls
  // back to the day its startDate lands on, so every plan schedules
  // itself either way. Same clamp-to-shorter-month convention as
  // recurring_rules.dayOfMonth.
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
      throw validationError('A name is required for the installment plan.');
    }
    if (
      !Number.isInteger(params.numberOfMonths) ||
      params.numberOfMonths <= 0
    ) {
      throw validationError(
        'Number of months must be a whole number greater than zero.',
      );
    }
    if (
      params.dueDayOfMonth != null &&
      (!Number.isInteger(params.dueDayOfMonth) ||
        params.dueDayOfMonth < 1 ||
        params.dueDayOfMonth > 31)
    ) {
      throw validationError('Due date must be a day between 1 and 31.');
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

    // Schedule installment 1 and nothing else — see db/schema.ts on
    // installmentOccurrences for why a 12-month plan gets ONE row here
    // rather than twelve.
    //
    // Deliberately non-fatal: the plan itself is already created and is
    // perfectly usable, so failing the whole creation over its reminder
    // row would be the worse outcome — the user would see "could not
    // create plan" for a plan that exists. The specific step is logged
    // loudly instead, and the plan's first Pay will call
    // advanceInstallmentSchedule anyway.
    try {
      await createFirstInstallmentOccurrence(plan.id, params.startDate);
    } catch (error) {
      console.error(
        `createInstallmentPlan: plan id=${plan.id} was created but scheduling its first occurrence failed — it will not appear in the pending list until an installment is paid`,
        error,
      );
    }

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
      throw validationError(
        'This plan already has recorded payments — delete and recreate it instead of editing the schedule.',
      );
    }
    if (!params.name.trim()) {
      throw validationError('A name is required for the installment plan.');
    }
    if (
      !Number.isInteger(params.numberOfMonths) ||
      params.numberOfMonths <= 0
    ) {
      throw validationError(
        'Number of months must be a whole number greater than zero.',
      );
    }
    if (
      params.dueDayOfMonth != null &&
      (!Number.isInteger(params.dueDayOfMonth) ||
        params.dueDayOfMonth < 1 ||
        params.dueDayOfMonth > 31)
    ) {
      throw validationError('Due date must be a day between 1 and 31.');
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
      throw validationError(
        'This plan has recorded payments and cannot be deleted.',
      );
    }
    // A plan with no payments can still own occurrence rows (every plan
    // is created with installment 1 already scheduled, and a skip
    // schedules the next one without paying anything), and those rows
    // point at the plan by foreign key — so they go first, in the same
    // transaction, the same way deleteRecurringRule clears a rule's
    // pending/skipped occurrences before the rule itself.
    await db.transaction(async tx => {
      await tx
        .delete(installmentOccurrences)
        .where(eq(installmentOccurrences.installmentPlanId, id));
      await tx.delete(installmentPlans).where(eq(installmentPlans.id, id));
    });
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
        // Account, amount and date all come from the linked
        // transaction, never from the installment_payments row's own
        // copies. That transaction is the single source of truth for
        // what actually moved, and a custom-amount payment can now be
        // corrected from History — reading the stored copies here would
        // let this list disagree with the row the user just edited.
        accountId: transactions.accountId,
        accountName: accounts.name,
        transactionId: installmentPayments.transactionId,
        amount: transactions.amount,
        paidDate: transactions.date,
        isCustomAmount: installmentPayments.isCustomAmount,
        createdAt: installmentPayments.createdAt,
      })
      .from(installmentPayments)
      .innerJoin(
        transactions,
        eq(installmentPayments.transactionId, transactions.id),
      )
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
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
      throw validationError('That installment plan no longer exists.');
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

// ---------------------------------------------------------------------------
// Installment occurrence scheduling
//
// An installment plan now schedules itself the same way a recurring rule
// does: one pending row at a time in installment_occurrences, resolved
// by paying or skipping it, with the resolution itself being what
// creates the NEXT month's row. See db/schema.ts on
// installmentOccurrences for why this is lazy (one row) rather than a
// full N-row schedule written at plan creation.
// ---------------------------------------------------------------------------

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/installment-plans/:id/occurrences/first), keeping the same input
// shape. Called exactly once, by createInstallmentPlan — installment 1
// is the only occurrence a brand-new plan has any business having, since
// nothing after it can come due until it is resolved.
//
// onConflictDoNothing rather than a plain insert so that re-running plan
// creation logic (an import, a retry) can never fail on the
// plan_occurrence_unique index — the row either already describes
// installment 1 or it gets created, and both outcomes are correct.
export async function createFirstInstallmentOccurrence(
  planId: number,
  startDate: string,
): Promise<void> {
  try {
    await db
      .insert(installmentOccurrences)
      .values({
        installmentPlanId: planId,
        installmentNumber: 1,
        dueDate: startDate,
        status: 'pending',
      })
      .onConflictDoNothing();
  } catch (error) {
    console.error(
      `createFirstInstallmentOccurrence: failed to schedule installment 1 for plan id=${planId} (startDate=${startDate})`,
      error,
    );
    throw error;
  }
}

export type PendingInstallmentOccurrenceRow = {
  id: number;
  installmentPlanId: number;
  // The SLOT this occurrence occupies in the plan's schedule, and the
  // half of plan_occurrence_unique that keeps the same slot from being
  // scheduled twice. Equal to payableInstallmentNumber below on every
  // plan that has never had an occurrence skipped — which is every plan,
  // until someone skips one.
  installmentNumber: number;
  // The installment number a payment made right now would actually
  // record, i.e. getNextUnpaidInstallmentNumber's answer. This — not the
  // slot — is what the UI shows and what `amount` is derived from,
  // because it is what payInstallment will do. See the type's own note
  // above and the comment in getPendingInstallmentOccurrences for why
  // the two can diverge.
  payableInstallmentNumber: number;
  numberOfMonths: number;
  dueDate: string;
  planName: string;
  amount: number;
  categoryId: number;
  categoryName: string;
  currencyId: number;
  currencyCode: string;
};

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/installment-occurrences?status=pending, keeping the
// same return shape.
//
// Deliberately mirrors getPendingOccurrences() (db/queries/recurring.ts)
// field for field where the two have anything in common — dueDate, a
// display name, an amount, a category and a currency — because
// getPendingScheduledPayments merges both into the one list the
// Dashboard banner counts.
//
// PENDING IS NOT THE SAME AS DUE, and the difference is the whole reason
// this query has a date bound. An installment occurrence is written
// EAGERLY: resolving this month's row immediately creates next month's,
// dated a month out (see advanceInstallmentSchedule). Without the
// `dueDate <= today` filter below, that row would be listed the instant
// it was created — so paying an installment would clear the reminder and
// replace it with next month's in the same breath, and the banner would
// never once read zero.
//
// The recurring half has the same rule enforced a different way:
// generatePendingOccurrences never generates PAST today, so a recurring
// occurrence cannot exist before it is due. Installment occurrences must
// exist early (that is what makes the schedule lazy and self-advancing),
// so the bound belongs here, on the read. A future-dated row stays in
// the table, visible in the plan's Schedule history as Pending — it is
// simply not something to act on yet.
//
// WHY TWO INSTALLMENT NUMBERS: a plan's occurrence SLOTS are unique per
// installment number (plan_occurrence_unique), so a skipped slot can
// never be reused — skipping slot 3 and advancing gives slot 4. But a
// skip records no payment, so the next installment a payment actually
// settles is still 3. Showing the slot number would then tell the user
// they are paying installment 4 while payInstallment records installment
// 3. So the payable number is computed here, from the payments
// themselves, and it is the one the card shows and the one `amount` is
// derived from. On a plan with no skips the two are always identical.
//
// `amount` is computed rather than stored: every installment is the
// plan's flat monthlyAmount EXCEPT the last one, which absorbs the
// rounding remainder (see utils/installmentMath.ts). Deriving it here
// from the payable number is what keeps this figure identical to the one
// payInstallment will actually charge, with no second copy to drift.
//
// Counts payments per plan in JS from one query rather than a SQL GROUP
// BY, the same "plan and payment counts are small in a personal tracker"
// reasoning InstallmentPlansScreen's own figures already lean on.
//
// Both windowed readers below share this one body; only the date bounds
// differ. `earliestExclusive` is exclusive and `latestInclusive`
// inclusive so the two windows tile exactly — an occurrence due today
// belongs to "due now" and never also to "coming up".
async function loadInstallmentOccurrences(
  earliestExclusive: string | null,
  latestInclusive: string,
): Promise<PendingInstallmentOccurrenceRow[]> {
  const rows = await db
    .select({
      id: installmentOccurrences.id,
      installmentPlanId: installmentOccurrences.installmentPlanId,
      installmentNumber: installmentOccurrences.installmentNumber,
      dueDate: installmentOccurrences.dueDate,
      planName: installmentPlans.name,
      numberOfMonths: installmentPlans.numberOfMonths,
      monthlyAmount: installmentPlans.monthlyAmount,
      finalInstallmentAmount: installmentPlans.finalInstallmentAmount,
      categoryId: installmentPlans.categoryId,
      categoryName: categories.name,
      currencyId: installmentPlans.currencyId,
      currencyCode: currencies.code,
    })
    .from(installmentOccurrences)
    .innerJoin(
      installmentPlans,
      eq(installmentOccurrences.installmentPlanId, installmentPlans.id),
    )
    .innerJoin(categories, eq(installmentPlans.categoryId, categories.id))
    .innerJoin(currencies, eq(installmentPlans.currencyId, currencies.id))
    .where(
      and(
        eq(installmentOccurrences.status, 'pending'),
        lte(installmentOccurrences.dueDate, latestInclusive),
        ...(earliestExclusive == null
          ? []
          : [gt(installmentOccurrences.dueDate, earliestExclusive)]),
      ),
    )
    .orderBy(installmentOccurrences.dueDate);

  if (rows.length === 0) {
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

  return (
    rows
      .map(row => {
        // paidCount + 1 is always the next unpaid installment: the paid
        // set is always the contiguous prefix {1..paidCount}, since
        // payInstallment only ever pays the next unpaid number and
        // unpayInstallment only ever removes the latest.
        const payableInstallmentNumber =
          (paidCountByPlan.get(row.installmentPlanId) ?? 0) + 1;
        return {
          id: row.id,
          installmentPlanId: row.installmentPlanId,
          installmentNumber: row.installmentNumber,
          payableInstallmentNumber,
          numberOfMonths: row.numberOfMonths,
          dueDate: row.dueDate,
          planName: row.planName,
          amount:
            payableInstallmentNumber === row.numberOfMonths
              ? row.finalInstallmentAmount
              : row.monthlyAmount,
          categoryId: row.categoryId,
          categoryName: row.categoryName,
          currencyId: row.currencyId,
          currencyCode: row.currencyCode,
        };
      })
      // A fully-paid plan has nothing left to prompt for. Normally it
      // has no pending occurrence either (advanceInstallmentSchedule
      // stops scheduling once getNextUnpaidInstallmentNumber returns
      // null), but a plan paid from the Installment Plans screen while a
      // reminder was already open can get here — and offering "pay" on a
      // finished plan would only produce an error on tap.
      .filter(row => row.payableInstallmentNumber <= row.numberOfMonths)
  );
}

export async function getPendingInstallmentOccurrences(): Promise<
  PendingInstallmentOccurrenceRow[]
> {
  try {
    return await loadInstallmentOccurrences(null, getCurrentDateString());
  } catch (error) {
    console.error(
      'getPendingInstallmentOccurrences: failed to load pending installment occurrences',
      error,
    );
    throw error;
  }
}

// How far ahead the Dashboard's heads-up card looks. Narrower than
// loans' own week-out window on purpose: an installment reminder is
// meant to catch "this is about to come out of your account", per the
// original "within 3 or 4 days" ask.
export const INSTALLMENT_LOOKAHEAD_DAYS = 4;

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/installment-occurrences?status=pending&within=<days>,
// keeping the same return shape.
//
// The NOT-yet-due companion to getPendingInstallmentOccurrences: rows
// whose due date is still ahead but close. This is what the Dashboard's
// "Installment Reminders" card shows, and the two windows are disjoint
// by construction — a plan appears as a heads-up until its due date
// arrives, then in the review banner, never in both at once.
//
// It reads the SAME occurrence rows as the banner rather than
// recomputing a due date from the plan's dueDayOfMonth, which is what
// the old getInstallmentReminders did and why the card could disagree
// with the banner (and keep showing a reminder for an installment that
// had just been paid).
export async function getUpcomingInstallmentOccurrences(): Promise<
  PendingInstallmentOccurrenceRow[]
> {
  try {
    const today = getCurrentDateString();
    return await loadInstallmentOccurrences(
      today,
      addDays(today, INSTALLMENT_LOOKAHEAD_DAYS),
    );
  } catch (error) {
    console.error(
      'getUpcomingInstallmentOccurrences: failed to load upcoming installment occurrences',
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/installment-occurrences/:id/resolve), keeping the same input
// shape. Records that a pending occurrence was PAID, and by which
// installment_payments row — this function moves no money itself and
// creates no payment; payInstallment already did both before calling it.
export async function resolveInstallmentOccurrence(
  occurrenceId: number,
  installmentPaymentId: number,
): Promise<void> {
  try {
    await db
      .update(installmentOccurrences)
      .set({
        status: 'paid',
        installmentPaymentId,
        // The real-world date this occurrence was resolved, deliberately
        // distinct from the payment's own effective date (which the user
        // may have backdated) — the same resolved-vs-effective split
        // recurring_occurrences uses.
        resolvedAt: getCurrentDateString(),
      })
      .where(eq(installmentOccurrences.id, occurrenceId));
  } catch (error) {
    console.error(
      `resolveInstallmentOccurrence: failed to mark occurrence id=${occurrenceId} paid (installmentPaymentId=${installmentPaymentId})`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/installment-occurrences/:id/skip), keeping the same input shape.
// Creates NO payment and moves NO balance — this is the "not this month"
// escape hatch, exactly like skipOccurrence for recurring rules. Note
// the installment itself stays unpaid: skipping dismisses the reminder,
// it does not tick the installment off the plan.
export async function skipInstallmentOccurrence(
  occurrenceId: number,
): Promise<void> {
  try {
    const [occurrence] = await db
      .select()
      .from(installmentOccurrences)
      .where(eq(installmentOccurrences.id, occurrenceId))
      .limit(1);
    if (!occurrence) {
      throw validationError('That installment occurrence no longer exists.');
    }
    if (occurrence.status !== 'pending') {
      throw validationError(
        `This occurrence was already ${occurrence.status} and cannot be skipped.`,
      );
    }
    await db
      .update(installmentOccurrences)
      .set({ status: 'skipped', resolvedAt: getCurrentDateString() })
      .where(eq(installmentOccurrences.id, occurrenceId));
  } catch (error) {
    console.error(
      `skipInstallmentOccurrence: failed to skip installment occurrence id=${occurrenceId}`,
      error,
    );
    throw error;
  }
}

// The day of the month a plan's occurrences are anchored to: its
// explicit dueDayOfMonth when it has one, otherwise the day its
// startDate falls on.
//
// Anchoring on this rather than on the previous occurrence's own day is
// what stops a short month from permanently shortening the schedule: a
// plan due on the 31st that fired on Feb 28 must go back to Mar 31, not
// settle on the 28th forever.
function occurrenceAnchorDay(plan: {
  dueDayOfMonth: number | null;
  startDate: string;
}): number {
  return plan.dueDayOfMonth ?? Number(plan.startDate.split('-')[2]);
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/installment-plans/:id/occurrences/advance), keeping the same
// input shape.
//
// Opens the door to the next month's single occurrence, and is called
// after BOTH resolutions — a payment and a skip alike — because a
// skipped month that did not advance would leave the plan with no
// pending occurrence at all and no way to ever get one.
//
// If getNextUnpaidInstallmentNumber returns null the plan is fully paid,
// and the create step below simply never runs: a finished plan needs no
// "and we're done" branch, it just stops scheduling.
export async function advanceInstallmentSchedule(
  planId: number,
): Promise<void> {
  try {
    const nextInstallmentNumber = await getNextUnpaidInstallmentNumber(planId);
    if (nextInstallmentNumber == null) {
      return;
    }
    const [plan] = await db
      .select()
      .from(installmentPlans)
      .where(eq(installmentPlans.id, planId))
      .limit(1);
    if (!plan) {
      throw validationError('That installment plan no longer exists.');
    }
    // The month to step forward FROM is the latest occurrence this plan
    // already has (paid, skipped or pending), falling back to the plan's
    // start date for a plan whose very first occurrence somehow never
    // got written.
    const [latest] = await db
      .select({ dueDate: installmentOccurrences.dueDate })
      .from(installmentOccurrences)
      .where(eq(installmentOccurrences.installmentPlanId, planId))
      .orderBy(desc(installmentOccurrences.dueDate))
      .limit(1);
    const [baseYear, baseMonth] = (latest?.dueDate ?? plan.startDate)
      .split('-')
      .map(Number);
    const nextMonth = baseMonth === 12 ? 1 : baseMonth + 1;
    const nextYear = baseMonth === 12 ? baseYear + 1 : baseYear;
    const day = clampDayToMonth(nextYear, nextMonth, occurrenceAnchorDay(plan));
    const dueDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(
      day,
    ).padStart(2, '0')}`;

    // Which SLOT the new occurrence takes. Normally this is exactly
    // nextInstallmentNumber — pay installment 3, schedule slot 4 — and
    // the loop below does nothing at all.
    //
    // It matters after a SKIP. Skipping records no payment, so
    // getNextUnpaidInstallmentNumber still answers 3, but slot 3 is
    // already taken by the skipped row and plan_occurrence_unique
    // (rightly) forbids a second one. Without this, advancing after a
    // skip would be a silent no-op and the plan would be left with no
    // pending occurrence and no way to ever get one — the exact "stuck"
    // state a skip is supposed to avoid. So the schedule moves to the
    // first slot this plan has never used. What the user will actually
    // be charged is unaffected: that is still
    // getNextUnpaidInstallmentNumber's answer, which is why
    // getPendingInstallmentOccurrences reports it separately.
    const usedSlots = new Set(
      (
        await db
          .select({
            installmentNumber: installmentOccurrences.installmentNumber,
          })
          .from(installmentOccurrences)
          .where(eq(installmentOccurrences.installmentPlanId, planId))
      ).map(row => row.installmentNumber),
    );
    //
    // The slot number is deliberately NOT capped at numberOfMonths. A
    // skip consumes a slot without paying anything, so a plan with one
    // skip needs one more slot than it has installments — capping it
    // would leave the last installment with no reminder at all, silently,
    // on exactly the plans whose owner has already shown they need
    // reminding. The loop terminates regardless: usedSlots is finite, so
    // the first free number is at most one past the highest used one.
    let slot = nextInstallmentNumber;
    while (usedSlots.has(slot)) {
      slot += 1;
    }

    // onConflictDoNothing as well as the loop above: two resolutions
    // racing (a retried payment, a rapid double-tap) could both pick the
    // same free slot, and the index turning the loser into a no-op is
    // cheaper and safer than a thrown error or a duplicate reminder.
    await db
      .insert(installmentOccurrences)
      .values({
        installmentPlanId: planId,
        installmentNumber: slot,
        dueDate,
        status: 'pending',
      })
      .onConflictDoNothing();
  } catch (error) {
    console.error(
      `advanceInstallmentSchedule: failed to schedule the next occurrence for plan id=${planId}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/installment-plans/:id/occurrences, keeping the same
// return shape. Every occurrence this plan has ever had — paid, skipped
// and still-pending alike — so InstallmentPlansScreen's per-plan history
// can show the schedule the same way RecurringRulesScreen shows a rule's
// occurrence history. Newest first, matching getOccurrenceHistory.
export async function getInstallmentOccurrenceHistory(planId: number) {
  try {
    return await db
      .select({
        id: installmentOccurrences.id,
        installmentNumber: installmentOccurrences.installmentNumber,
        dueDate: installmentOccurrences.dueDate,
        status: installmentOccurrences.status,
        resolvedAt: installmentOccurrences.resolvedAt,
        installmentPaymentId: installmentOccurrences.installmentPaymentId,
        // Null for a pending or skipped row — neither has a payment, and
        // therefore neither has a paying account, hence the left joins.
        //
        // paidInstallmentNumber comes from the PAYMENT, not from the
        // occurrence's own slot number: after a skip those two diverge
        // (see PendingInstallmentOccurrenceRow), and what the history
        // should say is which installment the money actually settled.
        paidInstallmentNumber: installmentPayments.installmentNumber,
        accountName: accounts.name,
        paidAmount: transactions.amount,
      })
      .from(installmentOccurrences)
      .leftJoin(
        installmentPayments,
        eq(installmentOccurrences.installmentPaymentId, installmentPayments.id),
      )
      .leftJoin(accounts, eq(installmentPayments.accountId, accounts.id))
      .leftJoin(
        transactions,
        eq(installmentPayments.transactionId, transactions.id),
      )
      .where(eq(installmentOccurrences.installmentPlanId, planId))
      .orderBy(desc(installmentOccurrences.installmentNumber));
  } catch (error) {
    console.error(
      `getInstallmentOccurrenceHistory: failed to load occurrence history for plan id=${planId}`,
      error,
    );
    throw error;
  }
}

export type PayInstallmentParams = {
  planId: number;
  accountId: number;
  date: string; // 'YYYY-MM-DD'
  // "Pay custom": an amount the user typed instead of the plan's own
  // scheduled figure — paying early, rounding up to clear the plan
  // sooner, or paying part of a month now. It still ticks off the NEXT
  // slot, so the paid set stays the contiguous prefix everything else
  // here relies on (see getNextUnpaidInstallmentNumber); what changes is
  // only how much money moved, and therefore how fast the remaining
  // balance comes down. Omit it for an ordinary scheduled payment.
  customAmount?: number;
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
      throw validationError('That installment plan no longer exists.');
    }
    const nextInstallmentNumber = await getNextUnpaidInstallmentNumber(
      params.planId,
    );
    if (nextInstallmentNumber === null) {
      throw validationError('This plan is already fully paid.');
    }
    // Every installment is the plan's flat monthlyAmount EXCEPT the very
    // last one, which absorbs the rounding remainder — see
    // utils/installmentMath.ts's invariant comment for why that split
    // exists at all.
    const scheduledAmount =
      nextInstallmentNumber === plan.numberOfMonths
        ? plan.finalInstallmentAmount
        : plan.monthlyAmount;
    const isCustomAmount = params.customAmount != null;
    if (isCustomAmount) {
      if (
        !Number.isFinite(params.customAmount) ||
        (params.customAmount as number) <= 0
      ) {
        throw validationError('Enter an amount greater than 0', 'amount');
      }
    }
    // The paying account must exist, be open, and hold the plan's
    // currency — named specifically when it does not.
    await requireMoneyAccount(db, {
      accountId: params.accountId,
      currencyId: plan.currencyId,
      requireActive: true,
    });
    const amount = isCustomAmount
      ? (params.customAmount as number)
      : scheduledAmount;
    const description = `${plan.name} — ${nextInstallmentNumber} of ${plan.numberOfMonths}`;

    // The money-moving half, unchanged: one real transactions row plus
    // the installment_payments row that says which installment it paid.
    // The occurrence bookkeeping below is a SIDE EFFECT of this having
    // succeeded and is deliberately outside this transaction — see its
    // own comment.
    const paymentId = await db.transaction(async tx => {
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
      const [payment] = await tx
        .insert(installmentPayments)
        .values({
          installmentPlanId: params.planId,
          installmentNumber: nextInstallmentNumber,
          accountId: params.accountId,
          transactionId: transaction.id,
          paidDate: params.date,
          isCustomAmount,
          createdAt: Date.now(),
        })
        .returning();
      return payment.id;
    });

    // Occurrence bookkeeping: mark the reminder this payment answered as
    // paid, then open next month's. Both are part of the same payment
    // action, but NOT part of the transaction above, and neither is
    // allowed to fail the payment: the money has already moved and the
    // ledger row already exists, so throwing here would tell the user
    // their payment failed when it plainly did not. What that trades
    // away is silence — each step logs specifically which one broke, so
    // an occurrence table out of sync with a real payment is always
    // visible in the log rather than inferred later from a reminder that
    // will not go away.
    await resolvePaidOccurrence(
      params.planId,
      nextInstallmentNumber,
      paymentId,
    );
  } catch (error) {
    console.error(
      `payInstallment: failed to pay next installment for plan id=${params.planId}`,
      params,
      error,
    );
    throw error;
  }
}

// The three-step occurrence follow-up to a successful payInstallment:
// find the pending row this payment answered, mark it paid and linked,
// then schedule the next one. Split out of payInstallment so the money
// path above reads as one thing and this reads as one thing, and so each
// step can name itself in its own error without nesting three try/catch
// blocks inside the payment function.
//
// Matches on the plan's OPEN occurrence rather than on the installment
// number just paid. A plan has at most one pending occurrence at a time
// by construction — one is created at plan creation and each resolution
// creates exactly one more — so "the pending one" is unambiguous, and it
// is the reminder the user actually acted on. Matching by number instead
// would miss after a skip, where slot and payable number legitimately
// differ (see PendingInstallmentOccurrenceRow), and would strand that
// pending row forever while a second one was scheduled beside it.
//
// A missing pending occurrence is a warning, not an error: a plan whose
// first occurrence failed to be written, or one paid straight from the
// Installment Plans screen twice in a row, is a legitimate way to get
// here with nothing to resolve — and the schedule should still be
// advanced so the plan starts producing reminders again.
async function resolvePaidOccurrence(
  planId: number,
  installmentNumber: number,
  installmentPaymentId: number,
): Promise<void> {
  try {
    const [occurrence] = await db
      .select({ id: installmentOccurrences.id })
      .from(installmentOccurrences)
      .where(
        and(
          eq(installmentOccurrences.installmentPlanId, planId),
          eq(installmentOccurrences.status, 'pending'),
        ),
      )
      .orderBy(installmentOccurrences.installmentNumber)
      .limit(1);
    if (!occurrence) {
      console.warn(
        `payInstallment: no pending occurrence found for plan id=${planId} (installment ${installmentNumber}) — the payment itself succeeded; only the reminder row is missing`,
      );
    } else {
      await resolveInstallmentOccurrence(occurrence.id, installmentPaymentId);
    }
  } catch (error) {
    console.error(
      `payInstallment: the payment for plan id=${planId} installment ${installmentNumber} succeeded, but marking its occurrence paid FAILED — that occurrence is still pending and will keep showing as due`,
      error,
    );
  }

  try {
    await advanceInstallmentSchedule(planId);
  } catch (error) {
    console.error(
      `payInstallment: the payment for plan id=${planId} installment ${installmentNumber} succeeded, but scheduling the NEXT occurrence FAILED — this plan will show no further reminders until another payment or skip advances it`,
      error,
    );
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
      throw validationError('That payment no longer exists.');
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
      throw validationError(
        'Only the most recent payment for this plan can be undone. Undo later payments first.',
      );
    }
    await db.transaction(async tx => {
      // Occurrence bookkeeping is undone FIRST, and inside the same
      // transaction, because installment_occurrences references the
      // installment_payments row about to be deleted — unwinding it
      // afterwards would mean a moment where a 'paid' occurrence points
      // at a payment that no longer exists.
      //
      // Two rows move, mirroring exactly what paying did:
      //   * the occurrence this payment resolved goes back to pending,
      //     with its payment link and resolvedAt cleared, so the
      //     installment shows as due again;
      //   * the occurrence that paying SCHEDULED — this plan's currently
      //     pending one — is deleted, since after this undo it is no
      //     longer what is next due; leaving it would show a reminder
      //     for the following installment while this one is unpaid
      //     again. Matched by "the plan's pending row" rather than by
      //     number + 1 for the same reason resolvePaidOccurrence does:
      //     after a skip the scheduled slot is not the payment's number
      //     plus one.
      // Resolved occurrences are never touched — deleting one would be
      // destroying history rather than undoing a step.
      await tx
        .delete(installmentOccurrences)
        .where(
          and(
            eq(
              installmentOccurrences.installmentPlanId,
              payment.installmentPlanId,
            ),
            eq(installmentOccurrences.status, 'pending'),
          ),
        );
      await tx
        .update(installmentOccurrences)
        .set({
          status: 'pending',
          installmentPaymentId: null,
          resolvedAt: null,
        })
        .where(eq(installmentOccurrences.installmentPaymentId, paymentId));

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

// NETWORK-READY: If a backend is added later, replace this with
// fetch(DELETE /api/transactions/:id/installment-payment). The History
// entry point to the same undo the plan card's Undo button performs.
//
// WHY IT EXISTS AT ALL: an installment payment is a real transactions
// row, so History offers to delete it like any other. Deleting only that
// row would leave the installment_payments row behind, pointing at a
// transaction that no longer exists — the plan would still count the
// slot as paid, with no money behind it, and the month's reminder would
// stay closed. Routing History's delete through unpayInstallment instead
// means both ends of the app mean the same thing by "remove this".
//
// Returns false when the transaction is not an installment payment at
// all, so the caller can fall through to an ordinary delete.
export async function unpayInstallmentByTransaction(
  transactionId: number,
): Promise<boolean> {
  try {
    const [payment] = await db
      .select({ id: installmentPayments.id })
      .from(installmentPayments)
      .where(eq(installmentPayments.transactionId, transactionId))
      .limit(1);
    if (!payment) {
      return false;
    }
    await unpayInstallment(payment.id);
    return true;
  } catch (error) {
    console.error(
      `unpayInstallmentByTransaction: failed to undo the installment payment behind transaction id=${transactionId}`,
      error,
    );
    throw error;
  }
}

// Which plan-level constraints a would-be edit of an installment payment
// has to satisfy, answered in one place so History and the plan's own
// details screen cannot disagree. Only a CUSTOM payment is editable —
// see installmentPayments.isCustomAmount for why.
export async function getInstallmentPaymentForTransaction(
  transactionId: number,
) {
  try {
    const [row] = await db
      .select({
        id: installmentPayments.id,
        installmentPlanId: installmentPayments.installmentPlanId,
        installmentNumber: installmentPayments.installmentNumber,
        isCustomAmount: installmentPayments.isCustomAmount,
      })
      .from(installmentPayments)
      .where(eq(installmentPayments.transactionId, transactionId))
      .limit(1);
    return row ?? null;
  } catch (error) {
    console.error(
      `getInstallmentPaymentForTransaction: failed to look up the installment payment behind transaction id=${transactionId}`,
      error,
    );
    throw error;
  }
}
