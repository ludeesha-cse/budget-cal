import { and, eq } from 'drizzle-orm';
import { db } from '../index';
import { upsertAccountBalanceWithin } from './loans';
import {
  normalizeRatesToDefault,
  seedExchangeRates,
} from './exchangeRates';
import {
  accountBalances,
  accounts,
  budgets,
  categories,
  categoryBudgets,
  creditCardPayoffs,
  currencies,
  exchangeRates,
  installmentOccurrences,
  installmentPayments,
  installmentPlans,
  loanDetails,
  loanOriginations,
  loanPayments,
  recurringOccurrences,
  recurringRules,
  savingsContributions,
  savingsGoals,
  tags,
  transactionTags,
  transactions,
  transfers,
} from '../schema';
import {
  formatDateString,
} from '../../utils/date';
import {
  SCHEMA_VERSION,
  type ExportRow,
  type ExportWorkbookData,
  type SheetName,
} from '../../utils/exportFormat';
import { version as APP_VERSION } from '../../package.json';

// Mirrors the same type defined in ./loans — duplicated here so this
// file has no import dependency on the loans module for a single type.
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Stage 17a: Excel export. getAllDataForExport is the ONLY place that
// reads every table for the purpose of writing them out — it exists
// purely to hand utils/excelExport.ts already-shaped, already-joined
// rows matching utils/exportFormat.ts's SHEET_COLUMNS exactly, so the
// export layer itself never has to know column order or run a single
// join. NETWORK-READY: if a backend is added later, this becomes a
// fetch(GET /api/export) that the server assembles instead — the shape
// returned to the caller (ExportWorkbookData) would stay the same.

// Epoch-ms createdAt columns are exported as plain 'YYYY-MM-DD' dates
// (matching every other date already shown in this app), not full
// timestamps — the one exception is Meta's own ExportedAt, which is
// deliberately a full ISO instant so a future importer can tell exactly
// when a file was produced, not just what day.
function toDateOnly(epochMs: number): string {
  return formatDateString(new Date(epochMs));
}

export async function getAllDataForExport(): Promise<ExportWorkbookData> {
  try {
    const [
      allCurrencies,
      allAccounts,
      allAccountBalances,
      allCategories,
      allTags,
      allTransactions,
      allTransactionTags,
      allBudgets,
      allCategoryBudgets,
      allTransfers,
      allLoanDetails,
      allLoanOriginations,
      allLoanPayments,
      allCreditCardPayoffs,
      allInstallmentPlans,
      allInstallmentPayments,
      allRecurringRules,
      allRecurringOccurrences,
      allSavingsGoals,
      allSavingsContributions,
      allExchangeRates,
    ] = await Promise.all([
      db.select().from(currencies),
      db.select().from(accounts),
      db.select().from(accountBalances),
      db.select().from(categories),
      db.select().from(tags),
      db.select().from(transactions),
      db.select().from(transactionTags),
      db.select().from(budgets),
      db.select().from(categoryBudgets),
      db.select().from(transfers),
      db.select().from(loanDetails),
      db.select().from(loanOriginations),
      db.select().from(loanPayments),
      db.select().from(creditCardPayoffs),
      db.select().from(installmentPlans),
      db.select().from(installmentPayments),
      db.select().from(recurringRules),
      db.select().from(recurringOccurrences),
      db.select().from(savingsGoals),
      db.select().from(savingsContributions),
      db.select().from(exchangeRates),
    ]);

    // Lookup maps resolve every foreign key to the human-readable value
    // an exported sheet actually shows. Built once in JS rather than
    // joined per-table in SQL — this function already has to load every
    // table into memory to write a full-workbook export, so this is the
    // same "small table, filter/join in JS" convention already used
    // throughout this file (getRecurringRules, searchTransactions, etc.),
    // just applied at whole-app scale instead of one table at a time.
    const accountName = new Map(allAccounts.map(a => [a.id, a.name]));
    const categoryName = new Map(allCategories.map(c => [c.id, c.name]));
    const currencyCode = new Map(allCurrencies.map(c => [c.id, c.code]));
    const tagName = new Map(allTags.map(t => [t.id, t.name]));
    const installmentPlanName = new Map(
      allInstallmentPlans.map(p => [p.id, p.name]),
    );
    const recurringRuleName = new Map(
      allRecurringRules.map(r => [r.id, r.name]),
    );
    const savingsGoalName = new Map(allSavingsGoals.map(g => [g.id, g.name]));
    const transferById = new Map(allTransfers.map(t => [t.id, t]));
    // Which currency the exported rates are measured against — the
    // default at export time. See the ExchangeRates comment in
    // utils/exportFormat.ts.
    const exportAnchorCode =
      allCurrencies.find(c => c.isDefault)?.code ?? '';
    const transactionById = new Map(allTransactions.map(t => [t.id, t]));

    // Tag names per transaction, comma-joined, for Transactions' own Tags
    // column — built from the exact same transactionTags rows the
    // dedicated TransactionTags sheet below also reads, so the two can
    // never disagree with each other.
    const tagNamesByTransactionId = new Map<number, string[]>();
    for (const row of allTransactionTags) {
      const list = tagNamesByTransactionId.get(row.transactionId) ?? [];
      list.push(tagName.get(row.tagId) ?? '');
      tagNamesByTransactionId.set(row.transactionId, list);
    }

    const data: ExportWorkbookData = {
      Meta: [
        {
          SchemaVersion: SCHEMA_VERSION,
          ExportedAt: new Date().toISOString(),
          AppVersion: APP_VERSION,
        },
      ],
      Currencies: allCurrencies.map(
        (c): ExportRow => ({
          Code: c.code,
          Name: c.name,
          IsDefault: c.isDefault,
          CreatedAt: toDateOnly(c.createdAt),
        }),
      ),
      Accounts: allAccounts.map(
        (a): ExportRow => ({
          Name: a.name,
          Type: a.type,
          Active: a.active,
          CreatedAt: toDateOnly(a.createdAt),
        }),
      ),
      AccountBalances: allAccountBalances.map(
        (b): ExportRow => ({
          AccountName: accountName.get(b.accountId) ?? '',
          CurrencyCode: currencyCode.get(b.currencyId) ?? '',
          Balance: b.balance,
        }),
      ),
      Categories: allCategories.map(
        (c): ExportRow => ({
          Name: c.name,
          IsSystemReserved: c.isSystemReserved,
          CreatedAt: toDateOnly(c.createdAt),
        }),
      ),
      Tags: allTags.map(
        (t): ExportRow => ({
          Name: t.name,
          CreatedAt: toDateOnly(t.createdAt),
        }),
      ),
      Transactions: allTransactions.map((t): ExportRow => {
        // CRITICAL (Stage 17a spec): an Income row's Category must come
        // out as a genuinely blank cell — never null, never omitted, and
        // never the string "Uncategorized". Income transactions have no
        // category in the first place (see transactions.categoryId's own
        // nullable-since comment in db/schema.ts), so '' here is simply
        // the correct, faithful representation of "not applicable."
        const category =
          t.categoryId != null ? (categoryName.get(t.categoryId) ?? '') : '';
        return {
          Date: t.date,
          AccountName: accountName.get(t.accountId) ?? '',
          EntryType: t.entryType,
          Amount: t.amount,
          CategoryName: category,
          CurrencyCode: currencyCode.get(t.currencyId) ?? '',
          Description: t.description ?? '',
          Tags: (tagNamesByTransactionId.get(t.id) ?? []).join(', '),
          ExcludeFromBudget: t.excludeFromBudget,
          CreatedAt: toDateOnly(t.createdAt),
        };
      }),
      TransactionTags: allTransactionTags.map((row): ExportRow => {
        const txn = transactionById.get(row.transactionId);
        return {
          Date: txn?.date ?? '',
          AccountName: txn ? (accountName.get(txn.accountId) ?? '') : '',
          Amount: txn?.amount ?? '',
          Description: txn?.description ?? '',
          TagName: tagName.get(row.tagId) ?? '',
        };
      }),
      Budgets: allBudgets.map(
        (b): ExportRow => ({
          Month: b.month ?? '',
          CurrencyCode: currencyCode.get(b.currencyId) ?? '',
          Category: b.category,
          LimitAmount: b.limitAmount,
          Period: b.period,
          StartDate: toDateOnly(b.startDate),
          CreatedAt: toDateOnly(b.createdAt),
        }),
      ),
      CategoryBudgets: allCategoryBudgets.map(
        (cb): ExportRow => ({
          Month: cb.month,
          CategoryName: categoryName.get(cb.categoryId) ?? '',
          CurrencyCode: currencyCode.get(cb.currencyId) ?? '',
          Amount: cb.amount,
        }),
      ),
      Transfers: allTransfers.map(
        (t): ExportRow => ({
          Date: t.date,
          FromAccountName: accountName.get(t.fromAccountId) ?? '',
          ToAccountName: accountName.get(t.toAccountId) ?? '',
          Amount: t.amount,
          CurrencyCode: currencyCode.get(t.currencyId) ?? '',
          // The to-side falls back to the from-side for any row written
          // before transfers could convert — those were same-currency by
          // definition, so this exports what the row has always meant.
          ToAmount: t.toAmount ?? t.amount,
          ToCurrencyCode:
            currencyCode.get(t.toCurrencyId ?? t.currencyId) ?? '',
          Description: t.description ?? '',
          CreatedAt: toDateOnly(t.createdAt),
        }),
      ),
      LoanDetails: allLoanDetails.map(
        (l): ExportRow => ({
          AccountName: accountName.get(l.accountId) ?? '',
          CounterpartyName: l.counterpartyName,
          DateCreated: l.dateCreated,
          LastAccrualAnchorDate: l.lastAccrualAnchorDate,
          DueDate: l.dueDate ?? '',
          InterestRate: l.interestRate ?? '',
          InterestPeriod: l.interestPeriod ?? '',
          CounterpartAccountName:
            l.counterpartAccountId == null
              ? ''
              : accountName.get(l.counterpartAccountId) ?? '',
        }),
      ),
      LoanOriginations: allLoanOriginations.map(
        (o): ExportRow => ({
          Date: o.date,
          LoanAccountName: accountName.get(o.loanAccountId) ?? '',
          CounterpartAccountName:
            o.counterpartAccountId == null
              ? ''
              : accountName.get(o.counterpartAccountId) ?? '',
          Amount: o.amount,
          CurrencyCode: currencyCode.get(o.currencyId) ?? '',
          CreatedAt: toDateOnly(o.createdAt),
        }),
      ),
      LoanPayments: allLoanPayments.map(
        (p): ExportRow => ({
          Date: p.date,
          LoanAccountName: accountName.get(p.loanAccountId) ?? '',
          CounterpartAccountName:
            accountName.get(p.counterpartAccountId) ?? '',
          Amount: p.amount,
          CurrencyCode: currencyCode.get(p.currencyId) ?? '',
          CreatedAt: toDateOnly(p.createdAt),
        }),
      ),
      CreditCardPayoffs: allCreditCardPayoffs.map(
        (p): ExportRow => ({
          Date: p.date,
          CreditCardAccountName: accountName.get(p.creditCardAccountId) ?? '',
          PayingAccountName: accountName.get(p.payingAccountId) ?? '',
          Amount: p.amount,
          CurrencyCode: currencyCode.get(p.currencyId) ?? '',
          CreatedAt: toDateOnly(p.createdAt),
        }),
      ),
      InstallmentPlans: allInstallmentPlans.map(
        (p): ExportRow => ({
          Name: p.name,
          PrincipalAmount: p.principalAmount ?? '',
          InterestRate: p.interestRate ?? '',
          NumberOfMonths: p.numberOfMonths,
          MonthlyAmount: p.monthlyAmount,
          FinalInstallmentAmount: p.finalInstallmentAmount,
          TotalRepayable: p.totalRepayable,
          CategoryName: categoryName.get(p.categoryId) ?? '',
          CurrencyCode: currencyCode.get(p.currencyId) ?? '',
          StartDate: p.startDate,
          DueDayOfMonth: p.dueDayOfMonth ?? '',
          CreatedAt: toDateOnly(p.createdAt),
        }),
      ),
      InstallmentPayments: allInstallmentPayments.map(
        (p): ExportRow => ({
          PlanName: installmentPlanName.get(p.installmentPlanId) ?? '',
          InstallmentNumber: p.installmentNumber,
          AccountName: accountName.get(p.accountId) ?? '',
          PaidDate: p.paidDate,
          CreatedAt: toDateOnly(p.createdAt),
        }),
      ),
      RecurringRules: allRecurringRules.map((r): ExportRow => {
        const category =
          r.categoryId != null ? (categoryName.get(r.categoryId) ?? '') : '';
        return {
          Name: r.name,
          RuleType: r.ruleType,
          Amount: r.amount,
          DayOfMonth: r.dayOfMonth,
          CategoryName: category,
          AccountName: accountName.get(r.accountId) ?? '',
          CurrencyCode: currencyCode.get(r.currencyId) ?? '',
          Active: r.active,
          CreatedAt: toDateOnly(r.createdAt),
        };
      }),
      RecurringOccurrences: allRecurringOccurrences.map(
        (o): ExportRow => ({
          RuleName: recurringRuleName.get(o.recurringRuleId) ?? '',
          DueDate: o.dueDate,
          Status: o.status,
          ConfirmedAmount: o.confirmedAmount ?? '',
          ResolvedAt: o.resolvedAt ?? '',
        }),
      ),
      SavingsGoals: allSavingsGoals.map(
        (g): ExportRow => ({
          Name: g.name,
          TargetAmount: g.targetAmount,
          CurrencyCode: currencyCode.get(g.currencyId) ?? '',
          AccountName:
            g.accountId == null ? '' : accountName.get(g.accountId) ?? '',
          TargetDate: g.targetDate ?? '',
          Status: g.status,
          CreatedAt: toDateOnly(g.createdAt),
        }),
      ),
      SavingsContributions: allSavingsContributions.map((c): ExportRow => {
        // Which account funded this — resolved through the transfer the
        // contribution points at, so the importer can re-pair the two
        // sheets. Empty for a legacy contribution that never had a
        // transfer behind it.
        const backingTransfer =
          c.transferId == null
            ? undefined
            : transferById.get(c.transferId);
        return {
          GoalName: savingsGoalName.get(c.savingsGoalId) ?? '',
          Amount: c.amount,
          Date: c.date,
          FromAccountName:
            backingTransfer == null
              ? ''
              : accountName.get(backingTransfer.fromAccountId) ?? '',
          Note: c.note ?? '',
          CreatedAt: toDateOnly(c.createdAt),
        };
      }),
      ExchangeRates: allExchangeRates.map(
        (r): ExportRow => ({
          CurrencyCode: currencyCode.get(r.currencyId) ?? '',
          RatePerAnchor: r.ratePerAnchor,
          AnchorCurrencyCode: exportAnchorCode,
          IsCustom: r.isCustom ? 'true' : 'false',
          UpdatedAt: toDateOnly(r.updatedAt),
        }),
      ),
    };

    return data;
  } catch (error) {
    console.error('getAllDataForExport: failed to gather export data', error);
    throw error;
  }
}

// ---------------------------------------------------------------------
// Stage 17b: Excel import, Phase 2 (apply). Only ever called with data
// that utils/excelImport.ts's validateExcelFile has already returned as
// { valid: true } — this file trusts every reference in `data` resolves
// (to an existing row or another sheet in the same workbook) and never
// re-validates. ImportMode/ImportWorkbookData are duplicated here
// (rather than imported from utils/excelImport.ts) purely to avoid a
// circular import — that file already imports several read functions
// from this one.
// ---------------------------------------------------------------------

export type ImportMode = 'merge' | 'replace';

export type ImportWorkbookData = Partial<Record<SheetName, ExportRow[]>>;

// Converts an exported 'YYYY-MM-DD' string back into an epoch-ms
// createdAt. The exact time of day was never preserved on export
// (toDateOnly collapses it to a date), so midnight local time is as
// faithful a reconstruction as this can be — nothing in the app displays
// createdAt down to the second; every date-derived view (month/year
// filters, sorting) reads the row's own 'date'/'month' text column, not
// createdAt.
function dateOnlyToEpoch(dateStr: string): number {
  if (!dateStr) {
    return Date.now();
  }
  const parsed = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? Date.now() : parsed.getTime();
}

// Splits a Transactions row's comma-separated Tags cell back into
// trimmed, non-empty tag names — the exact inverse of how
// getAllDataForExport joined them together (`.join(', ')`), so a round
// trip reproduces the same set.
function splitTagNames(raw: string): string[] {
  return raw
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0);
}

// DESTRUCTIVE. Deletes every row from every table except app_settings
// (the theme must survive a REPLACE import), in FK-safe
// children-before-parents order. Used ONLY by importData's REPLACE
// mode, and only ever inside the same transaction as the import that
// follows it — nothing else in the app should ever call this casually.
async function wipeAllDataWithin(tx: DbTransaction): Promise<void> {
  await tx.delete(transactionTags);
  // Before installment_payments and installment_plans: occurrence rows
  // reference both, so wiping them later would be deleting a parent out
  // from under a child.
  await tx.delete(installmentOccurrences);
  await tx.delete(installmentPayments);
  await tx.delete(recurringOccurrences);
  await tx.delete(savingsContributions);
  await tx.delete(categoryBudgets);
  await tx.delete(transactions);
  await tx.delete(transfers);
  await tx.delete(loanPayments);
  await tx.delete(loanOriginations);
  await tx.delete(creditCardPayoffs);
  await tx.delete(installmentPlans);
  await tx.delete(recurringRules);
  await tx.delete(loanDetails);
  await tx.delete(accountBalances);
  await tx.delete(savingsGoals);
  await tx.delete(budgets);
  await tx.delete(accounts);
  await tx.delete(categories);
  await tx.delete(tags);
  // Before currencies, which every rate row points at. A REPLACE import
  // whose workbook has no ExchangeRates sheet is left with none at all
  // for a moment — seedExchangeRates, run at the end of importData,
  // puts the shipped defaults back for any currency that still has no
  // rate, so an older workbook restores into a working state rather
  // than one where every conversion asks to be typed by hand.
  await tx.delete(exchangeRates);
  await tx.delete(currencies);
}

// NETWORK-READY: no direct backend equivalent — a networked backend
// would instead expose a "restore from file" endpoint that performs the
// same wipe-then-reload server-side. DESTRUCTIVE and single-purpose:
// deletes every record in the app. Exported only so importData's
// REPLACE mode (and nothing else) can call it.
export async function wipeAllData(): Promise<void> {
  try {
    await db.transaction(async tx => {
      await wipeAllDataWithin(tx);
    });
  } catch (error) {
    console.error('wipeAllData: failed to wipe all data', error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/import), keeping the same input/return shape. Phase 2 of Stage
// 17b's Excel import — applies data that utils/excelImport.ts's
// validateExcelFile has already fully validated. Runs as a single
// database transaction so a failure partway through never leaves a
// half-imported database; REPLACE mode wipes everything first inside
// that same transaction, so a failed REPLACE leaves the original data
// untouched rather than an empty one.
//
// Reference tables (Currencies, Categories, Tags, Accounts,
// InstallmentPlans, RecurringRules, SavingsGoals) are matched by their
// human-readable key and reused if they already exist — never
// duplicated. Event-log tables (Transfers, LoanPayments,
// CreditCardPayoffs, SavingsContributions) are pure inserts with no
// dedup, since re-importing the same MERGE file twice legitimately
// creates two records. Transfers/LoanPayments/CreditCardPayoffs
// deliberately never shift accountBalances — the AccountBalances sheet
// already carries the cumulative baseline that resulted from those
// events at export time, so replaying them here would double-count.
// InstallmentPayments and confirmed RecurringOccurrences are the one
// exception to "pure insert": each synthesizes a brand-new transactions
// row, because those ARE ordinary transactions that getAccountBalance
// sums live rather than baking into the baseline — and each is
// deduplicated against its own real DB unique index so a re-imported
// MERGE file can't violate it.
export async function importData(
  data: ImportWorkbookData,
  mode: ImportMode,
): Promise<Partial<Record<SheetName, number>>> {
  const rowCounts: Partial<Record<SheetName, number>> = {};
  try {
    await db.transaction(async tx => {
      if (mode === 'replace') {
        await wipeAllDataWithin(tx);
      }

      // ---- Currencies ----
      const existingCurrencies = await tx.select().from(currencies);
      const currencyIdByCode = new Map(
        existingCurrencies.map(c => [c.code, c.id]),
      );
      for (const row of data.Currencies ?? []) {
        const code = String(row.Code);
        if (currencyIdByCode.has(code)) {
          continue;
        }
        const [created] = await tx
          .insert(currencies)
          .values({
            code,
            name: String(row.Name),
            // Never trust an imported IsDefault — exactly one currency
            // is ever the default, and that's whichever one already
            // holds the flag in this database, never something a
            // workbook gets to override (same rule as addCurrency).
            isDefault: false,
            createdAt: dateOnlyToEpoch(String(row.CreatedAt ?? '')),
          })
          .returning();
        currencyIdByCode.set(code, created.id);
      }
      rowCounts.Currencies = data.Currencies?.length ?? 0;

      // Fallback target for Budgets/CategoryBudgets rows with no
      // CurrencyCode — either a pre-v2 export (the column didn't exist
      // yet) or a hand-edited sheet with a blank cell. Resolved once,
      // from whichever currency this database already has flagged
      // default, so an old backup restores its budgets exactly where
      // they'd have landed before multi-currency budgets existed at all.
      const defaultCurrencyId =
        existingCurrencies.find(c => c.isDefault)?.id ??
        existingCurrencies[0]?.id ??
        null;

      // ---- Categories: explicit sheet rows, get-or-create by name.
      // References elsewhere in the workbook (Transactions,
      // InstallmentPlans, RecurringRules) share this same
      // get-or-create, since a category needs nothing but a name to be
      // a fully valid row (see utils/excelImport.ts's freeformName). ----
      const existingCategories = await tx.select().from(categories);
      const categoryIdByName = new Map(
        existingCategories.map(c => [c.name, c.id]),
      );
      const getOrCreateCategoryId = async (name: string): Promise<number> => {
        const existingId = categoryIdByName.get(name);
        if (existingId != null) {
          return existingId;
        }
        const [created] = await tx
          .insert(categories)
          .values({ name, isSystemReserved: false, createdAt: Date.now() })
          .returning();
        categoryIdByName.set(name, created.id);
        return created.id;
      };
      for (const row of data.Categories ?? []) {
        await getOrCreateCategoryId(String(row.Name));
      }
      rowCounts.Categories = data.Categories?.length ?? 0;

      // ---- Tags: same get-or-create-by-name pattern as Categories. ----
      const existingTags = await tx.select().from(tags);
      const tagIdByName = new Map(existingTags.map(t => [t.name, t.id]));
      const getOrCreateTagId = async (name: string): Promise<number> => {
        const existingId = tagIdByName.get(name);
        if (existingId != null) {
          return existingId;
        }
        const [created] = await tx
          .insert(tags)
          .values({ name, createdAt: Date.now() })
          .returning();
        tagIdByName.set(name, created.id);
        return created.id;
      };
      for (const row of data.Tags ?? []) {
        await getOrCreateTagId(String(row.Name));
      }
      rowCounts.Tags = data.Tags?.length ?? 0;

      // ---- Accounts: get-or-create by name. Phase 1 already rejected
      // any name colliding with an existing account of a DIFFERENT
      // type, so reusing by name alone here is safe. ----
      const existingAccounts = await tx.select().from(accounts);
      const accountIdByName = new Map(
        existingAccounts.map(a => [a.name, a.id]),
      );
      for (const row of data.Accounts ?? []) {
        const name = String(row.Name);
        if (accountIdByName.has(name)) {
          continue;
        }
        const [created] = await tx
          .insert(accounts)
          .values({
            name,
            type: String(row.Type),
            active: Boolean(row.Active),
            createdAt: dateOnlyToEpoch(String(row.CreatedAt ?? '')),
          })
          .returning();
        accountIdByName.set(name, created.id);
      }
      rowCounts.Accounts = data.Accounts?.length ?? 0;

      // ---- AccountBalances: absolute-sets the baseline. This already
      // carries the cumulative effect of every historical Transfer,
      // LoanPayment, and CreditCardPayoff as of export time — those
      // three tables below are pure historical-record inserts and must
      // NEVER also shift a balance, or their effect would be
      // double-counted. ----
      for (const row of data.AccountBalances ?? []) {
        const accountId = accountIdByName.get(String(row.AccountName));
        const currencyId = currencyIdByCode.get(String(row.CurrencyCode));
        if (accountId == null || currencyId == null) {
          continue; // unreachable if Phase 1 validated; never trust silently
        }
        await upsertAccountBalanceWithin(
          tx,
          accountId,
          currencyId,
          Number(row.Balance),
        );
      }
      rowCounts.AccountBalances = data.AccountBalances?.length ?? 0;

      // ---- Transactions: the main bulk-import sheet. Every regular
      // transaction is summed live by getAccountBalance, never baked
      // into the baseline, so these must be re-inserted for balance
      // fidelity even when AccountBalances is also present. ----
      for (const row of data.Transactions ?? []) {
        const accountId = accountIdByName.get(String(row.AccountName));
        const currencyId = currencyIdByCode.get(String(row.CurrencyCode));
        if (accountId == null || currencyId == null) {
          continue;
        }
        const entryType = row.EntryType === 'Income' ? 'Income' : 'Expense';
        const categoryName = String(row.CategoryName ?? '');
        const categoryId =
          entryType === 'Income' || !categoryName
            ? null
            : await getOrCreateCategoryId(categoryName);
        const [createdTxn] = await tx
          .insert(transactions)
          .values({
            accountId,
            amount: Number(row.Amount),
            categoryId,
            description: String(row.Description ?? '') || null,
            date: String(row.Date),
            entryType,
            currencyId,
            excludeFromBudget: Boolean(row.ExcludeFromBudget),
            createdAt: dateOnlyToEpoch(String(row.CreatedAt ?? '')),
          })
          .returning();
        const tagNames = splitTagNames(String(row.Tags ?? ''));
        for (const tagName of tagNames) {
          const tagId = await getOrCreateTagId(tagName);
          await tx
            .insert(transactionTags)
            .values({ transactionId: createdTxn.id, tagId });
        }
      }
      rowCounts.Transactions = data.Transactions?.length ?? 0;

      // ---- Budgets: one overall budget per (month, currency), upserted
      // accordingly — same semantics as upsertBudget. A blank/missing
      // CurrencyCode (pre-v2 export) falls back to defaultCurrencyId
      // above rather than being skipped, so restoring an old backup
      // still lands its budgets somewhere sensible. ----
      for (const row of data.Budgets ?? []) {
        const month = String(row.Month);
        const rawCurrencyCode = String(row.CurrencyCode ?? '');
        const currencyId = rawCurrencyCode
          ? (currencyIdByCode.get(rawCurrencyCode) ?? defaultCurrencyId)
          : defaultCurrencyId;
        if (currencyId == null) {
          continue; // no currency to resolve to at all — nothing sane to import against
        }
        const [existing] = await tx
          .select()
          .from(budgets)
          .where(
            and(eq(budgets.month, month), eq(budgets.currencyId, currencyId)),
          )
          .limit(1);
        if (existing) {
          await tx
            .update(budgets)
            .set({ limitAmount: Number(row.LimitAmount) })
            .where(eq(budgets.id, existing.id));
        } else {
          await tx.insert(budgets).values({
            category: String(row.Category),
            limitAmount: Number(row.LimitAmount),
            period: String(row.Period),
            startDate: dateOnlyToEpoch(String(row.StartDate ?? '')),
            month,
            currencyId,
            createdAt: dateOnlyToEpoch(String(row.CreatedAt ?? '')),
          });
        }
      }
      rowCounts.Budgets = data.Budgets?.length ?? 0;

      // ---- CategoryBudgets: upserted by (month, categoryId, currencyId)
      // — same CurrencyCode fallback as Budgets above. ----
      for (const row of data.CategoryBudgets ?? []) {
        const month = String(row.Month);
        const categoryId = await getOrCreateCategoryId(
          String(row.CategoryName),
        );
        const rawCurrencyCode = String(row.CurrencyCode ?? '');
        const currencyId = rawCurrencyCode
          ? (currencyIdByCode.get(rawCurrencyCode) ?? defaultCurrencyId)
          : defaultCurrencyId;
        if (currencyId == null) {
          continue;
        }
        const [existing] = await tx
          .select()
          .from(categoryBudgets)
          .where(
            and(
              eq(categoryBudgets.month, month),
              eq(categoryBudgets.categoryId, categoryId),
              eq(categoryBudgets.currencyId, currencyId),
            ),
          )
          .limit(1);
        if (existing) {
          await tx
            .update(categoryBudgets)
            .set({ amount: Number(row.Amount) })
            .where(eq(categoryBudgets.id, existing.id));
        } else {
          await tx.insert(categoryBudgets).values({
            month,
            categoryId,
            currencyId,
            amount: Number(row.Amount),
          });
        }
      }
      rowCounts.CategoryBudgets = data.CategoryBudgets?.length ?? 0;

      // ---- Transfers: pure historical-record insert, no balance shift
      // — see the AccountBalances comment above. ----
      //
      // transferIdByKey is built as we go so SavingsContributions (far
      // below) can re-link each restored contribution to the transfer
      // that funded it. The key is the same set of fields a person would
      // eyeball-match the two sheets with — goal-funding date, source
      // account, destination account and amount — since neither sheet
      // carries an id.
      const transferIdByKey = new Map<string, number>();
      for (const row of data.Transfers ?? []) {
        const fromAccountId = accountIdByName.get(String(row.FromAccountName));
        const toAccountId = accountIdByName.get(String(row.ToAccountName));
        const currencyId = currencyIdByCode.get(String(row.CurrencyCode));
        if (fromAccountId == null || toAccountId == null || currencyId == null) {
          continue;
        }
        // A workbook exported before transfers could convert has neither
        // to-side column. Falling back to the from side restores such a
        // row as the same-currency transfer it always was, rather than
        // dropping it.
        const toCurrencyCode = String(row.ToCurrencyCode ?? '');
        const toCurrencyId =
          (toCurrencyCode ? currencyIdByCode.get(toCurrencyCode) : undefined) ??
          currencyId;
        const toAmount =
          row.ToAmount === undefined || row.ToAmount === ''
            ? Number(row.Amount)
            : Number(row.ToAmount);
        const [inserted] = await tx
          .insert(transfers)
          .values({
            fromAccountId,
            toAccountId,
            amount: Number(row.Amount),
            currencyId,
            toCurrencyId,
            toAmount,
            description: String(row.Description ?? '') || null,
            date: String(row.Date),
            createdAt: dateOnlyToEpoch(String(row.CreatedAt ?? '')),
          })
          .returning({ id: transfers.id });
        const key = `${String(row.Date)}|${fromAccountId}|${toAccountId}|${toAmount}`;
        // First writer wins: with two identical transfers on one day,
        // the contribution can only be paired with one of them, and
        // either choice restores the same numbers.
        if (!transferIdByKey.has(key)) {
          transferIdByKey.set(key, inserted.id);
        }
      }
      rowCounts.Transfers = data.Transfers?.length ?? 0;

      // ---- LoanDetails: one row per Liability/Receivable account,
      // get-or-create by accountId (the schema's own unique key). ----
      for (const row of data.LoanDetails ?? []) {
        const accountId = accountIdByName.get(String(row.AccountName));
        if (accountId == null) {
          continue;
        }
        const values = {
          accountId,
          counterpartyName: String(row.CounterpartyName),
          dateCreated: String(row.DateCreated),
          lastAccrualAnchorDate: String(row.LastAccrualAnchorDate),
          dueDate: String(row.DueDate ?? '') || null,
          interestRate:
            row.InterestRate === '' || row.InterestRate == null
              ? null
              : Number(row.InterestRate),
          interestPeriod:
            (String(row.InterestPeriod ?? '') || null) as
              | 'monthly'
              | 'annual'
              | null,
          // Blank in workbooks written before this column existed, and
          // on loans that never had one — null is the correct restore
          // in both cases, and is exactly what updateLoanAccount
          // already knows how to cope with.
          counterpartAccountId:
            accountIdByName.get(String(row.CounterpartAccountName ?? '')) ??
            null,
        };
        const [existing] = await tx
          .select()
          .from(loanDetails)
          .where(eq(loanDetails.accountId, accountId))
          .limit(1);
        if (existing) {
          await tx
            .update(loanDetails)
            .set(values)
            .where(eq(loanDetails.id, existing.id));
        } else {
          await tx.insert(loanDetails).values(values);
        }
      }
      rowCounts.LoanDetails = data.LoanDetails?.length ?? 0;

      // ---- LoanOriginations / LoanPayments / CreditCardPayoffs: pure
      // historical-record inserts, no balance shift — same reasoning as
      // Transfers. ----
      for (const row of data.LoanOriginations ?? []) {
        const loanAccountId = accountIdByName.get(String(row.LoanAccountName));
        const currencyId = currencyIdByCode.get(String(row.CurrencyCode));
        if (loanAccountId == null || currencyId == null) {
          continue;
        }
        await tx.insert(loanOriginations).values({
          loanAccountId,
          // Optional, unlike a payment's: a backfilled row genuinely has
          // no counterpart account, so a missing one is restored as null
          // rather than dropping the whole row.
          counterpartAccountId:
            accountIdByName.get(String(row.CounterpartAccountName ?? '')) ??
            null,
          amount: Number(row.Amount),
          currencyId,
          date: String(row.Date),
          createdAt: dateOnlyToEpoch(String(row.CreatedAt ?? '')),
        });
      }
      rowCounts.LoanOriginations = data.LoanOriginations?.length ?? 0;

      for (const row of data.LoanPayments ?? []) {
        const loanAccountId = accountIdByName.get(String(row.LoanAccountName));
        const counterpartAccountId = accountIdByName.get(
          String(row.CounterpartAccountName),
        );
        const currencyId = currencyIdByCode.get(String(row.CurrencyCode));
        if (
          loanAccountId == null ||
          counterpartAccountId == null ||
          currencyId == null
        ) {
          continue;
        }
        await tx.insert(loanPayments).values({
          loanAccountId,
          counterpartAccountId,
          amount: Number(row.Amount),
          currencyId,
          date: String(row.Date),
          createdAt: dateOnlyToEpoch(String(row.CreatedAt ?? '')),
        });
      }
      rowCounts.LoanPayments = data.LoanPayments?.length ?? 0;

      for (const row of data.CreditCardPayoffs ?? []) {
        const creditCardAccountId = accountIdByName.get(
          String(row.CreditCardAccountName),
        );
        const payingAccountId = accountIdByName.get(
          String(row.PayingAccountName),
        );
        const currencyId = currencyIdByCode.get(String(row.CurrencyCode));
        if (
          creditCardAccountId == null ||
          payingAccountId == null ||
          currencyId == null
        ) {
          continue;
        }
        await tx.insert(creditCardPayoffs).values({
          creditCardAccountId,
          payingAccountId,
          amount: Number(row.Amount),
          currencyId,
          date: String(row.Date),
          createdAt: dateOnlyToEpoch(String(row.CreatedAt ?? '')),
        });
      }
      rowCounts.CreditCardPayoffs = data.CreditCardPayoffs?.length ?? 0;

      // ---- InstallmentPlans: get-or-create by name. planById keeps
      // the full row (category/currency/monthly/final amounts) for
      // InstallmentPayments below to synthesize a transaction from. ----
      const existingPlans = await tx.select().from(installmentPlans);
      const planIdByName = new Map(existingPlans.map(p => [p.name, p.id]));
      const planById = new Map(existingPlans.map(p => [p.id, p]));
      for (const row of data.InstallmentPlans ?? []) {
        const name = String(row.Name);
        if (planIdByName.has(name)) {
          continue;
        }
        const categoryId = await getOrCreateCategoryId(
          String(row.CategoryName),
        );
        const currencyId = currencyIdByCode.get(String(row.CurrencyCode));
        if (currencyId == null) {
          continue;
        }
        const [created] = await tx
          .insert(installmentPlans)
          .values({
            name,
            principalAmount:
              row.PrincipalAmount === '' || row.PrincipalAmount == null
                ? null
                : Number(row.PrincipalAmount),
            interestRate:
              row.InterestRate === '' || row.InterestRate == null
                ? null
                : Number(row.InterestRate),
            numberOfMonths: Number(row.NumberOfMonths),
            monthlyAmount: Number(row.MonthlyAmount),
            finalInstallmentAmount: Number(row.FinalInstallmentAmount),
            totalRepayable: Number(row.TotalRepayable),
            categoryId,
            currencyId,
            startDate: String(row.StartDate),
            dueDayOfMonth:
              row.DueDayOfMonth === '' || row.DueDayOfMonth == null
                ? null
                : Number(row.DueDayOfMonth),
            createdAt: dateOnlyToEpoch(String(row.CreatedAt ?? '')),
          })
          .returning();
        planIdByName.set(name, created.id);
        planById.set(created.id, created);
      }
      rowCounts.InstallmentPlans = data.InstallmentPlans?.length ?? 0;

      // ---- InstallmentPayments: synthesizes the Transaction row this
      // sheet carries no reference to (see utils/exportFormat.ts's own
      // comment — (PlanName, InstallmentNumber) was already a unique
      // key, so nothing else needed to be exported to identify a row).
      // The real DB unique index on (installmentPlanId,
      // installmentNumber) means a re-imported MERGE file must skip a
      // payment already recorded rather than throw. ----
      for (const row of data.InstallmentPayments ?? []) {
        const planId = planIdByName.get(String(row.PlanName));
        const accountId = accountIdByName.get(String(row.AccountName));
        const plan = planId != null ? planById.get(planId) : undefined;
        if (planId == null || accountId == null || !plan) {
          continue;
        }
        const installmentNumber = Number(row.InstallmentNumber);
        const [existingPayment] = await tx
          .select()
          .from(installmentPayments)
          .where(
            and(
              eq(installmentPayments.installmentPlanId, planId),
              eq(installmentPayments.installmentNumber, installmentNumber),
            ),
          )
          .limit(1);
        if (existingPayment) {
          continue;
        }
        const amount =
          installmentNumber === plan.numberOfMonths
            ? plan.finalInstallmentAmount
            : plan.monthlyAmount;
        const paidDate = String(row.PaidDate);
        const [createdTxn] = await tx
          .insert(transactions)
          .values({
            accountId,
            amount,
            categoryId: plan.categoryId,
            description: `Installment ${installmentNumber}/${plan.numberOfMonths} — ${plan.name}`,
            date: paidDate,
            entryType: 'Expense',
            currencyId: plan.currencyId,
            excludeFromBudget: false,
            createdAt: dateOnlyToEpoch(String(row.CreatedAt ?? '') || paidDate),
          })
          .returning();
        await tx.insert(installmentPayments).values({
          installmentPlanId: planId,
          installmentNumber,
          accountId,
          transactionId: createdTxn.id,
          paidDate,
          createdAt: dateOnlyToEpoch(String(row.CreatedAt ?? '')),
        });
      }
      rowCounts.InstallmentPayments = data.InstallmentPayments?.length ?? 0;

      // ---- RecurringRules: get-or-create by name. ruleById keeps the
      // full row for RecurringOccurrences below. ----
      const existingRules = await tx.select().from(recurringRules);
      const ruleIdByName = new Map(existingRules.map(r => [r.name, r.id]));
      const ruleById = new Map(existingRules.map(r => [r.id, r]));
      for (const row of data.RecurringRules ?? []) {
        const name = String(row.Name);
        if (ruleIdByName.has(name)) {
          continue;
        }
        const ruleType = row.RuleType === 'Income' ? 'Income' : 'Expense';
        const categoryName = String(row.CategoryName ?? '');
        const categoryId =
          ruleType === 'Income' || !categoryName
            ? null
            : await getOrCreateCategoryId(categoryName);
        const accountId = accountIdByName.get(String(row.AccountName));
        const currencyId = currencyIdByCode.get(String(row.CurrencyCode));
        if (accountId == null || currencyId == null) {
          continue;
        }
        const [created] = await tx
          .insert(recurringRules)
          .values({
            name,
            ruleType,
            amount: Number(row.Amount),
            dayOfMonth: Number(row.DayOfMonth),
            categoryId,
            accountId,
            currencyId,
            active: Boolean(row.Active),
            createdAt: dateOnlyToEpoch(String(row.CreatedAt ?? '')),
          })
          .returning();
        ruleIdByName.set(name, created.id);
        ruleById.set(created.id, created);
      }
      rowCounts.RecurringRules = data.RecurringRules?.length ?? 0;

      // ---- RecurringOccurrences: synthesizes a Transaction for every
      // 'confirmed' row, the same way InstallmentPayments does above —
      // a confirmed occurrence created a real transaction at the time
      // it was confirmed, but (RuleName, DueDate) was already this
      // sheet's unique key, so no transaction reference was ever
      // exported. The unique index on (recurringRuleId, dueDate) means
      // a re-imported MERGE file must skip an occurrence already
      // recorded. 'skipped'/'pending' rows never get a transactionId. ----
      for (const row of data.RecurringOccurrences ?? []) {
        const ruleId = ruleIdByName.get(String(row.RuleName));
        const rule = ruleId != null ? ruleById.get(ruleId) : undefined;
        if (ruleId == null || !rule) {
          continue;
        }
        const dueDate = String(row.DueDate);
        const [existingOccurrence] = await tx
          .select()
          .from(recurringOccurrences)
          .where(
            and(
              eq(recurringOccurrences.recurringRuleId, ruleId),
              eq(recurringOccurrences.dueDate, dueDate),
            ),
          )
          .limit(1);
        if (existingOccurrence) {
          continue;
        }
        const status = String(row.Status) as
          | 'pending'
          | 'confirmed'
          | 'skipped';
        let transactionId: number | null = null;
        const confirmedAmount =
          row.ConfirmedAmount === '' || row.ConfirmedAmount == null
            ? null
            : Number(row.ConfirmedAmount);
        if (status === 'confirmed' && confirmedAmount != null) {
          const [createdTxn] = await tx
            .insert(transactions)
            .values({
              accountId: rule.accountId,
              amount: confirmedAmount,
              categoryId: rule.categoryId,
              description: `Recurring — ${rule.name}`,
              date: dueDate,
              entryType: rule.ruleType,
              currencyId: rule.currencyId,
              excludeFromBudget: false,
              createdAt: dateOnlyToEpoch(dueDate),
            })
            .returning();
          transactionId = createdTxn.id;
        }
        await tx.insert(recurringOccurrences).values({
          recurringRuleId: ruleId,
          dueDate,
          status,
          transactionId,
          confirmedAmount,
          resolvedAt: String(row.ResolvedAt ?? '') || null,
        });
      }
      rowCounts.RecurringOccurrences = data.RecurringOccurrences?.length ?? 0;

      // ---- SavingsGoals: get-or-create by name. goalIdByName keeps the
      // map for SavingsContributions below. ----
      const existingGoals = await tx.select().from(savingsGoals);
      const goalIdByName = new Map(existingGoals.map(g => [g.name, g.id]));
      for (const row of data.SavingsGoals ?? []) {
        const name = String(row.Name);
        if (goalIdByName.has(name)) {
          continue;
        }
        const currencyId = currencyIdByCode.get(String(row.CurrencyCode));
        if (currencyId == null) {
          continue;
        }
        const status = (String(row.Status) || 'active') as
          | 'active'
          | 'achieved'
          | 'abandoned';
        // Absent in a workbook exported before goals were
        // account-backed, and absent again if the named account did not
        // survive the restore. Either way the goal comes back unlinked
        // and backfillSavingsGoalAccounts assigns it one on the next app
        // start — the same path every other legacy goal takes.
        const accountName = String(row.AccountName ?? '');
        const accountId = accountName
          ? accountIdByName.get(accountName) ?? null
          : null;
        const [created] = await tx
          .insert(savingsGoals)
          .values({
            name,
            targetAmount: Number(row.TargetAmount),
            currencyId,
            accountId,
            targetDate: String(row.TargetDate ?? '') || null,
            status,
            createdAt: dateOnlyToEpoch(String(row.CreatedAt ?? '')),
          })
          .returning();
        goalIdByName.set(name, created.id);
      }
      rowCounts.SavingsGoals = data.SavingsGoals?.length ?? 0;

      // ---- SavingsContributions: event-log insert, re-paired with the
      // transfer that funded it wherever the two sheets agree. ----
      //
      // The pairing is BEST-EFFORT and deliberately so. Neither sheet
      // carries an id, so the match is made on (date, source account,
      // goal account, amount) — enough to be right in every ordinary
      // file, and ambiguous in exactly the case a human reading the two
      // sheets would also find ambiguous: two identical transfers into
      // the same goal on the same day. A contribution that finds no
      // partner is still restored, just unlinked — it counts toward the
      // goal and can be deleted on its own, the same as a genuinely
      // legacy contribution. The one thing an unlinked row loses is the
      // "delete the transfer and the earmark goes with it" behaviour,
      // which is a fair trade against dropping the row or inventing a
      // link that might be wrong.
      const usedTransferIds = new Set<number>();
      for (const row of data.SavingsContributions ?? []) {
        const goalName = String(row.GoalName);
        const goalId = goalIdByName.get(goalName);
        if (goalId == null) {
          continue;
        }
        const [goalRow] = await tx
          .select({ accountId: savingsGoals.accountId })
          .from(savingsGoals)
          .where(eq(savingsGoals.id, goalId))
          .limit(1);
        const fromAccountName = String(row.FromAccountName ?? '');
        const fromAccountId = fromAccountName
          ? accountIdByName.get(fromAccountName)
          : undefined;
        let transferId: number | null = null;
        if (fromAccountId != null && goalRow?.accountId != null) {
          const key = `${String(row.Date)}|${fromAccountId}|${goalRow.accountId}|${Number(row.Amount)}`;
          const candidate = transferIdByKey.get(key);
          // Never link two contributions to one transfer — the schema's
          // own unique index on transfer_id would reject the second
          // insert and fail the whole import.
          if (candidate != null && !usedTransferIds.has(candidate)) {
            transferId = candidate;
            usedTransferIds.add(candidate);
          }
        }
        await tx.insert(savingsContributions).values({
          savingsGoalId: goalId,
          amount: Number(row.Amount),
          date: String(row.Date),
          note: String(row.Note ?? '') || null,
          transferId,
          createdAt: dateOnlyToEpoch(String(row.CreatedAt ?? '')),
        });
      }
      rowCounts.SavingsContributions = data.SavingsContributions?.length ?? 0;

      // ---- ExchangeRates: get-or-update by currency, one row per
      // currency (the schema's own unique key). A rate is a setting the
      // user typed, so an imported one replaces whatever is there; a
      // currency absent from the sheet keeps its shipped default. ----
      for (const row of data.ExchangeRates ?? []) {
        const currencyId = currencyIdByCode.get(String(row.CurrencyCode));
        const rate = Number(row.RatePerAnchor);
        if (currencyId == null || !Number.isFinite(rate) || rate <= 0) {
          continue;
        }
        const isCustom = String(row.IsCustom ?? '').toLowerCase() === 'true';
        const [existing] = await tx
          .select()
          .from(exchangeRates)
          .where(eq(exchangeRates.currencyId, currencyId))
          .limit(1);
        if (existing) {
          await tx
            .update(exchangeRates)
            .set({
              ratePerAnchor: rate,
              isCustom,
              updatedAt: dateOnlyToEpoch(String(row.UpdatedAt ?? '')),
            })
            .where(eq(exchangeRates.id, existing.id));
        } else {
          await tx.insert(exchangeRates).values({
            currencyId,
            ratePerAnchor: rate,
            isCustom,
            updatedAt: dateOnlyToEpoch(String(row.UpdatedAt ?? '')),
          });
        }
      }
      rowCounts.ExchangeRates = data.ExchangeRates?.length ?? 0;
    });

    // Both outside the transaction, and deliberately after it.
    //
    // seedExchangeRates: a REPLACE import from a workbook with no
    // ExchangeRates sheet (every file exported before that sheet
    // existed) has just wiped the rate table, and this puts a shipped
    // default back for any currency still missing one. It never
    // overwrites a rate the import restored — it only inserts where no
    // row exists — so a workbook that DID carry rates keeps what it
    // brought.
    //
    // normalizeRatesToDefault: the restored rates were measured against
    // whatever default the EXPORTING database had, which need not be
    // this one's. Re-anchoring makes the current default exactly 1 again
    // and leaves every pair ratio untouched, so the imported rates keep
    // saying the same thing about every pair — just phrased in the right
    // currency.
    await seedExchangeRates();
    await normalizeRatesToDefault();

    return rowCounts;
  } catch (error) {
    console.error('importData: failed to apply import', mode, error);
    throw error;
  }
}

