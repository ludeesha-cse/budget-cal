// Every TanStack Query key used in this app, in one factory.
//
// Two things depend on the shape of these keys, so neither is optional:
//
// 1. The FIRST segment is the caching category ('transactional' or
//    'reference'). db/queryClient.ts attaches that category's staleTime
//    and gcTime to the prefix, which is how the two rules in
//    db/queryConfig.ts get applied without any hook repeating a number.
//    Putting a key under the wrong root silently gives it the wrong
//    staleness tolerance — that choice is the point of the split.
//
// 2. Keys are hierarchical, so a mutation can invalidate a whole area
//    with one prefix (`transactions.all` covers every month, year and
//    search variant) instead of trying to enumerate the exact variants
//    currently mounted. Under-invalidating shows a stale number on
//    screen; over-invalidating costs one redundant read. The prefixes
//    below exist so the exhaustive option is also the easy one.
//
// Nothing here caches a pure calculation over data that is already
// cached — installment schedule previews, interest math and net-worth
// aggregation stay plain functions over the rows these keys hold. Only
// real database reads get a key.

const TRANSACTIONAL = 'transactional';
const REFERENCE = 'reference';

export const queryKeys = {
  reference: {
    all: [REFERENCE] as const,

    accounts: {
      all: [REFERENCE, 'accounts'] as const,
      // The account roster: names, types, active flags. NOT balances —
      // those move on every transaction and live under transactional.
      list: [REFERENCE, 'accounts', 'list'] as const,
      activeCountByType: (type: string) =>
        [REFERENCE, 'accounts', 'activeCountByType', type] as const,
    },

    categories: {
      all: [REFERENCE, 'categories'] as const,
      list: [REFERENCE, 'categories', 'list'] as const,
      userCount: [REFERENCE, 'categories', 'userCount'] as const,
    },

    tags: {
      all: [REFERENCE, 'tags'] as const,
      list: [REFERENCE, 'tags', 'list'] as const,
    },

    currencies: {
      all: [REFERENCE, 'currencies'] as const,
      list: [REFERENCE, 'currencies', 'list'] as const,
      active: [REFERENCE, 'currencies', 'active'] as const,
      default: [REFERENCE, 'currencies', 'default'] as const,
      // Derived straight from the currencies table (default first), so
      // it changes when currencies change, never when a budget changes.
      budgetOptions: [REFERENCE, 'currencies', 'budgetOptions'] as const,
    },

    settings: {
      all: [REFERENCE, 'settings'] as const,
      appMeta: [REFERENCE, 'settings', 'appMeta'] as const,
    },

    // Reference, not transactional: an exchange rate is a setting the
    // user types in, not a figure derived from their money. It changes
    // only when they change it, and nothing that moves money can move
    // it — which is exactly the reference rule. Note that a rate change
    // deliberately does NOT invalidate any balance or transfer: past
    // transfers store the amounts that were actually agreed and are
    // never recomputed from a rate (see db/schema.ts on transfers).
    exchangeRates: {
      all: [REFERENCE, 'exchangeRates'] as const,
      list: [REFERENCE, 'exchangeRates', 'list'] as const,
      // Just the usable (currencyId, ratePerAnchor) pairs the transfer
      // form converts with — a narrower read than `list`, which also has
      // to carry rate-less currencies so they can be given a rate.
      usable: [REFERENCE, 'exchangeRates', 'usable'] as const,
    },
  },

  transactional: {
    all: [TRANSACTIONAL] as const,

    transactions: {
      all: [TRANSACTIONAL, 'transactions'] as const,
      list: [TRANSACTIONAL, 'transactions', 'list'] as const,
      byMonth: (month: string) =>
        [TRANSACTIONAL, 'transactions', 'byMonth', month] as const,
      byYear: (year: string) =>
        [TRANSACTIONAL, 'transactions', 'byYear', year] as const,
      byId: (id: number) =>
        [TRANSACTIONAL, 'transactions', 'byId', id] as const,
      search: (query: string | undefined, tagIds: number[] | undefined) =>
        [TRANSACTIONAL, 'transactions', 'search', query ?? '', tagIds ?? []] as const,
      expensesByType: (month: string, currencyId: number) =>
        [TRANSACTIONAL, 'transactions', 'expensesByType', month, currencyId] as const,
      expenseCurrencies: (month: string) =>
        [TRANSACTIONAL, 'transactions', 'expenseCurrencies', month] as const,
      monthlyTotal: (month: string, currencyId: number) =>
        [TRANSACTIONAL, 'transactions', 'monthlyTotal', month, currencyId] as const,
      monthlyIncome: (month: string, currencyId: number) =>
        [TRANSACTIONAL, 'transactions', 'monthlyIncome', month, currencyId] as const,
      // Which tags are ON a given transaction — an attribute of that
      // transaction, so it moves when the transaction is edited. The tag
      // roster itself is reference.tags.list.
      tagsFor: (transactionId: number) =>
        [TRANSACTIONAL, 'transactions', 'tagsFor', transactionId] as const,
    },

    balances: {
      all: [TRANSACTIONAL, 'balances'] as const,
      // One batched read of every account's every currency balance,
      // current balance included (see getAllAccountBalances).
      allAccounts: [TRANSACTIONAL, 'balances', 'allAccounts'] as const,
      forAccount: (accountId: number) =>
        [TRANSACTIONAL, 'balances', 'forAccount', accountId] as const,
      accountBalance: (accountId: number, currencyId: number) =>
        [TRANSACTIONAL, 'balances', 'accountBalance', accountId, currencyId] as const,
      netSpent: (accountId: number, currencyId: number) =>
        [TRANSACTIONAL, 'balances', 'netSpent', accountId, currencyId] as const,
      isZeroEverywhere: (accountId: number) =>
        [TRANSACTIONAL, 'balances', 'isZeroEverywhere', accountId] as const,
    },

    budgets: {
      all: [TRANSACTIONAL, 'budgets'] as const,
      forMonth: (month: string, currencyId: number) =>
        [TRANSACTIONAL, 'budgets', 'forMonth', month, currencyId] as const,
      monthList: (month: string) =>
        [TRANSACTIONAL, 'budgets', 'monthList', month] as const,
      allForCurrency: (currencyId: number) =>
        [TRANSACTIONAL, 'budgets', 'allForCurrency', currencyId] as const,
    },

    categoryBudgets: {
      all: [TRANSACTIONAL, 'categoryBudgets'] as const,
      forMonth: (month: string, currencyId: number) =>
        [TRANSACTIONAL, 'categoryBudgets', 'forMonth', month, currencyId] as const,
      single: (month: string, categoryId: number, currencyId: number) =>
        [TRANSACTIONAL, 'categoryBudgets', 'single', month, categoryId, currencyId] as const,
    },

    creditCards: {
      all: [TRANSACTIONAL, 'creditCards'] as const,
      totalDebt: [TRANSACTIONAL, 'creditCards', 'totalDebt'] as const,
      debt: (accountId: number, currencyId: number) =>
        [TRANSACTIONAL, 'creditCards', 'debt', accountId, currencyId] as const,
    },

    loans: {
      all: [TRANSACTIONAL, 'loans'] as const,
      active: (type: string) =>
        [TRANSACTIONAL, 'loans', 'active', type] as const,
      inactive: (type: string) =>
        [TRANSACTIONAL, 'loans', 'inactive', type] as const,
      // One loan's own live position (principal + interest accrued as of
      // `asOf`) — this is the "that loan's own detail query" a settlement
      // has to invalidate.
      totalOwed: (accountId: number, asOf: string) =>
        [TRANSACTIONAL, 'loans', 'totalOwed', accountId, asOf] as const,
      paymentsByMonth: (month: string) =>
        [TRANSACTIONAL, 'loans', 'paymentsByMonth', month] as const,
      paymentsByYear: (year: string) =>
        [TRANSACTIONAL, 'loans', 'paymentsByYear', year] as const,
      // The other side of the same ledger: when the money was handed
      // over, rather than paid back. Same month/year slicing as the
      // payment keys above so History can invalidate both by the shared
      // `loans` prefix.
      originationsByMonth: (month: string) =>
        [TRANSACTIONAL, 'loans', 'originationsByMonth', month] as const,
      originationsByYear: (year: string) =>
        [TRANSACTIONAL, 'loans', 'originationsByYear', year] as const,
    },

    installments: {
      all: [TRANSACTIONAL, 'installments'] as const,
      plans: [TRANSACTIONAL, 'installments', 'plans'] as const,
      payments: (planId: number) =>
        [TRANSACTIONAL, 'installments', 'payments', planId] as const,
      reminders: [TRANSACTIONAL, 'installments', 'reminders'] as const,
      nextUnpaidNumber: (planId: number) =>
        [TRANSACTIONAL, 'installments', 'nextUnpaidNumber', planId] as const,
      remainingBalance: (currencyId: number) =>
        [TRANSACTIONAL, 'installments', 'remainingBalance', currencyId] as const,
      // Lazily-scheduled installment occurrences. Under the installments
      // prefix (not their own root) so every write that already
      // invalidates a plan or a payment reaches them too — paying an
      // installment is precisely what resolves one occurrence and
      // creates the next.
      pendingOccurrences: [TRANSACTIONAL, 'installments', 'pendingOccurrences'] as const,
      occurrenceHistory: (planId: number) =>
        [TRANSACTIONAL, 'installments', 'occurrenceHistory', planId] as const,
    },

    recurring: {
      all: [TRANSACTIONAL, 'recurring'] as const,
      rules: (activeOnly: boolean) =>
        [TRANSACTIONAL, 'recurring', 'rules', activeOnly] as const,
      pendingOccurrences: [TRANSACTIONAL, 'recurring', 'pendingOccurrences'] as const,
      occurrenceHistory: (ruleId: number) =>
        [TRANSACTIONAL, 'recurring', 'occurrenceHistory', ruleId] as const,
    },

    // The merged pending list the Dashboard banner and the review screen
    // read (getPendingScheduledPayments). It has its own root rather
    // than living under `recurring` or `installments` because it is
    // downstream of BOTH: no single existing prefix covers it, so
    // hooks/queries/invalidation.ts names it explicitly on every write
    // that can move either half. Putting it under one of the two would
    // have made the other half's writes silently miss it.
    scheduled: {
      all: [TRANSACTIONAL, 'scheduled'] as const,
      pending: [TRANSACTIONAL, 'scheduled', 'pending'] as const,
    },

    savingsGoals: {
      all: [TRANSACTIONAL, 'savingsGoals'] as const,
      list: [TRANSACTIONAL, 'savingsGoals', 'list'] as const,
      contributions: (savingsGoalId: number) =>
        [TRANSACTIONAL, 'savingsGoals', 'contributions', savingsGoalId] as const,
      // Which goals would be destroyed by closing an account. Under the
      // transactional root because it moves when a goal is created,
      // deleted or repointed, not when the account roster changes.
      forAccount: (accountId: number) =>
        [TRANSACTIONAL, 'savingsGoals', 'forAccount', accountId] as const,
    },

    transfers: {
      all: [TRANSACTIONAL, 'transfers'] as const,
      byMonth: (month: string) =>
        [TRANSACTIONAL, 'transfers', 'byMonth', month] as const,
      byYear: (year: string) =>
        [TRANSACTIONAL, 'transfers', 'byYear', year] as const,
      transferableAccounts: (currencyId: number | undefined) =>
        [TRANSACTIONAL, 'transfers', 'transferableAccounts', currencyId ?? null] as const,
    },

    reports: {
      all: [TRANSACTIONAL, 'reports'] as const,
      summary: (
        startDate: string,
        endDate: string,
        currencyId: number,
        includeExcluded: boolean,
      ) =>
        [TRANSACTIONAL, 'reports', 'summary', startDate, endDate, currencyId, includeExcluded] as const,
      spendingByCategory: (
        startDate: string,
        endDate: string,
        currencyId: number,
        includeExcluded: boolean,
      ) =>
        [TRANSACTIONAL, 'reports', 'spendingByCategory', startDate, endDate, currencyId, includeExcluded] as const,
      spendingByAccountType: (
        startDate: string,
        endDate: string,
        currencyId: number,
        includeExcluded: boolean,
      ) =>
        [TRANSACTIONAL, 'reports', 'spendingByAccountType', startDate, endDate, currencyId, includeExcluded] as const,
      monthlyTrend: (
        months: string[],
        currencyId: number,
        includeExcluded: boolean,
      ) =>
        [TRANSACTIONAL, 'reports', 'monthlyTrend', months, currencyId, includeExcluded] as const,
    },
  },
} as const;
