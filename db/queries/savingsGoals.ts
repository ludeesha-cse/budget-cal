import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../index';
import {
  currencies,
  savingsContributions,
  savingsGoals,
} from '../schema';

type SavingsGoal = typeof savingsGoals.$inferSelect;

// Stage 14: savings goals. A goal and its contributions NEVER touch
// account_balances and NEVER insert into transactions — see the CRITICAL
// note on addContribution below, which is the one place this rule
// actually matters. Everything here is otherwise a plain, independent
// pair of tables with no relationship to the balance-derivation machinery
// used everywhere else in this file (getBalanceDelta,
// getNetSpentForAccount, etc.) — that machinery is deliberately never
// imported into this section.
export type NewSavingsGoalParams = {
  name: string;
  targetAmount: number;
  currencyId: number;
  targetDate?: string; // 'YYYY-MM-DD', optional — no target date means no required-per-month figure either
};

// Shared by create/update. targetAmount must be strictly positive: zero
// or negative targets make getProgress/getRequiredPerMonth's math
// meaningless (a goal with nothing to save toward isn't a goal).
function validateSavingsGoalParams(params: NewSavingsGoalParams): void {
  if (!params.name.trim()) {
    throw new Error('A name is required for the savings goal.');
  }
  if (!Number.isFinite(params.targetAmount) || params.targetAmount <= 0) {
    throw new Error('Target amount must be a positive number.');
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/savings-goals?status=, keeping the same return shape.
// totalContributed is summed here (coalesced to 0 for a goal with no
// contributions yet) so the screen never needs a second round-trip per
// goal just to show progress — it's deliberately left un-clamped and
// un-divided-by-target here; getProgress/getRequiredPerMonth in
// utils/savingsMath.ts are what turn this raw total into a percentage or
// a monthly figure, kept out of the query layer the same way
// InstallmentPlansScreen computes its own remaining/next-due figures from
// raw plan+payment data rather than the query layer doing it. Filtering
// by status happens in JS, matching getRecurringRules' activeOnly
// pattern, since this table is small in a personal tracker.
export async function getSavingsGoals(
  status?: 'active' | 'achieved' | 'abandoned',
) {
  try {
    const rows = await db
      .select({
        id: savingsGoals.id,
        name: savingsGoals.name,
        targetAmount: savingsGoals.targetAmount,
        currencyId: savingsGoals.currencyId,
        currencyCode: currencies.code,
        targetDate: savingsGoals.targetDate,
        status: savingsGoals.status,
        createdAt: savingsGoals.createdAt,
        totalContributed: sql<number>`coalesce(sum(${savingsContributions.amount}), 0)`,
      })
      .from(savingsGoals)
      .innerJoin(currencies, eq(savingsGoals.currencyId, currencies.id))
      .leftJoin(
        savingsContributions,
        eq(savingsContributions.savingsGoalId, savingsGoals.id),
      )
      .groupBy(savingsGoals.id)
      .orderBy(desc(savingsGoals.createdAt));
    return status ? rows.filter(row => row.status === status) : rows;
  } catch (error) {
    console.error('getSavingsGoals: failed to load savings goals', error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/savings-goals), keeping the same input/return shape. Always
// created with status 'active' — a goal can't be born already achieved
// or abandoned.
export async function createSavingsGoal(
  params: NewSavingsGoalParams,
): Promise<SavingsGoal> {
  try {
    validateSavingsGoalParams(params);
    const [goal] = await db
      .insert(savingsGoals)
      .values({
        name: params.name.trim(),
        targetAmount: params.targetAmount,
        currencyId: params.currencyId,
        targetDate: params.targetDate ?? null,
        status: 'active',
        createdAt: Date.now(),
      })
      .returning();
    return goal;
  } catch (error) {
    console.error(
      'createSavingsGoal: failed to create savings goal',
      params,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(PATCH
// /api/savings-goals/:id), keeping the same input/return shape. Does not
// touch status — use setSavingsGoalStatus for achieved/abandoned so an
// ordinary edit (say, correcting a typo in the name) can never
// accidentally flip a goal's status as a side effect.
export async function updateSavingsGoal(
  id: number,
  params: NewSavingsGoalParams,
): Promise<void> {
  try {
    validateSavingsGoalParams(params);
    await db
      .update(savingsGoals)
      .set({
        name: params.name.trim(),
        targetAmount: params.targetAmount,
        currencyId: params.currencyId,
        targetDate: params.targetDate ?? null,
      })
      .where(eq(savingsGoals.id, id));
  } catch (error) {
    console.error(
      `updateSavingsGoal: failed to update savings goal id=${id}`,
      params,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(PATCH
// /api/savings-goals/:id/status), keeping the same input shape. This is
// the preferred way to mark a goal "achieved" or "abandoned" — deletion
// is reserved for goals created by mistake (see deleteSavingsGoal), so
// history (and the goal's contribution log) is kept by default rather
// than as an opt-in.
export async function setSavingsGoalStatus(
  id: number,
  status: 'active' | 'achieved' | 'abandoned',
): Promise<void> {
  try {
    await db
      .update(savingsGoals)
      .set({ status })
      .where(eq(savingsGoals.id, id));
  } catch (error) {
    console.error(
      `setSavingsGoalStatus: failed to set status=${status} for savings goal id=${id}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(DELETE
// /api/savings-goals/:id), keeping the same input shape. Deletes the goal
// and every contribution logged against it — the caller (SavingsGoalsScreen)
// is responsible for a destructive-confirmation prompt before calling
// this, since unlike setSavingsGoalStatus there's no undo. Runs in a
// transaction so a failure partway never leaves orphaned contribution
// rows pointing at a goal that no longer exists.
export async function deleteSavingsGoal(id: number): Promise<void> {
  try {
    await db.transaction(async tx => {
      await tx
        .delete(savingsContributions)
        .where(eq(savingsContributions.savingsGoalId, id));
      await tx.delete(savingsGoals).where(eq(savingsGoals.id, id));
    });
  } catch (error) {
    console.error(
      `deleteSavingsGoal: failed to delete savings goal id=${id}`,
      error,
    );
    throw error;
  }
}

export type NewContributionParams = {
  savingsGoalId: number;
  amount: number;
  date: string; // 'YYYY-MM-DD'
  note?: string;
};

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/savings-goals/:id/contributions), keeping the same input/return
// shape.
//
// CRITICAL: this inserts a savings_contributions row and NOTHING ELSE. It
// must never touch account_balances and must never insert into
// transactions — doing either would make a contribution move real money
// or change net worth, which is exactly what this feature is not allowed
// to do. A contribution is a log of intent ("I'm setting this aside for
// X"), not a movement of money: the money stays exactly where it already
// was, in whatever real account it's in, until the user actually spends
// it — which, if it ever happens, is recorded as an ordinary Expense
// transaction completely independent of this table. If a future edit to
// this function ever references accountBalances or transactions, that is
// a bug being introduced, not a feature.
export async function addContribution(
  params: NewContributionParams,
): Promise<void> {
  try {
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      throw new Error('Enter a contribution amount greater than zero.');
    }
    await db.insert(savingsContributions).values({
      savingsGoalId: params.savingsGoalId,
      amount: params.amount,
      date: params.date,
      note: params.note,
      createdAt: Date.now(),
    });
  } catch (error) {
    console.error(
      'addContribution: failed to add contribution',
      params,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/savings-goals/:id/contributions, keeping the same
// return shape. Most-recent-first by date, tie-broken by id so
// same-day contributions still get a stable, insertion order.
export async function getContributions(savingsGoalId: number) {
  try {
    return await db
      .select()
      .from(savingsContributions)
      .where(eq(savingsContributions.savingsGoalId, savingsGoalId))
      .orderBy(desc(savingsContributions.date), desc(savingsContributions.id));
  } catch (error) {
    console.error(
      `getContributions: failed to load contributions for savings goal id=${savingsGoalId}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(PATCH
// /api/savings-contributions/:id), keeping the same input shape. Same
// CRITICAL constraint as addContribution above applies here too — this
// only ever updates a savings_contributions row.
export async function updateContribution(
  id: number,
  params: { amount: number; date: string; note?: string },
): Promise<void> {
  try {
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      throw new Error('Enter a contribution amount greater than zero.');
    }
    await db
      .update(savingsContributions)
      .set({ amount: params.amount, date: params.date, note: params.note })
      .where(eq(savingsContributions.id, id));
  } catch (error) {
    console.error(
      `updateContribution: failed to update contribution id=${id}`,
      params,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(DELETE
// /api/savings-contributions/:id), keeping the same return shape. Removing
// a contribution simply lowers the goal's totalContributed the next time
// getSavingsGoals sums them — there's no separate running total anywhere
// else that could fall out of sync.
export async function deleteContribution(id: number): Promise<void> {
  try {
    await db
      .delete(savingsContributions)
      .where(eq(savingsContributions.id, id));
  } catch (error) {
    console.error(
      `deleteContribution: failed to delete contribution id=${id}`,
      error,
    );
    throw error;
  }
}

