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
  tagIds?: number[]; 
  categoryId?: number;
  accountId?: number;
  limit?: number;
};

const DEFAULT_SEARCH_LIMIT = 200;

// NETWORK-READY: If a backend is added later, replace this with a fetch()
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

