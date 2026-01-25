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
  type: text('type').notNull(), // 'Cash' | 'Bank' | 'CreditCard' | 'CryptoWallet' | 'Receivable' | 'Liability'
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
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
  // Marks system-created categories (currently just the reserved "Bank"
  // category used by balance-correction audit entries) so the free-tier
  // category limit can exclude them by flag rather than by matching the
  // name string, which would break the moment someone renames it.
  isSystemReserved: integer('is_system_reserved', { mode: 'boolean' })
    .notNull()
    .default(false),
  createdAt: int('created_at').notNull(),
});

export const transactions = sqliteTable('transactions', {
  id: int('id').primaryKey({ autoIncrement: true }),
  accountId: int('account_id')
    .notNull()
    .references(() => accounts.id),
  amount: real('amount').notNull(), // magnitude only — direction comes from entryType, not the sign of this value
  // Nullable as of this stage — Income entries carry no category at all
  // (a dedicated Income form with no category picker), while every
  // Expense still requires one. Existing rows are untouched by this
  // relaxation; only new Income rows are ever inserted with NULL here.
  categoryId: int('category_id').references(() => categories.id),
  description: text('description'),
  date: text('date').notNull(), // 'YYYY-MM-DD', enables month/year prefix filtering
  entryType: text('entry_type')
    .notNull()
    .default('Expense')
    .$type<'Expense' | 'Income'>(), // existing rows default to 'Expense' on migration (everything before Stage 8 was expense-only)
  // Defaults to 1 (LKR), which is always the first currency inserted by
  // the Stage 7a seeding migration — safe bootstrapping value for
  // pre-Stage-8 rows and for a fresh install (no transactions exist yet
  // at migration time either way, since currencies/transactions are
  // populated after migrations run).
  currencyId: int('currency_id')
    .notNull()
    .references(() => currencies.id)
    .default(1),
  createdAt: int('created_at').notNull(),
});

// One row per Liability/Receivable account. Kept separate from `accounts`
// rather than adding nullable columns there, so ordinary Cash/Bank
// accounts don't carry six permanently-null loan fields.
export const loanDetails = sqliteTable('loan_details', {
  id: int('id').primaryKey({ autoIncrement: true }),
  accountId: int('account_id')
    .notNull()
    .unique() // one loan per account — reactivation updates this row, never inserts a second
    .references(() => accounts.id),
  counterpartyName: text('counterparty_name').notNull(),
  dateCreated: text('date_created').notNull(), // 'YYYY-MM-DD', historical record — never modified after creation/reactivation
  // Where Stage 9b's interest accrual counts from. Starts equal to
  // dateCreated but diverges from it on every settlement, which is why
  // it's a separate column rather than a computation over dateCreated.
  lastAccrualAnchorDate: text('last_accrual_anchor_date').notNull(),
  dueDate: text('due_date'), // 'YYYY-MM-DD', nullable
  // Stored as rate × 100 so it stays an integer — 5.5% is 550. Avoids
  // float rounding drift in Stage 9b's interest math.
  interestRate: int('interest_rate'),
  interestPeriod: text('interest_period').$type<'monthly' | 'annual'>(),
});

// Scaffolded now, unused until Stage 9b's settlement flow — a payment
// moves `amount` between the loan account and the counterpart account.
export const loanPayments = sqliteTable('loan_payments', {
  id: int('id').primaryKey({ autoIncrement: true }),
  loanAccountId: int('loan_account_id')
    .notNull()
    .references(() => accounts.id),
  counterpartAccountId: int('counterpart_account_id')
    .notNull()
    .references(() => accounts.id),
  amount: real('amount').notNull(),
  currencyId: int('currency_id')
    .notNull()
    .references(() => currencies.id),
  date: text('date').notNull(), // 'YYYY-MM-DD'
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

// Singleton row (always id=1) holding app-wide preferences that aren't
// tied to any account/category/etc. Currently just the theme, but shaped
// as a table rather than a one-off key so future app-level settings can
// be added as columns without another migration pattern change.
export const appSettings = sqliteTable('app_settings', {
  id: int('id').primaryKey({ autoIncrement: true }),
  // 'system' follows the device's OS-level light/dark setting; 'light'
  // and 'dark' pin the app regardless of the device setting.
  themeMode: text('theme_mode')
    .notNull()
    .default('system')
    .$type<'light' | 'dark' | 'system'>(),
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
