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
  // Whether this currency should appear in any picker/tab list across the
  // app (budgets, transactions, transfers, loans, installments, savings
  // goals, reports, ...) — getActiveCurrencies() is what every one of
  // those reads from, never this table directly. Defaults to true so
  // every currency that already existed before this column was added
  // (the six DEFAULT_CURRENCIES seeded in db/index.ts, plus anything a
  // user added by hand) keeps showing up exactly as it did before —
  // nothing silently disappears on migration; users opt OUT per currency
  // from the Currencies screen instead. The default currency itself can
  // never be set inactive (see setCurrencyActive's guard) — the app
  // always needs at least one usable currency.
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
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
  // The real account this loan's money most recently moved through —
  // the one credited when a Liability was borrowed, or debited when a
  // Receivable was lent. Stored (rather than re-derived) because EDITING
  // a loan has to put the old amount back where it came from before
  // applying the new one, and nothing else in the schema remembers where
  // that was. Nullable purely for loans that pre-date this column: their
  // backfilled origination row has no counterpart either, so an edit on
  // one of them applies the new amount forward without a reversal it
  // cannot compute. Kept in sync by createLoanAccount,
  // reactivateLoanAccount, topUpLoanAccount and updateLoanAccount.
  counterpartAccountId: int('counterpart_account_id').references(
    () => accounts.id,
  ),
});

// The other half of the loan ledger from loanPayments below: a payment
// records money flowing BACK across the loan edge, this records it
// flowing out in the first place — borrowing (money in) and lending
// (money out), plus every later top-up of an already-open loan.
//
// WHY A ROW AT ALL, given createLoanAccount already moves both balances:
// History is a list of money-movement events, and "borrowed LKR 6,000
// from Hasindu" is exactly such an event. Before this table the opening
// of a loan was the one movement in the app that left no trace in
// History at all — the balances simply changed between one visit and the
// next. It is deliberately NOT a `transactions` row: a loan is not
// income and not spending, so it must never reach a budget or a
// category report (same reasoning as transfers, credit-card payoffs and
// loan payments, all of which have their own table for the same reason).
export const loanOriginations = sqliteTable('loan_originations', {
  id: int('id').primaryKey({ autoIncrement: true }),
  loanAccountId: int('loan_account_id')
    .notNull()
    .references(() => accounts.id),
  // Nullable only for rows backfilled by migration 0027 from loans that
  // existed before this table — nothing recorded which account their
  // principal came from or went to. Every row written from here on has
  // it set.
  counterpartAccountId: int('counterpart_account_id').references(
    () => accounts.id,
  ),
  amount: real('amount').notNull(),
  currencyId: int('currency_id')
    .notNull()
    .references(() => currencies.id),
  date: text('date').notNull(), // 'YYYY-MM-DD'
  createdAt: int('created_at').notNull(),
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

export const budgets = sqliteTable(
  'budgets',
  {
    id: int('id').primaryKey({ autoIncrement: true }),
    category: text('category').notNull(),
    limitAmount: real('limit_amount').notNull(),
    period: text('period').notNull(), // 'weekly' | 'monthly' | 'yearly'
    startDate: int('start_date').notNull(),
    month: text('month'), // 'YYYY-MM', set for the overall monthly budget
    // Multi-currency budgets: one overall budget row per (month, currency)
    // rather than one per month — a household spending in both LKR and
    // USD needs its own budget (and its own "amount spent") per currency,
    // since currency amounts are never summed together anywhere else in
    // this app either (see utils/currencyTotals.ts). Defaults to 1 (LKR,
    // always the first seeded currency) for the same reason
    // transactions.currencyId defaults to 1 below — every budget row that
    // existed before this column was added is backfilled to that default
    // by SQLite's ALTER TABLE ... DEFAULT, so pre-migration budgets keep
    // behaving exactly as they did when there was only ever one currency
    // in play.
    currencyId: int('currency_id')
      .notNull()
      .references(() => currencies.id)
      .default(1),
    createdAt: int('created_at').notNull(),
  },
  table => ({
    monthCurrencyUnique: uniqueIndex('budget_month_currency_unique').on(
      table.month,
      table.currencyId,
    ),
  }),
);

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

// One-time, first-launch bookkeeping — deliberately its own table rather
// than two more columns on app_settings, because these are not
// preferences: app_settings holds things the user can go back and change
// whenever they like (theme, palette), while these two are one-way
// latches that flip once during first launch and are never meant to be
// flipped back from the UI. Keeping them apart means nothing in the
// Settings screens can accidentally write to them, and a future "reset
// onboarding" debug affordance has an obvious single row to clear.
//
// Singleton, exactly like app_settings (always exactly one row, seeded by
// seedAppMeta() in db/index.ts). Both flags default false so a genuinely
// fresh install starts at the beginning of the flow; they are stored
// separately (rather than one "setupStep" integer) so a partial first
// session — onboarding finished, app killed before the currency screen —
// resumes at the currency screen instead of replaying the carousel. See
// App.tsx's RootFlow for the decision that reads them.
export const appMeta = sqliteTable('app_meta', {
  id: int('id').primaryKey({ autoIncrement: true }),
  onboardingCompleted: integer('onboarding_completed', { mode: 'boolean' })
    .notNull()
    .default(false),
  defaultCurrencyConfirmed: integer('default_currency_confirmed', {
    mode: 'boolean',
  })
    .notNull()
    .default(false),
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
  // THE FROM SIDE. `amount` and `currencyId` kept their original names
  // rather than being renamed to from_amount/from_currency_id when the
  // cross-currency stage added the to-side below: renaming a column in
  // SQLite means a full table rebuild, and every existing row's meaning
  // is unchanged either way (before the to-side existed, a transfer was
  // same-currency by definition, so its single amount/currency WAS its
  // from side). Read them as fromAmount/fromCurrencyId — the query layer
  // exposes them under those names.
  amount: real('amount').notNull(),
  currencyId: int('currency_id')
    .notNull()
    .references(() => currencies.id),
  // THE TO SIDE. Nullable in SQL only because SQLite cannot add a
  // NOT NULL column to a populated table without a constant default,
  // and there is no constant that means "whatever this row's from side
  // says". Migration 0029 backfills both from the from-side columns
  // immediately after adding them, so no row is ever actually left with
  // a NULL here; every read still goes through `toCurrencyId ??
  // currencyId` / `toAmount ?? amount` so a database restored from an
  // older backup behaves identically to a migrated one.
  //
  // For a same-currency transfer these equal the from side. For a
  // converted one (100 USD out, 34,000 LKR in) they are the other half
  // of the pair, and the two amounts are NOT derived from each other at
  // read time: the rate a person actually agreed to is stored, so
  // editing the app's exchange-rate constants later never rewrites what
  // a past transfer says it moved.
  toCurrencyId: int('to_currency_id').references(() => currencies.id),
  toAmount: real('to_amount'),
  // Free text on a transfer. Ordinary transfers may leave it null; a
  // savings transfer (see createSavingsTransfer) always sets it to the
  // goal's name, which is what makes the goal identifiable in History
  // without History having to know savings goals exist.
  description: text('description'),
  date: text('date').notNull(), // 'YYYY-MM-DD'
  createdAt: int('created_at').notNull(),
});

// One row per currency, holding how much of the ANCHOR currency one unit
// of it is worth ("units per anchor"): with LKR as the anchor, LKR is
// 1 and USD is 340, meaning 1 USD = 340 LKR. Any pair is then
// rate(from) / rate(to) — 6 currencies need 6 numbers rather than 30
// pairwise ones, and a new currency only ever needs its own.
//
// Deliberately a table rather than constants alone: config/exchangeRates.ts
// ships the defaults and seeds this table on first run, but a bank rate
// is a moving local fact, so the Exchange Rates settings screen writes
// user overrides here. `isCustom` records whether a row has been edited
// away from its shipped default, which is the only thing "Reset to
// default" needs to know.
//
// This table is NEVER read to display or recompute a past transfer. It
// only ever pre-fills the converted amount in a form, which the user can
// then overwrite (see the to-side comment on `transfers` above).
export const exchangeRates = sqliteTable('exchange_rates', {
  id: int('id').primaryKey({ autoIncrement: true }),
  currencyId: int('currency_id')
    .notNull()
    .unique()
    .references(() => currencies.id),
  // How many anchor units one unit of this currency is worth. real, not
  // int: a rate is genuinely fractional (1 LKR = 0.00294 USD) and there
  // is no scaling convention that survives both directions of a pair.
  ratePerAnchor: real('rate_per_anchor').notNull(),
  isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),
  updatedAt: int('updated_at').notNull(),
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

// One row per SCHEDULED installment — the "this one has come due, deal
// with it" prompt — as opposed to installmentPayments above, which is
// the record of one actually having been PAID. The two are deliberately
// separate tables: a payment is a ledger fact with a real transaction
// behind it, an occurrence is a reminder that can also be skipped
// without any money moving at all.
//
// LAZY, NOT UPFRONT: a 12-month plan does NOT get twelve rows at
// creation. Exactly one row (installmentNumber 1) is written when the
// plan is created, and each resolution — paid or skipped — is what opens
// the door to the next month's single row (see
// advanceInstallmentSchedule in db/queries/installments.ts). So this
// table only ever holds installments that have actually come around, and
// a plan the user abandons simply stops generating rows instead of
// leaving eleven future reminders behind to be cleaned up.
//
// THE SHAPE MATCHES recurring_occurrences BELOW ON PURPOSE
// (dueDate / status / resolvedAt), because the Dashboard merges both
// into one pending list (getPendingScheduledPayments). That unification
// happens at the QUERY layer only — the two tables stay separate rather
// than one table growing a nullable dual foreign key that would be
// half-null on every row and could never be constrained to exactly one
// parent.
export const installmentOccurrences = sqliteTable(
  'installment_occurrences',
  {
    id: int('id').primaryKey({ autoIncrement: true }),
    installmentPlanId: int('installment_plan_id')
      .notNull()
      .references(() => installmentPlans.id),
    installmentNumber: int('installment_number').notNull(), // 1-based, same numbering as installmentPayments
    dueDate: text('due_date').notNull(), // 'YYYY-MM-DD', already clamped to a shorter month's last day if needed
    status: text('status')
      .notNull()
      .default('pending')
      .$type<'pending' | 'paid' | 'skipped'>(),
    // Set only when status is 'paid': the installment_payments row (and
    // through it the real transaction) that resolved this occurrence.
    // Null while pending, and null forever on a skip, since skipping
    // creates no payment at all.
    installmentPaymentId: int('installment_payment_id').references(
      () => installmentPayments.id,
    ),
    resolvedAt: text('resolved_at'), // 'YYYY-MM-DD', set on pay or skip; null while pending
  },
  table => ({
    // The same guard recurring_occurrences' own unique index provides:
    // one occurrence per installment number per plan, so a double-tap on
    // Pay — or advanceInstallmentSchedule running twice for the same
    // number — can never schedule the same installment twice.
    planOccurrenceUnique: uniqueIndex('plan_occurrence_unique').on(
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

// One row per savings goal. status defaults to 'active' and is changed
// in place (never deleted-and-recreated) so "what was this goal for and
// did I reach it" survives even once it's done, the same
// deactivate-don't-delete philosophy recurringRules already uses.
//
// HISTORY, BECAUSE IT REVERSES ITSELF: when goals were first built they
// deliberately had NO account link — a goal was a log of intent and its
// contributions moved no money at all. That is no longer true. A goal
// now names a real account it saves INTO, contributions are created only
// as the by-product of a real transfer into that account, and a goal's
// saved figure can never exceed what that account actually holds. If you
// find a comment anywhere still describing contributions as
// "intent, never a payment", it predates this stage and is wrong.
export const savingsGoals = sqliteTable('savings_goals', {
  id: int('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  targetAmount: int('target_amount').notNull(),
  currencyId: int('currency_id')
    .notNull()
    .references(() => currencies.id),
  // The real account this goal's money sits in. Required by the app
  // (createSavingsGoal rejects a goal without one) but nullable in SQL,
  // for the same SQLite reason as transfers.toCurrencyId above: there is
  // no constant default that means "the right account for this
  // particular goal". backfillSavingsGoalAccounts() in db/index.ts
  // assigns one to every pre-existing goal on the upgrade launch, and a
  // goal that somehow still has none renders as needing attention rather
  // than silently reading zero.
  accountId: int('account_id').references(() => accounts.id),
  targetDate: text('target_date'), // 'YYYY-MM-DD', nullable — a goal doesn't have to have a deadline
  status: text('status')
    .notNull()
    .default('active')
    .$type<'active' | 'achieved' | 'abandoned'>(),
  createdAt: int('created_at').notNull(),
});

// One row per contribution toward a savings goal — now always the
// by-product of a real transfer into the goal's account, never a
// free-standing "I mentally set this aside" entry. createSavingsTransfer
// is the only function that writes one, and it writes the transfer and
// this row inside the same DB transaction.
//
// TWO THINGS THIS TABLE IS NOT:
// 1. It is not the goal's displayed progress. Summing these rows gives
//    the RAW contributed figure; what a goal actually shows is that
//    total capped by what the goal's account holds (see
//    allocateGoalSavings in utils/savingsMath.ts). Spending the money
//    out of the account lowers the goal without touching a single row
//    here, which is the whole point of deriving the cap instead of
//    writing it down.
// 2. It is not a second copy of the money movement. The transfer row is
//    the money; this row is the earmark pointing at it.
export const savingsContributions = sqliteTable(
  'savings_contributions',
  {
    id: int('id').primaryKey({ autoIncrement: true }),
    savingsGoalId: int('savings_goal_id')
      .notNull()
      .references(() => savingsGoals.id),
    amount: int('amount').notNull(),
    date: text('date').notNull(), // 'YYYY-MM-DD'
    note: text('note'),
    // The transfer that put this money into the goal's account. Nullable
    // for exactly one reason: contributions logged before this stage
    // existed have no transfer behind them. Those legacy rows still
    // count toward the goal and can still be deleted on their own; every
    // NEW row has a transfer, and deleting or editing that transfer
    // carries this row with it (see deleteTransfer/updateTransfer), so
    // History and goal progress can never disagree about money that
    // moved.
    transferId: int('transfer_id').references(() => transfers.id),
    createdAt: int('created_at').notNull(),
  },
  table => ({
    // One transfer backs at most one contribution. Enforced here rather
    // than in application code alone so a retry or a future second
    // caller cannot credit the same transfer to a goal twice.
    contributionTransferUnique: uniqueIndex('contribution_transfer_unique').on(
      table.transferId,
    ),
  }),
);

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
    // Same reasoning as budgets.currencyId above — a category budget is
    // scoped to one currency, so the same category can carry independent
    // budgets per currency in the same month (e.g. Food: 1000 LKR and
    // Food: 10 USD are two separate rows, not one mixed figure). Defaults
    // to 1 (LKR) to match every other currencyId column's convention.
    currencyId: integer('currency_id')
      .notNull()
      .references(() => currencies.id)
      .default(1),
  },
  table => ({
    monthCategoryCurrencyUnique: uniqueIndex(
      'month_category_currency_unique',
    ).on(table.month, table.categoryId, table.currencyId),
  }),
);
