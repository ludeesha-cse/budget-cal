import { and, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db } from '../index';
import { validationError } from '../../utils/appErrors';
import { guardBalancesWithin } from './balanceGuard';
import {
  accountBalances,
  accounts,
  currencies,
  savingsContributions,
  savingsGoals,
  transfers,
} from '../schema';
import { getAllAccountBalances } from './accounts';
import { insertTransferWithin, validateTransferSides } from './transfers';
import {
  allocateGoalSavings,
  poolKey,
  type GoalAllocationInput,
} from '../../utils/savingsMath';

type SavingsGoal = typeof savingsGoals.$inferSelect;

// SAVINGS GOALS ARE BACKED BY A REAL ACCOUNT.
//
// This reverses the original design, and the reversal is the point, so
// it is worth stating rather than leaving a reader to infer it from the
// code. Goals used to be a pure log of intent: a contribution moved no
// money, touched no balance, and a goal could claim any figure the user
// typed regardless of whether that money existed. Now:
//
//   - every goal names an account it saves INTO (createSavingsGoal
//     refuses a goal without one);
//   - the only way to add to a goal is createSavingsTransfer, which
//     moves real money into that account and records the earmark as a
//     by-product, in one atomic write;
//   - a goal can never show more than its account actually holds, and
//     that cap is derived on every read rather than written down (see
//     allocateGoalSavings in utils/savingsMath.ts for why).
//
// Legacy contributions from before this stage — the ones with a null
// transferId — still count toward a goal and can still be deleted
// individually. They are the only rows here not backed by a transfer.

export type NewSavingsGoalParams = {
  name: string;
  targetAmount: number;
  currencyId: number;
  accountId: number;
  targetDate?: string; // 'YYYY-MM-DD', optional — no target date means no required-per-month figure either
};

// Only ordinary asset accounts can hold savings. Same list as
// TRANSFERABLE_ACCOUNT_TYPES in transfers.ts, and for the same reason:
// funding a goal IS a transfer, so an account that cannot receive a
// transfer cannot back a goal either. A credit card or a loan account
// would be nonsense here — you cannot save into a debt.
const SAVEABLE_ACCOUNT_TYPES = ['Bank', 'Cash', 'CryptoWallet'];

// Shared by create/update. targetAmount must be strictly positive: zero
// or negative targets make getProgress/getRequiredPerMonth's math
// meaningless (a goal with nothing to save toward isn't a goal).
function validateSavingsGoalFields(params: NewSavingsGoalParams): void {
  if (!params.name.trim()) {
    throw validationError('A name is required for the savings goal.');
  }
  if (!Number.isFinite(params.targetAmount) || params.targetAmount <= 0) {
    throw validationError('Target amount must be a positive number.');
  }
  if (params.accountId == null) {
    throw validationError('Choose an account to save this money in.');
  }
}

// Enforced in the query layer, not just the goal form, so no future
// caller can attach a goal to an account that cannot actually hold its
// money. Checks all three things that have to be true at once: the
// account exists and is open, it is a type that can hold savings, and it
// already has a balance row in the goal's currency (otherwise the goal
// would be denominated in a currency its own account does not hold, and
// its saved figure would be permanently capped at zero).
async function validateGoalAccount(
  accountId: number,
  currencyId: number,
): Promise<void> {
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!account) {
    throw validationError('That account no longer exists.');
  }
  if (!account.active) {
    throw validationError('That account is closed. Choose an open account.');
  }
  if (!SAVEABLE_ACCOUNT_TYPES.includes(account.type)) {
    throw validationError(
      'Savings can only be held in a Bank, Cash, or Crypto Wallet account.',
    );
  }
  const [balanceRow] = await db
    .select()
    .from(accountBalances)
    .where(
      and(
        eq(accountBalances.accountId, accountId),
        eq(accountBalances.currencyId, currencyId),
      ),
    )
    .limit(1);
  if (!balanceRow) {
    throw validationError(
      `${account.name} doesn't hold that currency. Add the currency to the account first, or pick a different account.`,
    );
  }
}

const goalAccountAlias = alias(accounts, 'savings_goal_account_alias');

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/savings-goals?status=, keeping the same return shape.
//
// Returns TWO saved figures per goal, and the difference between them is
// the whole feature:
//
//   rawContributed  — the plain sum of the goal's contribution rows:
//                     what was earmarked.
//   totalContributed — that sum capped by what the goal's account
//                     actually holds now, after sharing the account with
//                     any other goals on it (oldest first). This is the
//                     figure every screen displays, and it keeps the
//                     original field name so nothing downstream had to
//                     change to start respecting the cap.
//
// isCapped is simply the two disagreeing, precomputed so the UI has one
// definition of "this goal is showing less than was put in" rather than
// each card re-deriving it.
//
// Account balances come from getAllAccountBalances (three queries for
// every account and currency at once) rather than a per-goal balance
// lookup, which would be an N+1 over the transactions table.
export async function getSavingsGoals(
  status?: 'active' | 'achieved' | 'abandoned',
) {
  try {
    const [goalRows, contributionRows, balanceRows] = await Promise.all([
      db
        .select({
          id: savingsGoals.id,
          name: savingsGoals.name,
          targetAmount: savingsGoals.targetAmount,
          currencyId: savingsGoals.currencyId,
          currencyCode: currencies.code,
          targetDate: savingsGoals.targetDate,
          status: savingsGoals.status,
          createdAt: savingsGoals.createdAt,
          accountId: savingsGoals.accountId,
          accountName: goalAccountAlias.name,
          accountActive: goalAccountAlias.active,
        })
        .from(savingsGoals)
        .innerJoin(currencies, eq(savingsGoals.currencyId, currencies.id))
        .leftJoin(
          goalAccountAlias,
          eq(savingsGoals.accountId, goalAccountAlias.id),
        )
        .orderBy(desc(savingsGoals.createdAt)),
      db
        .select({
          savingsGoalId: savingsContributions.savingsGoalId,
          total: sql<number>`coalesce(sum(${savingsContributions.amount}), 0)`,
        })
        .from(savingsContributions)
        .groupBy(savingsContributions.savingsGoalId),
      getAllAccountBalances(),
    ]);

    const rawByGoalId = new Map(
      contributionRows.map(row => [row.savingsGoalId, row.total]),
    );
    const balanceByPool = new Map(
      balanceRows.map(row => [
        poolKey(row.accountId, row.currencyId),
        row.currentBalance,
      ]),
    );

    const allocationInput: GoalAllocationInput[] = goalRows.map(row => ({
      id: row.id,
      accountId: row.accountId,
      currencyId: row.currencyId,
      rawContributed: rawByGoalId.get(row.id) ?? 0,
      createdAt: row.createdAt,
      status: row.status,
    }));
    const savedByGoalId = allocateGoalSavings(allocationInput, balanceByPool);

    const rows = goalRows.map(row => {
      const rawContributed = rawByGoalId.get(row.id) ?? 0;
      const totalContributed = savedByGoalId.get(row.id) ?? 0;
      return {
        ...row,
        rawContributed,
        totalContributed,
        isCapped: totalContributed < rawContributed,
        // What the backing account holds in this goal's currency right
        // now — shown alongside a capped goal so the number it dropped
        // to is explainable on the spot rather than mysterious.
        accountBalance:
          row.accountId == null
            ? 0
            : balanceByPool.get(poolKey(row.accountId, row.currencyId)) ?? 0,
        // A goal whose account went missing or was closed out from under
        // it. Renders as needing attention; blocks new contributions.
        needsAccount: row.accountId == null || row.accountActive !== true,
      };
    });
    // Filtering by status happens in JS, matching getRecurringRules'
    // activeOnly pattern, since this table is small in a personal tracker
    // — and because the allocation above has to see EVERY goal on an
    // account to split that account's balance correctly, so filtering in
    // SQL first would produce wrong numbers, not just fewer rows.
    return status ? rows.filter(row => row.status === status) : rows;
  } catch (error) {
    console.error('getSavingsGoals: failed to load savings goals', error);
    throw error;
  }
}

export type SavingsGoalListRow = Awaited<
  ReturnType<typeof getSavingsGoals>
>[number];

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/savings-goals), keeping the same input/return shape. Always
// created with status 'active' — a goal can't be born already achieved
// or abandoned.
export async function createSavingsGoal(
  params: NewSavingsGoalParams,
): Promise<SavingsGoal> {
  try {
    validateSavingsGoalFields(params);
    await validateGoalAccount(params.accountId, params.currencyId);
    const [goal] = await db
      .insert(savingsGoals)
      .values({
        name: params.name.trim(),
        targetAmount: params.targetAmount,
        currencyId: params.currencyId,
        accountId: params.accountId,
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
//
// CHANGING THE ACCOUNT IS A PLAIN FIELD UPDATE, deliberately. No
// contribution row is rewritten and no money is moved: the goal's saved
// figure is derived from whatever account it currently points at, so
// pointing it somewhere else re-derives it on the next read for free. If
// the new account holds enough, the goal is unchanged; if it holds less,
// the goal shows the lower figure. The UI warns about the second case
// before saving (see useSavingsGoalForm) — this layer does not refuse
// it, because a user moving a goal to an account they are about to fund
// is a perfectly reasonable thing to do.
export async function updateSavingsGoal(
  id: number,
  params: NewSavingsGoalParams,
): Promise<void> {
  try {
    validateSavingsGoalFields(params);
    await validateGoalAccount(params.accountId, params.currencyId);
    await db
      .update(savingsGoals)
      .set({
        name: params.name.trim(),
        targetAmount: params.targetAmount,
        currencyId: params.currencyId,
        accountId: params.accountId,
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
// and every contribution logged against it.
//
// DELIBERATELY DOES NOT REVERSE THE TRANSFERS THAT FUNDED IT. Those
// transfers moved real money into a real account and that money is still
// there — deleting the goal deletes the earmark, not the deposit. The
// transfer rows stay in History exactly as they are, which is why this
// only ever touches the two savings tables. (Deleting an individual
// contribution IS a reversal, because that is a statement about one
// specific movement; see deleteContribution.)
//
// Runs in a transaction so a failure partway never leaves orphaned
// contribution rows pointing at a goal that no longer exists.
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

export type CreateSavingsTransferParams = {
  savingsGoalId: number;
  fromAccountId: number;
  amount: number;
  date: string; // 'YYYY-MM-DD'
};

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/savings-goals/:id/transfers), keeping the same input/return shape.
//
// The ONLY way money enters a savings goal. One atomic write does three
// things that must never come apart:
//   1. moves `amount` out of the source account,
//   2. moves it into the goal's own account,
//   3. records the earmark against the goal, pointing at that transfer.
//
// The transfer carries the goal's NAME as its description, which is what
// makes "B -> A · Emergency Fund" readable in History without History
// needing to know savings goals exist.
//
// SAME CURRENCY ON BOTH SIDES, on purpose. The transfer machinery
// underneath is perfectly capable of converting (that is the other half
// of this stage), but a goal's contribution is denominated in the goal's
// currency, and letting a conversion happen here would mean the earmark
// and the money that backs it were agreed at a rate that nothing
// re-checks later. The source picker therefore only offers accounts that
// already hold the goal's currency; converting first, then funding, is
// two deliberate steps rather than one ambiguous one.
export async function createSavingsTransfer(
  params: CreateSavingsTransferParams,
): Promise<void> {
  try {
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      throw validationError('Enter an amount greater than 0', 'amount');
    }
    const [goal] = await db
      .select()
      .from(savingsGoals)
      .where(eq(savingsGoals.id, params.savingsGoalId))
      .limit(1);
    if (!goal) {
      throw validationError('That savings goal no longer exists.');
    }
    if (goal.status !== 'active') {
      throw validationError(
        `"${goal.name}" is ${goal.status}. Reactivate it before adding to it.`,
      );
    }
    if (goal.accountId == null) {
      throw validationError(
        `"${goal.name}" has no account to save into yet. Edit the goal and choose one first.`,
      );
    }
    if (goal.accountId === params.fromAccountId) {
      throw validationError(
        "That money is already in this goal's account. Choose a different account to transfer from.",
      );
    }
    // Reuses the transfer layer's own rules rather than restating them:
    // both accounts open and of a transferable type, and both already
    // holding the currency. Same currency on both sides here, per the
    // note above.
    const { fromAccount, toAccount } = await validateTransferSides(
      params.fromAccountId,
      goal.currencyId,
      goal.accountId,
      goal.currencyId,
    );

    await db.transaction(async tx => {
      // Refused, and rolled back, if the source account cannot cover
      // the contribution.
      const transferId = await guardBalancesWithin(
        tx,
        [{ accountId: params.fromAccountId, currencyId: goal.currencyId }],
        () =>
          insertTransferWithin(
            tx,
            {
              fromAccountId: params.fromAccountId,
              toAccountId: goal.accountId as number,
              amount: params.amount,
              currencyId: goal.currencyId,
              toCurrencyId: goal.currencyId,
              toAmount: params.amount,
              description: goal.name,
              date: params.date,
            },
            fromAccount.type,
            toAccount.type,
          ),
      );
      await tx.insert(savingsContributions).values({
        savingsGoalId: params.savingsGoalId,
        amount: params.amount,
        date: params.date,
        note: goal.name,
        transferId,
        createdAt: Date.now(),
      });
    });
  } catch (error) {
    console.error(
      `createSavingsTransfer: failed to fund savings goal id=${params.savingsGoalId} with ${params.amount} from account id=${params.fromAccountId}`,
      params,
      error,
    );
    throw error;
  }
}

const contributionFromAccountAlias = alias(
  accounts,
  'contribution_from_account_alias',
);

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/savings-goals/:id/contributions, keeping the same
// return shape. Most-recent-first by date, tie-broken by id so
// same-day contributions still get a stable, insertion order.
//
// Joins through to the backing transfer so each row can say where the
// money came from. Both joins are LEFT joins because a legacy
// contribution (logged before goals were account-backed) has no transfer
// behind it at all — those rows come back with a null fromAccountName
// and are rendered as the plain log entries they are.
export async function getContributions(savingsGoalId: number) {
  try {
    return await db
      .select({
        id: savingsContributions.id,
        savingsGoalId: savingsContributions.savingsGoalId,
        amount: savingsContributions.amount,
        date: savingsContributions.date,
        note: savingsContributions.note,
        createdAt: savingsContributions.createdAt,
        transferId: savingsContributions.transferId,
        fromAccountId: transfers.fromAccountId,
        fromAccountName: contributionFromAccountAlias.name,
      })
      .from(savingsContributions)
      .leftJoin(transfers, eq(savingsContributions.transferId, transfers.id))
      .leftJoin(
        contributionFromAccountAlias,
        eq(transfers.fromAccountId, contributionFromAccountAlias.id),
      )
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

// NETWORK-READY: If a backend is added later, replace this with fetch(DELETE
// /api/savings-contributions/:id), keeping the same return shape.
//
// Deleting a contribution that has a transfer behind it REVERSES THAT
// TRANSFER — the money goes back to the account it came from. This is
// the same operation as deleting the transfer from History, entered from
// the other end, and it has to behave identically or the two screens
// would disagree about what "remove this" means. The caller is
// responsible for saying so in its confirmation prompt.
//
// A legacy contribution with no transfer just disappears, since there is
// no movement to undo.
export async function deleteContribution(id: number): Promise<void> {
  try {
    const [contribution] = await db
      .select()
      .from(savingsContributions)
      .where(eq(savingsContributions.id, id))
      .limit(1);
    if (!contribution) {
      throw validationError('That contribution no longer exists.');
    }
    if (contribution.transferId == null) {
      await db
        .delete(savingsContributions)
        .where(eq(savingsContributions.id, id));
      return;
    }
    // Imported lazily to keep the module cycle one-directional at load
    // time: transfers.ts does not import this file, so a static import
    // here would be fine today, but deleteTransfer is the one function
    // this file needs from it that also writes to this file's own table.
    const { deleteTransfer } = await import('./transfers');
    // deleteTransfer removes the linked contribution itself, in the same
    // transaction as the balance reversal — so there is deliberately no
    // second delete here. Doing both would be a no-op at best and a
    // confusing double-write at worst.
    await deleteTransfer(contribution.transferId);
  } catch (error) {
    console.error(
      `deleteContribution: failed to delete contribution id=${id}`,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/accounts/:id/savings-goals, keeping the same return
// shape. Which goals would be destroyed by closing an account — read by
// AccountsScreen to name them in its confirmation prompt, and by
// closeAccount itself to refuse the close when the caller has not
// acknowledged them.
export async function getSavingsGoalsForAccount(
  accountId: number,
): Promise<{ id: number; name: string }[]> {
  try {
    return await db
      .select({ id: savingsGoals.id, name: savingsGoals.name })
      .from(savingsGoals)
      .where(eq(savingsGoals.accountId, accountId));
  } catch (error) {
    console.error(
      `getSavingsGoalsForAccount: failed to load savings goals for account id=${accountId}`,
      error,
    );
    throw error;
  }
}
