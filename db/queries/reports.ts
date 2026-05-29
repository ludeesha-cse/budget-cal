import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '../index';
import {
  accounts,
  categories,
  currencies,
  transactionTags,
  transactions,
} from '../schema';

export type SearchTransactionsParams = {
  query?: string;
  tagIds?: number[]; // AND, not OR — a matching transaction must carry every one of these
  categoryId?: number;
  accountId?: number;
  limit?: number;
};

const DEFAULT_SEARCH_LIMIT = 200;

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/transactions/search?..., keeping the same input/return
// shape.
//
// Deliberately a plain LIKE over lower()'d text, not SQLite FTS5 — see the
// Stage 15 spec: at this app's data scale (a personal tracker, not a
// company ledger) FTS5's shadow table and sync triggers buy nothing a
// LIKE query doesn't already do fast enough. `query` matches description,
// category name, and account name so "BOC" (an account name) or "Food"
// (a category name) surfaces transactions even when neither word appears
// in the description itself.
//
// tagIds intersection (AND) is computed in JS rather than SQL HAVING —
// same "small table, filter in JS" convention as getRecurringRules and
// getSavingsGoals elsewhere in this file: fetch every transactionTags row
// for the requested tags, group by transactionId, and keep only the
// transactions whose tag set is a superset of every requested tagId.
// Searches every transaction regardless of date — there is no
// month/year restriction anywhere in this function, by design (see
// HistoryListScreen, which is what switches into "searching all
// transactions" mode when this is called).
export async function searchTransactions(params: SearchTransactionsParams) {
  try {
    const limit = params.limit ?? DEFAULT_SEARCH_LIMIT;

    let matchingTransactionIds: number[] | null = null;
    if (params.tagIds && params.tagIds.length > 0) {
      const tagRows = await db
        .select({
          transactionId: transactionTags.transactionId,
          tagId: transactionTags.tagId,
        })
        .from(transactionTags)
        .where(inArray(transactionTags.tagId, params.tagIds));
      const tagIdsByTransaction = new Map<number, Set<number>>();
      for (const row of tagRows) {
        const existingSet = tagIdsByTransaction.get(row.transactionId);
        if (existingSet) {
          existingSet.add(row.tagId);
        } else {
          tagIdsByTransaction.set(row.transactionId, new Set([row.tagId]));
        }
      }
      const requiredTagIds = params.tagIds;
      matchingTransactionIds = Array.from(tagIdsByTransaction.entries())
        .filter(([, tagIdSet]) =>
          requiredTagIds.every(tagId => tagIdSet.has(tagId)),
        )
        .map(([transactionId]) => transactionId);
      // No transaction carries every requested tag — short-circuit rather
      // than run the main query with an inArray([]) that SQLite would
      // otherwise need to evaluate as "matches nothing" anyway.
      if (matchingTransactionIds.length === 0) {
        return [];
      }
    }

    // Always has at least one entry (the trivially-true base condition),
    // so `and(...conditions)` never has to handle an empty spread.
    const conditions = [sql`1 = 1`];
    if (params.query && params.query.trim()) {
      const likePattern = `%${params.query.trim().toLowerCase()}%`;
      conditions.push(
        sql`(
          lower(coalesce(${transactions.description}, '')) LIKE ${likePattern}
          OR lower(coalesce(${categories.name}, '')) LIKE ${likePattern}
          OR lower(coalesce(${accounts.name}, '')) LIKE ${likePattern}
        )`,
      );
    }
    if (params.categoryId != null) {
      conditions.push(eq(transactions.categoryId, params.categoryId));
    }
    if (params.accountId != null) {
      conditions.push(eq(transactions.accountId, params.accountId));
    }
    if (matchingTransactionIds != null) {
      conditions.push(inArray(transactions.id, matchingTransactionIds));
    }

    return await db
      .select({
        id: transactions.id,
        accountId: transactions.accountId,
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
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .innerJoin(currencies, eq(transactions.currencyId, currencies.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(...conditions))
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(limit);
  } catch (error) {
    console.error(
      'searchTransactions: failed to search transactions',
      params,
      error,
    );
    throw error;
  }
}

// Stage 16a: statistics reports.
//
// These four functions are the ONLY reporting reads in this file, and
// they read from `transactions` exclusively — deliberately never
// `transfers`, `credit_card_payoffs`, `loan_payments`, or
// `savings_contributions`. None of those tables is spending or income:
// a transfer/credit-card payoff moves money between accounts the user
// already owns, a loan payment is debt movement already reflected in the
// loan account's own balance, and a savings contribution never touches a
// real balance at all (Stage 14's addContribution is explicitly a no-op
// against account_balances/transactions). Folding any of them into a
// report would double-count money that's already accounted for through
// its own dedicated flow. This looks like an omission if you're scanning
// for "why doesn't this report include transfers" — it's intentional.
//
// Every function here also takes `includeExcluded` (default false): when
// false, excludeFromBudget transactions are left out, same as
// getMonthlyTotal/getMonthlyIncome/getCategorySpent; when true, they're
// folded back in. One parameterized WHERE clause, not two query bodies.

// Shared by all four report queries below — date range + currency +
// the includeExcluded toggle, as plain-english conditions rather than
// duplicated inline in each function.
function reportWhereConditions(
  startDate: string,
  endDate: string,
  currencyId: number,
  includeExcluded: boolean,
) {
  const conditions = [
    gte(transactions.date, startDate),
    lte(transactions.date, endDate),
    eq(transactions.currencyId, currencyId),
  ];
  if (!includeExcluded) {
    conditions.push(eq(transactions.excludeFromBudget, false));
  }
  return conditions;
}

export type ReportSummary = {
  totalExpenses: number;
  totalIncome: number;
  net: number; // income minus expenses — can be negative
};

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/reports/summary?startDate=&endDate=&currencyId=&includeExcluded=,
// keeping the same return shape.
export async function getReportSummary(
  startDate: string,
  endDate: string,
  currencyId: number,
  includeExcluded: boolean = false,
): Promise<ReportSummary> {
  try {
    const rows = await db
      .select({
        entryType: transactions.entryType,
        total: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .where(
        and(
          ...reportWhereConditions(startDate, endDate, currencyId, includeExcluded),
        ),
      )
      .groupBy(transactions.entryType);
    const totalExpenses =
      rows.find(row => row.entryType === 'Expense')?.total ?? 0;
    const totalIncome =
      rows.find(row => row.entryType === 'Income')?.total ?? 0;
    return {
      totalExpenses,
      totalIncome,
      net: totalIncome - totalExpenses,
    };
  } catch (error) {
    console.error(
      `getReportSummary: failed to summarize ${startDate}..${endDate} currency id=${currencyId}`,
      error,
    );
    throw error;
  }
}

export type CategorySpendingRow = {
  categoryId: number | null;
  categoryName: string;
  total: number;
  percentage: number; // 0-100, of this result set's own total — not of overall net worth or anything else
};

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/reports/by-category?startDate=&endDate=&currencyId=&includeExcluded=,
// keeping the same return shape. Expense-only — an Income entry has no
// place in a spending-by-category breakdown. percentage is computed
// against this query's own grand total (every category's total summed),
// which is exactly getReportSummary's totalExpenses for the same
// parameters — the two are meant to be read together, and the category
// totals + percentages are designed to sum back to that one number.
export async function getSpendingByCategory(
  startDate: string,
  endDate: string,
  currencyId: number,
  includeExcluded: boolean = false,
): Promise<CategorySpendingRow[]> {
  try {
    const rows = await db
      .select({
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        total: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        and(
          ...reportWhereConditions(startDate, endDate, currencyId, includeExcluded),
          eq(transactions.entryType, 'Expense'),
        ),
      )
      .groupBy(transactions.categoryId)
      .orderBy(desc(sql`sum(${transactions.amount})`));
    const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);
    return rows.map(row => ({
      categoryId: row.categoryId,
      // Every Expense requires a category by app convention, so this
      // fallback should never actually be seen — kept only so a legacy
      // or hand-edited row with a dangling categoryId doesn't crash the
      // report with a null label.
      categoryName: row.categoryName ?? 'Uncategorized',
      total: row.total,
      percentage: grandTotal > 0 ? (row.total / grandTotal) * 100 : 0,
    }));
  } catch (error) {
    console.error(
      `getSpendingByCategory: failed to summarize ${startDate}..${endDate} currency id=${currencyId}`,
      error,
    );
    throw error;
  }
}

export type AccountTypeSpendingRow = {
  accountType: string;
  total: number;
};

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/reports/by-account-type?startDate=&endDate=&currencyId=&includeExcluded=,
// keeping the same return shape. Expense-only, same reasoning as
// getSpendingByCategory. Only Bank/Cash/CryptoWallet/CreditCard accounts
// can ever appear here — Liability/Receivable accounts never carry an
// ordinary Expense transaction in the first place (see
// NON_TRANSACTABLE_ACCOUNT_TYPES throughout the UI layer), so there's
// nothing to filter out here that could accidentally include loan
// activity.
export async function getSpendingByAccountType(
  startDate: string,
  endDate: string,
  currencyId: number,
  includeExcluded: boolean = false,
): Promise<AccountTypeSpendingRow[]> {
  try {
    return await db
      .select({
        accountType: accounts.type,
        total: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(
        and(
          ...reportWhereConditions(startDate, endDate, currencyId, includeExcluded),
          eq(transactions.entryType, 'Expense'),
        ),
      )
      .groupBy(accounts.type)
      .orderBy(desc(sql`sum(${transactions.amount})`));
  } catch (error) {
    console.error(
      `getSpendingByAccountType: failed to summarize ${startDate}..${endDate} currency id=${currencyId}`,
      error,
    );
    throw error;
  }
}

export type MonthlyTrendRow = {
  month: string; // 'YYYY-MM'
  totalExpenses: number;
  totalIncome: number;
};

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/reports/trend?months=&currencyId=&includeExcluded=,
// keeping the same return shape.
//
// Zero-fills months with no activity at all: the underlying query only
// ever returns a row for a (month, entryType) pair that actually has a
// matching transaction, so a month with zero transactions simply never
// appears in `rows` below. Silently omitting it from the result would
// look identical to "no data was requested for that month" once this is
// charted (Stage 16b) — there'd be a gap in the x-axis instead of a
// visible zero, which misrepresents "nothing happened" as "unknown."
// Building the result by mapping over the caller's own `months` array
// (rather than over `rows`) is what guarantees every requested month
// comes back, in the caller's own order, with an explicit 0 wherever
// nothing was found.
export async function getMonthlyTrend(
  months: string[],
  currencyId: number,
  includeExcluded: boolean = false,
): Promise<MonthlyTrendRow[]> {
  try {
    if (months.length === 0) {
      return [];
    }
    const sortedMonths = [...months].sort();
    const firstMonth = sortedMonths[0];
    const lastMonth = sortedMonths[sortedMonths.length - 1];
    const conditions = [
      gte(transactions.date, `${firstMonth}-01`),
      // '-31' is never a real calendar date for every month, but it's
      // only ever used here as a lexical upper bound on a 'YYYY-MM-DD'
      // string — every real date within lastMonth sorts before it
      // regardless of that month's actual length, so this is safe
      // without needing getDaysInMonth just to build a comparison string.
      lte(transactions.date, `${lastMonth}-31`),
      eq(transactions.currencyId, currencyId),
    ];
    if (!includeExcluded) {
      conditions.push(eq(transactions.excludeFromBudget, false));
    }
    const monthExpr = sql<string>`substr(${transactions.date}, 1, 7)`;
    const rows = await db
      .select({
        month: monthExpr,
        entryType: transactions.entryType,
        total: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .where(and(...conditions))
      .groupBy(monthExpr, transactions.entryType);

    const byMonth = new Map<
      string,
      { totalExpenses: number; totalIncome: number }
    >();
    for (const row of rows) {
      const entry = byMonth.get(row.month) ?? {
        totalExpenses: 0,
        totalIncome: 0,
      };
      if (row.entryType === 'Expense') {
        entry.totalExpenses = row.total;
      } else {
        entry.totalIncome = row.total;
      }
      byMonth.set(row.month, entry);
    }
    return months.map(month => ({
      month,
      totalExpenses: byMonth.get(month)?.totalExpenses ?? 0,
      totalIncome: byMonth.get(month)?.totalIncome ?? 0,
    }));
  } catch (error) {
    console.error(
      `getMonthlyTrend: failed to build trend for months=${months.join(',')} currency id=${currencyId}`,
      error,
    );
    throw error;
  }
}

