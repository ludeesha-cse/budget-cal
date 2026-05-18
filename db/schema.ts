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
  // Stage 16a. Opt-out flag for a transaction that's real spending/income
  // but shouldn't count toward budgets or reports — e.g. a reimbursed
  // purchase, or a one-off gift that would otherwise blow out a monthly
  // total. Existing rows default to false on migration (nothing before
  // this stage was ever excludable, so nothing should silently vanish
  // from a budget it was already counted in). Deliberately NOT the same
  // thing as deleting or hiding a transaction — it still shows up in
  // History and can still be searched/tagged; only the budget-facing
  // aggregates (getMonthlyTotal, getMonthlyIncome, getCategorySpent, and
  // Stage 16a's own report queries) ever look at this column.
  excludeFromBudget: integer('exclude_from_budget', { mode: 'boolean' })
    .notNull()
    .default(false),
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
  // Which entry of theme/palettes.ts's PALETTES array is active — decoupled
  // from themeMode on purpose, since "light vs dark" and "which color
  // scheme" are independent choices (a future palette might itself only
  // define a light variant, or the user might want the same palette's
  // light/dark pairing regardless of which color theme they picked).
  // Free-text rather than a $type union, since PALETTES is meant to grow
  // over time without a schema migration for every new entry — an
  // unrecognized value just falls back to the default palette (see
  // contexts/ThemeContext.tsx).
  paletteId: text('palette_id').notNull().default('ledger'),
});

// One row per payoff payment against a credit card. Deliberately separate
// from `transactions` — a payoff is money moving between two accounts
// you already own, not a purchase, so it must never carry a category or
// count toward a budget the way a real Expense would (the spending was
// already recorded as an Expense when it happened; recording the payoff
// too would double-count it).
export const creditCardPayoffs = sqliteTable('credit_card_payoffs', {
  id: int('id').primaryKey({ autoIncrement: true }),
  creditCardAccountId: int('credit_card_account_id')
    .notNull()
    .references(() => accounts.id),
  payingAccountId: int('paying_account_id')
    .notNull()
    .references(() => accounts.id),
  amount: real('amount').notNull(),
  currencyId: int('currency_id')
    .notNull()
    .references(() => currencies.id),
  date: text('date').notNull(), // 'YYYY-MM-DD'
  createdAt: int('created_at').notNull(),
});

// One row per account-to-account transfer. Deliberately separate from
// `transactions` — moving money between two accounts you already own is
// neither spending (Expense) nor income (Income), so it must never carry
// a category or count toward a budget. Same shape/reasoning as
// `creditCardPayoffs` above; both are "money movement" events rather
// than transactions, and both get merged into the History list display
// without affecting spending totals.
export const transfers = sqliteTable('transfers', {
  id: int('id').primaryKey({ autoIncrement: true }),
  fromAccountId: int('from_account_id')
    .notNull()
    .references(() => accounts.id),
  toAccountId: int('to_account_id')
    .notNull()
    .references(() => accounts.id),
  amount: real('amount').notNull(),
  currencyId: int('currency_id')
    .notNull()
    .references(() => currencies.id),
  date: text('date').notNull(), // 'YYYY-MM-DD'
  createdAt: int('created_at').notNull(),
});

// One row per installment plan (Stage 12a: schedule only, no payment
// tracking yet — that's Stage 12b). Both principalAmount and
// interestRate are nullable because a plan created in "Mode B" (a fixed
// monthly amount the user already knows, e.g. a phone installment plan)
// never has either value — there's no principal/rate to derive the
// schedule from, only a monthly figure and a count. monthlyAmount,
// finalInstallmentAmount, and totalRepayable are computed once at
// creation time by utils/installmentMath.ts and stored here rather than
// recomputed on every read, so an existing plan's numbers never drift if
// the calculation itself changes later — the schedule a user agreed to
// is exactly the schedule that stays on screen.
export const installmentPlans = sqliteTable('installment_plans', {
  id: int('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  principalAmount: int('principal_amount'), // nullable — only set for Mode A (principal + rate) plans
  interestRate: int('interest_rate'), // nullable, rate × 100 (10% is 1000) — same convention as loan_details.interestRate
  numberOfMonths: int('number_of_months').notNull(),
  monthlyAmount: int('monthly_amount').notNull(),
  finalInstallmentAmount: int('final_installment_amount').notNull(),
  totalRepayable: int('total_repayable').notNull(),
  categoryId: int('category_id')
    .notNull()
    .references(() => categories.id),
  currencyId: int('currency_id')
    .notNull()
    .references(() => currencies.id),
  startDate: text('start_date').notNull(), // 'YYYY-MM-DD'
  // Nullable — a plan created before this column existed, or one the user
  // never bothered setting a due date for, simply never surfaces as a
  // Dashboard reminder (see getInstallmentReminders). 1-31, same
  // clamp-to-shorter-month convention as recurring_rules.dayOfMonth: a
  // plan due on the 31st still fires on the last real day of a 30-day
  // month rather than being skipped.
  dueDayOfMonth: int('due_day_of_month'),
  createdAt: int('created_at').notNull(),
});

// One row per installment actually paid against a plan (Stage 12b).
// Deliberately references a real `transactions` row (unlike
// creditCardPayoffs/transfers/loanPayments above) — an installment
// payment IS genuine spending against the plan's category and currency,
// so it must show up in History, count toward the category's budget, and
// move the paying account's balance the normal way. This table exists
// only to track WHICH installment number a given transaction paid off,
// so the schedule can be ticked off and reversed without guessing from
// the transaction row alone. The unique index is the enforcement
// mechanism for "the same installment can never be recorded twice" —
// relying on application logic alone would leave a window for a race or
// a bug to double-book installment 3, say.
export const installmentPayments = sqliteTable(
  'installment_payments',
  {
    id: int('id').primaryKey({ autoIncrement: true }),
    installmentPlanId: int('installment_plan_id')
      .notNull()
      .references(() => installmentPlans.id),
    installmentNumber: int('installment_number').notNull(), // 1-based
    accountId: int('account_id')
      .notNull()
      .references(() => accounts.id), // the paying account chosen at tick-off
    transactionId: int('transaction_id')
      .notNull()
      .references(() => transactions.id),
    paidDate: text('paid_date').notNull(), // 'YYYY-MM-DD'
    createdAt: int('created_at').notNull(),
  },
  table => ({
    planInstallmentUnique: uniqueIndex('plan_installment_unique').on(
      table.installmentPlanId,
      table.installmentNumber,
    ),
  }),
);

// One row per recurring rule (Stage 13a: schedule/template only — no
// occurrence generation and no transactions created from it yet, that's
// Stage 13b). amount is a DEFAULT suggestion rather than a locked value
// — once occurrences exist, each one will be editable independently of
// this row. categoryId is nullable for the same reason
// transactions.categoryId is: an Income rule carries no category at all,
// matching the dedicated Income tab having no category picker anywhere
// in it. dayOfMonth allows 29-31 even though not every month has that
// many days — Stage 13b's occurrence generation is what clamps to a
// shorter month's last day, not this table.
export const recurringRules = sqliteTable('recurring_rules', {
  id: int('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  ruleType: text('rule_type').notNull().$type<'Income' | 'Expense'>(),
  amount: int('amount').notNull(), // a default suggestion — editable per occurrence once Stage 13b exists
  dayOfMonth: int('day_of_month').notNull(), // 1-31
  categoryId: int('category_id').references(() => categories.id), // nullable — Income rules carry no category
  accountId: int('account_id')
    .notNull()
    .references(() => accounts.id),
  currencyId: int('currency_id')
    .notNull()
    .references(() => currencies.id),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: int('created_at').notNull(),
});

// One row per calendar-month firing of a recurring rule (Stage 13b).
// Deliberately its own row per due date, generated ahead of time and
// left 'pending' until a human confirms or skips it — nothing here ever
// becomes a real transaction on its own. transactionId/confirmedAmount
// are only ever set together, at confirm time; confirmedAmount can
// differ from the rule's amount (the whole point of prompting instead
// of auto-posting is letting the user edit it first). The unique index
// on (recurringRuleId, dueDate) is what makes generatePendingOccurrences
// safely re-runnable on every app open — regenerating an already-seen
// due date is a no-op insert conflict, never a duplicate row.
export const recurringOccurrences = sqliteTable(
  'recurring_occurrences',
  {
    id: int('id').primaryKey({ autoIncrement: true }),
    recurringRuleId: int('recurring_rule_id')
      .notNull()
      .references(() => recurringRules.id),
    dueDate: text('due_date').notNull(), // 'YYYY-MM-DD', already clamped to the firing month's last day if needed
    status: text('status')
      .notNull()
      .default('pending')
      .$type<'pending' | 'confirmed' | 'skipped'>(),
    transactionId: int('transaction_id').references(() => transactions.id), // set only on confirm
    confirmedAmount: int('confirmed_amount'), // set only on confirm — may differ from the rule's default amount
    resolvedAt: text('resolved_at'), // 'YYYY-MM-DD', set on confirm or skip; null while pending
  },
  table => ({
    ruleDueDateUnique: uniqueIndex('rule_due_date_unique').on(
      table.recurringRuleId,
      table.dueDate,
    ),
  }),
);

// One row per savings goal (Stage 14). Deliberately has NO accountId and
// NO currencyId link to any real money movement beyond its own display
// currency — a goal (and its contributions below) is a log of intent,
// never a payment. status defaults to 'active' and is changed in place
// (never deleted-and-recreated) so "what was this goal for and did I
// reach it" survives even once it's done, the same
// deactivate-don't-delete philosophy recurringRules already uses.
export const savingsGoals = sqliteTable('savings_goals', {
  id: int('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  targetAmount: int('target_amount').notNull(),
  currencyId: int('currency_id')
    .notNull()
    .references(() => currencies.id),
  targetDate: text('target_date'), // 'YYYY-MM-DD', nullable — a goal doesn't have to have a deadline
  status: text('status')
    .notNull()
    .default('active')
    .$type<'active' | 'achieved' | 'abandoned'>(),
  createdAt: int('created_at').notNull(),
});

// One row per logged contribution toward a savings goal (Stage 14).
// CRITICAL: this table is never joined against accounts or
// account_balances, and addContribution (db/queries.ts) never inserts
// into `transactions` — a contribution records that the user has
// mentally set money aside, not that money moved anywhere. The real
// money backing a goal already sits in whatever real account it's in;
// this table exists purely so progress toward the target can be shown.
export const savingsContributions = sqliteTable('savings_contributions', {
  id: int('id').primaryKey({ autoIncrement: true }),
  savingsGoalId: int('savings_goal_id')
    .notNull()
    .references(() => savingsGoals.id),
  amount: int('amount').notNull(),
  date: text('date').notNull(), // 'YYYY-MM-DD'
  note: text('note'),
  createdAt: int('created_at').notNull(),
});

// One row per tag (Stage 15). name is unique the same way categories.name
// is — tags are a flat, user-managed vocabulary, not a hierarchy.
export const tags = sqliteTable('tags', {
  id: int('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  createdAt: int('created_at').notNull(),
});

// Join table between transactions and tags (Stage 15), many-to-many. The
// unique index on (transactionId, tagId) is what stops the same tag being
// applied twice to one transaction — setTransactionTags (db/queries.ts)
// also just deletes-and-reinserts the full set per transaction, so this
// index is mostly a safety net against a bug rather than something the
// app relies on to dedupe by itself. Deliberately no onDelete: 'cascade'
// on either FK — deleteTag (db/queries.ts) removes only the matching rows
// here, by hand, and must never be able to take a transaction down with
// it via a stray cascade.
export const transactionTags = sqliteTable(
  'transaction_tags',
  {
    id: int('id').primaryKey({ autoIncrement: true }),
    transactionId: int('transaction_id')
      .notNull()
      .references(() => transactions.id),
    tagId: int('tag_id')
      .notNull()
      .references(() => tags.id),
  },
  table => ({
    transactionTagUnique: uniqueIndex('transaction_tag_unique').on(
      table.transactionId,
      table.tagId,
    ),
  }),
);

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
