# Refactor Audit — Step 0

Produced before any refactor code was written, per the refactor brief's own gate: "Do not proceed to Step 1 until this audit exists and you've reviewed it."

## How this was gathered

No `PROGRESS.md` or ER diagram exists in this repo. The closest equivalent is `todo.md` (a stage-by-stage build log, Stages 1–16 shipped, 17–20 not started) and `README.md` (generic RN bootstrap instructions, not app-specific). Findings below come from grepping and reading the actual `screens/`, `components/`, `utils/`, `hooks/`, `theme/`, `contexts/`, `db/`, and `navigation/` directories directly, plus `wc -l` line counts, on 2026-08-09.

**Headline correction to the brief's assumptions:** the math/calculation layer (`utils/balanceMath.ts`, `netWorth.ts`, `interestCalculations.ts`, `installmentMath.ts`, `savingsMath.ts`, `budgetCalculations.ts`) already exists and is already correctly single-sourced — each is imported by exactly the screen(s) that need it and nothing duplicates their math inline. The actual duplication problem in this codebase is almost entirely in the **UI/JSX layer** (list rows, modals, date pickers, toggles, color-cycling helpers), not in scattered business logic or hardcoded style values. Line-count analysis (see the file-size table) shows style blocks are only ~15–20% of every large screen file — so Step 4 (token extraction) will barely move the needle compared to Step 2/3 (component + JSX extraction). Prioritize accordingly.

---

## 1. UI pattern duplication

| # | Pattern | Screens using it | Count | Notes |
|---|---|---|---|---|
| 1 | List row: icon/badge + name + subtitle + edit/close/delete actions | Accounts, Categories, Tags, Recurring Rules, Installment Plans (Pencil+Trash2 icon-pill combo specifically) | **5** | Currencies and Liabilities have a *variant* of this (link+icon, or single Settle button) rather than the exact Pencil+Trash2 pair — see below. |
| 1b | Any FlatList `renderItem` list-row screen (broader superset of #1) | Review Occurrences, Budget Settings, Installment Plans, Expenses By Type, Currencies, Tags, History, Recurring Rules, Category Budgets, Savings Goals, Categories | **11** | Confirms a `ListRow` component has broad applicability even where the action set differs (edit/delete vs. set-default/delete vs. settle-only). |
| 2 | Toggle switch (on/off pill, single boolean) | — | **1** (native `<Switch>` in ReportsScreen only) | The brief assumed this was heavily reimplemented. It isn't — there is exactly one on/off toggle in the whole app, and it's the stock RN `<Switch>`. **A custom `Toggle` component is not justified by real duplication right now.** The closest actual duplicate is the custom checkbox (see #4b). |
| 3 | Segmented two-option toggle (Income/Expense, Liability/Receivable, Active/History, etc.) | Installment Plans (form mode), Recurring Rules (list filter + form type), Liabilities & Receivables (list filter), Reports (range preset — partially), Savings Goals (list filter), TransactionForm (Expense/Income) | **6** | Real, confirmed duplication — every one reimplements its own `toggleRow`/`toggleButton` styles from scratch. Good `SegmentedToggle` candidate. |
| 4 | Modal/sheet form container (title + scrollable body + Cancel/Save) | Installment Plans, Currencies, Tags, Accounts, Recurring Rules, Liabilities & Receivables, Savings Goals, Categories | **8** | Already consolidated onto one shared `components/BottomSheetModal.tsx` (built this session) — this component **already exists**, don't rebuild it, just relocate/keep it under `components/forms/` or `components/common/` per the new structure. |
| 4b | Custom checkbox (bordered box + checkmark, used for "Exclude from budget") | TransactionForm, IncomeForm | **2** | Near-identical implementation in both files (see business-logic section — these two files are ~80% duplicate overall). |
| 4c | Inline native date-picker wrapper (Android inline picker vs. iOS spinner-in-a-slide-up-Modal with local `modalBackdrop`/`modalCard` styles) | Review Occurrences, Installment Plans, Accounts, History, Liabilities & Receivables, Savings Goals, TransactionForm, IncomeForm, LoanSettlementForm | **9** | **Not called out explicitly in the brief but is the single largest confirmed duplication** — ~25–35 lines of identical `Platform.OS === 'android' ? <DateTimePicker/> : <Modal>...</Modal>` boilerplate copy-pasted 9 times (~250–300 total lines). Strong candidate for a `DateField`/`DatePickerButton` common component; should be added to the Step 2 list even though the brief didn't name it. |
| 5 | Tag/chip multi-select | TransactionForm, IncomeForm (History has a *read-only* tag-chip display, not a selector) | **2 selectors** (+1 display-only) | Smaller than expected — Tags itself is CRUD, not a picker. Still worth extracting since TransactionForm/IncomeForm duplicate it identically. |
| 6 | Progress bar / ring | Installment Plans (ring + bar), Expenses By Type (bar), Category Budgets (bar), Dashboard (bar), Savings Goals (bar) | **5** | One is a literal SVG ring (`ProgressRing`, Installment Plans only, built this session); the rest are flat `View`-based bars with near-identical `progressTrack`/`progressFill` styles. Both `ProgressBar` and `ProgressRing` are justified. |
| 6b | Budget green/amber/red threshold-color logic | Dashboard (`statusColorsFor`), Category Budgets (`statusColorFor`) | **2**, and the second one's own code comment admits it: *"duplicated locally rather than imported since Dashboard doesn't export it."* | This is exactly the brief's proposed `BudgetBar` (ProgressBar + threshold logic) — confirmed real, not speculative. |
| 7 | Empty-state message block | 14 screens + 1 component (`LoanSettlementForm`, itself dead code — see below) | **15** | Every one is a one-line `<Text style={styles.empty}>` — trivial to extract but very widely duplicated; low risk, easy win. |
| 8 | Currency-formatted amount display | — | `formatAmount()` exists (`utils/formatAmount.ts`) but is only imported by **2** screens (Reports, Dashboard) | **14 other files call `.toFixed(2)`/`.toFixed(0)` directly**, bypassing the shared formatter entirely — meaning most of the app shows `1234567.89` instead of `1,234,567.89`. This is both a duplication problem and a real, visible UX inconsistency across screens. No masking/hide-balance feature exists anywhere except a local `balancesHidden` boolean on Dashboard only (1 screen) — the brief's assumed `MaskableAmount` component has no other call site to justify it yet; note it as future-proofing, not urgent extraction. |
| 9 | Month/year picker | Budget Settings, History, Category Budgets | **3** | Already single-sourced at `components/MonthYearPicker.tsx` — **already exists, confirmed correctly reused**, no work needed here beyond relocating the file. |
| 10 | "Add X" dashed-outline tile/button | Installment Plans, Currencies, Tags, Recurring Rules, Liabilities & Receivables, Savings Goals, Categories | **7** | Accounts uses a *solid filled* pill for the same semantic action (paired with a Transfer button) — a real visual inconsistency, not just duplication. Worth resolving as part of extracting this component: pick one visual treatment and apply everywhere. |
| 11 | Color-cycling avatar/badge helper (`avatarColorsFor`/`badgeColorsFor`/`accentColorFor` — cycles `colors.chart[]` with an alpha suffix for a per-row circular badge) | Accounts, Categories, Recurring Rules, Liabilities & Receivables | **4** | Not in the brief's list at all but is a clean, byte-for-byte-logic duplicate function copy-pasted into 4 screen files with only cosmetic naming differences. High-value, low-risk extraction — either a `utils/avatarColor.ts` pure function or folded into a shared `Avatar`/`AccountBadge` component. |

### Already-shared, single-source components (do not recreate in Step 2)

`components/Card.tsx` (16 usages), `components/CollapsiblePicker.tsx` (11 usages), `components/BottomSheetModal.tsx` (8 usages), `components/MonthYearPicker.tsx` (3 usages), `components/NumericInputAccessory.tsx`, `components/ScreenBackground.tsx`, `components/PremiumGate.tsx`, `components/AddEntrySheet.tsx` (FAB action sheet). These are correctly extracted already; Step 1 should just relocate them into the new folder structure (`common/` vs `forms/` vs `domain/` per what they actually are), not rebuild them.

### Dead code found during the audit

`components/LoanSettlementForm.tsx` (349 lines) has **zero import sites anywhere in the app** — it was superseded when the Liabilities & Receivables settle flow was rewritten inline as a `BottomSheetModal` this session, and the old standalone component was never deleted. Recommend deleting it in Step 1 rather than migrating it — migrating dead code into the new structure just relocates the problem.

---

## 2. Business logic living in components

Cross-referenced against the utils layer that already exists: `balanceMath.ts` (imported only by `db/queries.ts`), `budgetCalculations.ts` (imported only by Dashboard), `netWorth.ts` (imported only by NetWorthScreen), `interestCalculations.ts` (imported only by `db/queries.ts`), `installmentMath.ts` (imported by Installment Plans + `db/queries.ts`), `savingsMath.ts` (imported only by Savings Goals). **None of these are bypassed or duplicated inline** — every screen that needs this math already calls the shared function. This part of the brief's concern doesn't hold up against the actual codebase.

What *does* belong in `utils/` or a hook but currently lives in a screen file:

- **`statusColorFor`/`statusColorsFor` (Dashboard, Category Budgets)** — real duplicated logic, not just formatting. Belongs in a shared function backing the new `BudgetBar` component, not copy-pasted per screen.
- **`avatarColorsFor`/`badgeColorsFor`/`accentColorFor` (Accounts, Categories, Recurring Rules, Liabilities)** — same function, 4 copies. Belongs in `utils/` as a pure function (e.g. `utils/avatarColor.ts`), consumed by whatever `Avatar`/`domain` component ends up owning the visual.
- **Inline `.toFixed()` currency formatting (14 files)** — not "logic" in the strict sense but is exactly the kind of formatting duplication `formatAmount()` was built to eliminate in Stage 16a and never finished rolling out. Every one of those 14 call sites should switch to `formatAmount()`.
- **`ordinalSuffix` (Installment Plans), `formatMonthTitle` (Dashboard), `formatRangeHeader` (Reports)** — each currently appears in exactly one file, so by the "2+ screens" bar these don't strictly qualify as duplicated yet. Flagging them anyway because they're pure date/number formatting functions sitting in screen files instead of `utils/dateUtils.ts` or `utils/formatAmount.ts` — low priority, but cheap to move while touching those files anyway.
- **Two files named `utils/date.ts` and `utils/dateUtils.ts`** — not a duplication (dateUtils.ts re-exports one function from date.ts and adds report-range-specific helpers, no overlapping logic), but the near-identical naming is a genuine footgun for future contributors. Worth a rename/merge decision in Step 1, called out here so it isn't mistaken for the kind of duplication Step 3 is supposed to fix.
- **The iOS date-picker Modal boilerplate (9 files, see pattern #4c above)** — arguably UI, but it also embeds date-formatting logic (`formatDateString`) inline at each call site rather than through a single component's props contract.

## 3. File size table — every screen/component file over 400 lines

Style-block size measured as everything from the file's `const styles = StyleSheet.create({` line to EOF (this codebase's consistent convention of putting all styles at the bottom, confirmed true in every file checked).

| File | Total lines | Logic/JSX lines | Style lines | Style % |
|---|---|---|---|---|
| `screens/AccountsScreen.tsx` | 1596 | 1405 | 191 | 12% |
| `screens/InstallmentPlansScreen.tsx` | 1351 | 1162 | 189 | 14% |
| `screens/SavingsGoalsScreen.tsx` | 1195 | 969 | 226 | 19% |
| `screens/DashboardScreen.tsx` | 1141 | 937 | 204 | 18% |
| `screens/LiabilitiesReceivablesScreen.tsx` | 1046 | 849 | 197 | 19% |
| `screens/HistoryListScreen.tsx` | 968 | 790 | 178 | 18% |
| `screens/ReportsScreen.tsx` | 873 | 691 | 182 | 21% |
| `screens/RecurringRulesScreen.tsx` | 789 | 647 | 142 | 18% |
| `components/TransactionForm.tsx` | 644 | 530 | 114 | 18% |
| `screens/SettingsHomeScreen.tsx` | 593 | 528 | 65 | 11% |
| `components/IncomeForm.tsx` | 470 | 371 | 99 | 21% |
| `screens/ReviewOccurrencesScreen.tsx` | 408 | 350 | 58 | 14% |

Average style share across these 12 files: **~17%**. Confirms the note at the top — extracting components (Step 2) and hooks (Step 3) is where the real line-count reduction will come from; token-izing spacing/radius values (Step 4) will help consistency but won't meaningfully shrink these files on its own.

**Also over 400 lines but excluded from Step 1's screen list / worth separate handling:**
- `components/LoanSettlementForm.tsx` (349 lines, under 400 but flagged) — dead code, recommend deleting rather than migrating (see above).
- `App.tsx` (546 lines) — not a screen file, holds navigation + FAB action-sheet wiring; out of scope for the screens/ reorg but likely has its own extractable pieces (not audited in depth here since it's not in the brief's screen list).

**Screens already under the ~700-line non-style target, no action needed:** `EditTransactionScreen` (106), `NetWorthScreen` (141), `ExpensesByTypeScreen` (152), `AppSettingsScreen` (209), `PaywallModal` (210), `AddTransactionScreen` (233), `TagsScreen` (244), `CurrenciesScreen` (293), `CategoryBudgetsScreen` (297), `CategoriesScreen` (327), `BudgetSettingsScreen` (351).

---

## 4. Existing structure vs. the brief's target `src/` layout

Current layout is flat at the repo root (`screens/`, `components/`, `contexts/`, `hooks/`, `utils/`, `config/`, `db/`, `theme/`, `navigation/`) — there is no `src/` wrapper today. `navigation/` currently contains only `types.ts` (62 lines); the actual navigator wiring lives in `App.tsx`. `hooks/` currently contains exactly one file (`useEntitlement.ts`) — confirmed single-sourced, no duplicate implementations found elsewhere. No `services/` directory exists yet and nothing in the current codebase obviously needs one (there's no network layer — the app is fully offline per `todo.md`, Stage 18+ is what would eventually introduce one).

---

## Step 1 implications (do not act on these yet — for review only)

1. Component list to actually build in Step 2, in priority order by evidence strength: **`DateField`** (9 sites, not in original brief), `SegmentedToggle` (6 sites), `ListRow`+`ActionButtons` (5–11 sites depending on how broadly scoped), `ProgressBar`/`ProgressRing`/`BudgetBar` (5 sites + confirmed duplicated threshold logic), `Avatar`/badge-color helper (4 sites, not in original brief), `TagPicker` (2 sites), `EmptyState` (15 sites, trivial), checkbox (2 sites, low priority).
2. **Drop `Toggle` (on/off switch) from the plan** — zero duplication evidence, only one `<Switch>` in the whole app.
3. **`MaskableAmount` should be deprioritized** — only one screen (Dashboard) has any hide/reveal-balance behavior today; building a shared component for it now is speculative, not duplication-driven. Revisit if a second screen adds the feature.
4. **Roll out `formatAmount()` to the 14 files currently calling `.toFixed()` directly** as part of Step 3 — this was already supposed to happen per Stage 16a's own code comments and never finished.
5. **Delete `components/LoanSettlementForm.tsx`** rather than migrate it — confirmed zero import sites.
6. Resolve the `utils/date.ts` vs `utils/dateUtils.ts` naming collision before or during the folder move, so it doesn't get carried into the new structure as-is.
