import {
  int,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const accounts = sqliteTable('accounts', {
  id: int('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'Cash' | 'Bank' | 'CreditCard'
  createdAt: int('created_at').notNull(),
});

export const currencies = sqliteTable('currencies', {
  id: int('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(), // 'LKR' | 'USD' | 'GBP' | 'EUR' | 'AUD' | 'USDT'
  name: text('name').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' })
    .notNull()
    .default(false),
  createdAt: int('created_at').notNull(),
});

export const accountBalances = sqliteTable(
  'account_balances',
  {
    id: int('id').primaryKey({ autoIncrement: true }),
    accountId: int('account_id')
      .notNull()
      .references(() => accounts.id),
    currencyId: int('currency_id')
      .notNull()
      .references(() => currencies.id),
    balance: int('balance').notNull().default(0),
  },
  table => ({
    accountCurrencyUnique: uniqueIndex('account_currency_unique').on(
      table.accountId,
      table.currencyId,
    ),
  }),
);

export const categories = sqliteTable('categories', {
  id: int('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  createdAt: int('created_at').notNull(),
});

export const transactions = sqliteTable('transactions', {
  id: int('id').primaryKey({ autoIncrement: true }),
  accountId: int('account_id')
    .notNull()
    .references(() => accounts.id),
  amount: real('amount').notNull(), // positive = income, negative = expense
  categoryId: int('category_id')
    .notNull()
    .references(() => categories.id),
  description: text('description'),
  date: text('date').notNull(), // 'YYYY-MM-DD', enables month/year prefix filtering
  createdAt: int('created_at').notNull(),
});

export const budgets = sqliteTable('budgets', {
  id: int('id').primaryKey({ autoIncrement: true }),
  category: text('category').notNull(),
  limitAmount: real('limit_amount').notNull(),
  period: text('period').notNull(), // 'weekly' | 'monthly' | 'yearly'
  startDate: int('start_date').notNull(),
  month: text('month'), // 'YYYY-MM', set for the overall monthly budget
  createdAt: int('created_at').notNull(),
});

export const categoryBudgets = sqliteTable(
  'category_budgets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    month: text('month').notNull(), // 'YYYY-MM'
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    amount: integer('amount').notNull(),
  },
  table => ({
    monthCategoryUnique: uniqueIndex('month_category_unique').on(
      table.month,
      table.categoryId,
    ),
  }),
);
