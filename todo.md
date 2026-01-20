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


## Not started yet
 
- [ ] **Stage 9c** — Entitlement gate scaffold (`useEntitlement()` hook, `<PremiumGate>` wrapper, free-tier limit checks, placeholder paywall — hardcoded flag for now, wired to real tokens in Stage 19). **Do this before Stage 10**, so premium features get gated as they're built instead of retrofitted across eight stages.
- [ ] **Stage 10** — Credit cards (spending increases debt, inferred from account type; dedicated payoff action, no category/expense impact; debt counts toward net worth, tracked separately from Liabilities)
- [ ] **Stage 11** — Bank-to-bank transfers (same currency only, no category impact)
- [ ] **Stage 12** — Installments (total+rate+months OR monthly+count; manually ticked off; each tick-off is a real transaction hitting budgets; unpaid balance counts as a liability)
- [ ] **Stage 13** — Recurring transactions (fixed income + recurring expenses; prompts for confirmation on the due date, never posts silently)
- [ ] **Stage 14** — Savings goals (target + contribution log; purely informational, no link to real balances)
- [ ] **Stage 15** — Search + transaction tags (text search over descriptions; reimbursable/shared/pending-style tags; no photo attachments — deliberately skipped)
- [ ] **Stage 16** — Statistics reports (current month / last 3 months / last year presets; category, account-type, and currency breakdowns)
- [ ] **Stage 17** — Excel bulk import + export (same file format both directions — one file is a full from-zero restore; format now needs to cover currencies, account types, loans, credit cards, installments, recurring rules)
### Auth + monetization (the only stages that touch the network)
 
- [ ] **Stage 18** — OAuth login: Sign in with Apple + Google Sign-In, local session storage, network boundary established
- [ ] **Stage 19** — Subscriptions: Apple In-App Purchase (iOS) + Google Play Billing (Android), entitlement caching with offline grace, mandatory Restore Purchases
- [ ] **Stage 20** — Minimal backend user table: stores only what subscription verification actually requires — no financial data, ever
- [ ] **README.md pass** — not tied to a stage number, do this once most features exist rather than early (see the requirements doc for what it should cover)

 additonal feature
 - event and task plan option - another type of account.
 - add that as the purpose for payment and add the value to the account as expense
