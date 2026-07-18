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


 - [x] DONE — savings goals are now backed by a real account, funded only by transfers, and capped by that account's balance (oldest goal first when two share an account). Closing the account warns and deletes its goals.
 - [x] DONE — cross-currency transfers: from/to currency pair on `transfers`, same-account conversion allowed, rates from config/exchangeRates.ts and editable in Settings > Exchange Rates, converted amount always user-editable. No budget impact.

 Original notes for both, kept for reference:

 - for savings goal- allow users to add an existing account that you decide to save money the money in. And add a option to transfer money from a selected account to the target account. This will help users to track their savings and make it easier to reach their savings goals. 
 when you have a plan to save 100000 lkr in account A. Then you can transfer 10000 lkr from account B to account A, and add 10000 lkr to the savings goal while transferring money from account B to account A (include in history Acc A-> B description saving goal name). And do not allow users to add a savings goal without selecting an account to save the money in (for the already existing savings goals, use a bank account). This will help users to stay on track with their savings goals and avoid overspending. And if the account A money got spent, ex: you have 100000 lkr saved in account A for a saving goal and total of 150000 lkr in account A, and you spent 100000 lkr from account A for another expense, then the savings goal should be updated with the remaining amount. 
 let's say Account A is the selected account to save the money for saving goal, and if the account balance > savings goal balance, then no issue. And if the account balance < savings goal balance(saved amount), then the savings goal balance should be updated with the remaining amount in the account. This will help users to stay on track with their savings goals and avoid overspending.
 And if account A is closed, then warn the user that the savings goal will be deleted and ask for confirmation before proceeding. This will help users to avoid losing their savings goals and make it easier to manage their finances.

 And allow user to edit the savings goal money saved account, follow the same logic as above. If the user changes the account to another account, then the savings goal balance should be updated with the remaining amount in the new account(if the new account has sufficient funds(saving goal balance < new account balance) - no need to update the savings goal balance). This will help users to stay on track with their savings goals and avoid overspending.

- [x] DONE — shared form validation: save/confirm buttons stay muted until every required field is filled, and pressing one anyway outlines the missing fields in red (hooks/useFieldErrors + utils/formFieldStyle). Applied to every form modal, inline form and screen-level save.
- [x] DONE — informative banners at the top of screens are closable and come back on the next visit (components/common/InfoBanner).
- [x] DONE — history is newest-first WITHIN a day, not just by date; transfer rows dropped the redundant "Transfer —" prefix.
- [x] DONE — cash-in-hand removed from the Dashboard (several currencies on one line was never a usable figure; Accounts and Net Worth cover it).
- [x] DONE — currency deletion removed from the Currencies screen; disabling is the supported way to take one out of circulation.
- [x] DONE — exchange rates are now measured against the user's DEFAULT currency ("1 USD = 0.86 EUR"), and changing the default re-anchors every rate without altering any pair.

- add a loading indicator for ui buttons, and disable the button while the action is being processed. This will help to prevent users from accidentally triggering multiple actions and improve the overall user experience.
- limit free users only to have 1 bank and default cash in wallet account. 
- add currency converted transactions, like If i want to withdraw 100 USD to my LKR account, then the transaction will be converted to LKR based on the (current exchange rate) (allow users to edit the converted ammounts manually) and the amount will be deducted from my USD account and added to my LKR account. This will help users to manage their finances across different currencies and make it easier to track their spending and savings.