## Done
 
- [x] **Stage 1** — Project setup + local relational database (RN 0.80.0, Drizzle + op-sqlite)
- [x] **Stage 2** — Core transaction CRUD screens (Dashboard, History, Expenses, Add/Edit/Delete)
- [x] **Stage 3** — Budget management + budget-vs-actual
- [x] **Stage 4a** — Month/year picker refactor (modal, not inline)
- [x] **Stage 4b** — Manual accounts & cash-in-hand (original Cash/Bank/Card model — superseded by Stage 7)
- [x] **Stage 5a** — Settings hub refactor
- [x] **Stage 5b** — Categories as real CRUD entities, migrated transactions off hardcoded types
- [x] **Stage 6** — Category-level budgets + Dashboard per-category breakdown
- [x] **Stage 7a** — Currencies table + universal account model + migration
- [x] **Stage 7b** — Currencies screen + multi-currency account management
- [x] **Stage 7c** — TransactionForm currency-aware picker
- [x] **Stage 7d** — Currency default/delete + account closure (`active` flag)
- [x] **Stage 8** — Income tracking + audited balance-correction entries
- [x] **Stage 9a** — Liability/Receivable creation + inactive-account reactivation
- [x] **Stage 9b** — Interest accrual (live, simple daily) + settlement/payoff 
- [x] **Stage 9c** — Entitlement gate scaffold (`useEntitlement()` hook, `<PremiumGate>` wrapper, free-tier limit checks, placeholder paywall — hardcoded flag for now, wired to real tokens in Stage 19). **Do this before Stage 10**, so premium features get gated as they're built instead of retrofitted across eight stages.
- [x] **Stage 10** — Credit cards (spending increases debt, inferred from account type; dedicated payoff action, no category/expense impact; debt counts toward net worth, tracked separately from Liabilities)
- [x] **Stage 11** — Bank-to-bank transfers (same currency only, no category impact)
- [x] **Stage 12** — Installments (total+rate+months OR monthly+count; manually ticked off; each tick-off is a real transaction hitting budgets; unpaid balance counts as a liability)
- [x] **Stage 13** — Recurring transactions (fixed income + recurring expenses; prompts for confirmation on the due date, never posts silently)
- [x] **Stage 14** — Savings goals (target + contribution log; purely informational, no link to real balances)
- [x] **Stage 15** — Search + transaction tags (text search over descriptions; reimbursable/shared/pending-style tags; no photo attachments — deliberately skipped)
- [x] **Stage 16** — Statistics reports (current month / last 3 months / last year presets; category, account-type, and currency breakdowns)
- [x] **Stage 17** — Excel bulk import + export (same file format both directions — one file is a full from-zero restore; format now needs to cover currencies, account types, loans, credit cards, installments, recurring rules)

### Auth + monetization (the only stages that touch the network)
 
- [ ] **Stage 18** — OAuth login: Sign in with Apple + Google Sign-In, local session storage, network boundary established
- [ ] **Stage 19** — Subscriptions: Apple In-App Purchase (iOS) + Google Play Billing (Android), entitlement caching with offline grace, mandatory Restore Purchases
- [ ] **Stage 20** — Minimal backend user table: stores only what subscription verification actually requires — no financial data, ever
- [ ] **README.md pass** — not tied to a stage number, do this once most features exist rather than early (see the requirements doc for what it should cover)

 additional feature in future:
 - event and task plan option - another type of account. add that as the purpose for payment and add the value to the account as expense
 - Allow users to add a shortcut to show the selected account on the home screen for quick access. This can be done by long-pressing the account in the list and selecting "Add to Home Screen" or similar option.
 - add ram cache using tanstack query to reduce the number of queries to the database and improve performance. This can be done by caching frequently accessed data in memory and only querying the database when necessary.

 - for savings goal- allow users to add an existing account that you decide to save money in. And add a transfer option to transfer money from a selected account to the target account. This will help users to track their savings and make it easier to reach their savings goals. 
 when you have a plan to save 100000 lkr, in account A. Then you can transfer 10000 lkr from account B to account A, and the savings goal will be updated accordingly. This will also help users to keep track of their progress towards their savings goals and make it easier to reach them.
