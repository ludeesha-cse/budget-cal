import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../index';
import {
  budgets,
  categories,
  categoryBudgets,
  currencies,
} from '../schema';

type Budget = typeof budgets.$inferSelect;

type CategoryBudget = typeof categoryBudgets.$inferSelect;

// If a backend is added later, replace this with a fetch() call to
// GET /api/budgets?month=YYYY-MM&currencyId=, keeping the same return
// type. One overall budget per (month, currency) — see schema.ts's
// budgets.currencyId comment for why.
export async function getBudgetForMonth(
  month: string,
  currencyId: number,
): Promise<Budget | null> {
  const [budget] = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.month, month), eq(budgets.currencyId, currencyId)))
    .limit(1);
  return budget ?? null;
}

export type BudgetWithCurrency = Budget & { currencyCode: string };

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/budgets?month=YYYY-MM, keeping the same return shape.
// Every ACTIVE currency's overall budget for one month, not just one —
// this is what Dashboard's "up to 2 budget cards + more" and
// BudgetSettingsScreen's currency tabs are both built on. A budget that
// already exists for a currency the user has since disabled is
// deliberately excluded here too — the row itself is never deleted (see
// deleteBudget's own comment on that), it just stops surfacing anywhere
// until the currency is re-enabled, same as every other currency-scoped
// list in the app. Ordered default-currency-first (then alphabetically by
// code) so the most relevant budget is always the first card shown,
// regardless of insertion order.
export async function getBudgetsForMonth(
  month: string,
): Promise<BudgetWithCurrency[]> {
  const rows = await db
    .select({
      id: budgets.id,
      category: budgets.category,
      limitAmount: budgets.limitAmount,
      period: budgets.period,
      startDate: budgets.startDate,
      month: budgets.month,
      currencyId: budgets.currencyId,
      createdAt: budgets.createdAt,
      currencyCode: currencies.code,
      isDefaultCurrency: currencies.isDefault,
    })
    .from(budgets)
    .innerJoin(currencies, eq(budgets.currencyId, currencies.id))
    .where(and(eq(budgets.month, month), eq(currencies.active, true)));
  return rows
    .sort((a, b) => {
      if (a.isDefaultCurrency !== b.isDefaultCurrency) {
        return a.isDefaultCurrency ? -1 : 1;
      }
      return a.currencyCode.localeCompare(b.currencyCode);
    })
    .map(({ isDefaultCurrency: _isDefaultCurrency, ...row }) => row);
}

function monthStartEpoch(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber - 1, 1).getTime();
}

// If a backend is added later, replace this with fetch(POST or PATCH
// /api/budgets), keeping the same input/return shape.
export async function upsertBudget(
  month: string,
  currencyId: number,
  amount: number,
): Promise<Budget> {
  const existing = await getBudgetForMonth(month, currencyId);
  if (existing) {
    const [updated] = await db
      .update(budgets)
      .set({ limitAmount: amount })
      .where(eq(budgets.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(budgets)
    .values({
      category: 'Overall',
      limitAmount: amount,
      period: 'monthly',
      startDate: monthStartEpoch(month),
      month,
      currencyId,
      createdAt: Date.now(),
    })
    .returning();
  return created;
}

// NETWORK-READY: If a backend is added later, replace this with fetch(DELETE
// /api/budgets/:id), keeping the same return shape. Only ever removes the
// overall-budget row itself — never touches any transaction, so deleting a
// currency's budget just stops that currency from being tracked against a
// limit; past spending in that currency is completely unaffected.
export async function deleteBudget(id: number): Promise<void> {
  await db.delete(budgets).where(eq(budgets.id, id));
}

// If a backend is added later, replace this with a fetch() call to
// GET /api/budgets?currencyId=, keeping the same return type. Backs
// BudgetSettingsScreen's "PAST BUDGETS" list, scoped to whichever
// currency tab is currently selected.
export async function getAllBudgetsForCurrency(
  currencyId: number,
): Promise<Budget[]> {
  return db
    .select()
    .from(budgets)
    .where(eq(budgets.currencyId, currencyId))
    .orderBy(desc(budgets.month));
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/category-budgets?month=YYYY-MM&categoryId=&currencyId=,
// keeping the same return type.
export async function getCategoryBudget(
  month: string,
  categoryId: number,
  currencyId: number,
): Promise<CategoryBudget | null> {
  const [row] = await db
    .select()
    .from(categoryBudgets)
    .where(
      and(
        eq(categoryBudgets.month, month),
        eq(categoryBudgets.categoryId, categoryId),
        eq(categoryBudgets.currencyId, currencyId),
      ),
    )
    .limit(1);
  return row ?? null;
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/category-budgets?month=YYYY-MM&currencyId=, keeping the
// same return shape. Scoped to one currency at a time — the same category
// can carry a completely separate budget per currency (see schema.ts).
export async function getCategoryBudgetsForMonth(
  month: string,
  currencyId: number,
) {
  return db
    .select({
      id: categoryBudgets.id,
      month: categoryBudgets.month,
      categoryId: categoryBudgets.categoryId,
      categoryName: categories.name,
      amount: categoryBudgets.amount,
      currencyId: categoryBudgets.currencyId,
    })
    .from(categoryBudgets)
    .innerJoin(categories, eq(categoryBudgets.categoryId, categories.id))
    .where(
      and(
        eq(categoryBudgets.month, month),
        eq(categoryBudgets.currencyId, currencyId),
      ),
    );
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to POST or PATCH /api/category-budgets, keeping the same
// input/return shape.
export async function upsertCategoryBudget(
  month: string,
  categoryId: number,
  currencyId: number,
  amount: number,
): Promise<CategoryBudget> {
  const existing = await getCategoryBudget(month, categoryId, currencyId);
  if (existing) {
    const [updated] = await db
      .update(categoryBudgets)
      .set({ amount })
      .where(eq(categoryBudgets.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(categoryBudgets)
    .values({ month, categoryId, currencyId, amount })
    .returning();
  return created;
}

export type CurrencyOption = { id: number; code: string; name: string };

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/category-budgets/currencies?month=YYYY-MM, keeping the
// same return shape. CategoryBudgetsScreen's currency tabs are meant to
// list every ACTIVE currency (so a user can proactively start a budget in
// a currency they haven't spent in yet), not just ones with existing
// activity — see utils/currencyTotals.ts's own note that this app never
// blends currencies together, so there's no "wrong" currency to offer a
// tab for. A currency the user has disabled on the Currencies screen is
// deliberately excluded even here, same as every other picker in the app
// — "don't show it anywhere" includes budget-editing screens. Kept here
// (rather than screen-local getActiveCurrencies()) only so the ordering
// (default first, then alphabetical) is shared with getBudgetsForMonth
// above.
export async function getBudgetCurrencyOptions(): Promise<CurrencyOption[]> {
  const rows = await db
    .select({
      id: currencies.id,
      code: currencies.code,
      name: currencies.name,
      isDefault: currencies.isDefault,
    })
    .from(currencies)
    .where(eq(currencies.active, true))
    .orderBy(asc(currencies.code));
  return rows
    .sort((a, b) => {
      if (a.isDefault !== b.isDefault) {
        return a.isDefault ? -1 : 1;
      }
      return a.code.localeCompare(b.code);
    })
    .map(({ isDefault: _isDefault, ...row }) => row);
}
