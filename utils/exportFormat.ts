// Stage 17a: the single source of truth for the exported workbook's
// shape — sheet names, in order, and each sheet's column headers, in
// order. utils/excelExport.ts (this stage) and Stage 17b's importer must
// both read this same constant rather than each defining their own copy
// of the format. One definition, two consumers — a format that drifts
// between exporter and importer is the most likely way this feature
// silently breaks.

// Bumped whenever the export format changes (a sheet added/removed, a
// column added/removed/renamed, or a value's meaning changes). Written
// into every export's Meta sheet so a future importer can tell which
// format version it's reading, and reject or migrate a file it doesn't
// recognize — added now, at v1, because retrofitting this later would
// leave every file exported before that point unidentifiable.
// v2: Budgets and CategoryBudgets gained a CurrencyCode column, matching
// the multi-currency budgets change (see schema.ts's budgets/
// categoryBudgets currencyId columns) — a v1 file has no currency
// information for these two sheets at all, so the importer treats a
// missing CurrencyCode as the app's current default currency rather than
// guessing.
export const SCHEMA_VERSION = 2;

export type SheetName =
  | 'Meta'
  | 'Currencies'
  | 'Accounts'
  | 'AccountBalances'
  | 'Categories'
  | 'Tags'
  | 'Transactions'
  | 'TransactionTags'
  | 'Budgets'
  | 'CategoryBudgets'
  | 'Transfers'
  | 'LoanDetails'
  | 'LoanPayments'
  | 'CreditCardPayoffs'
  | 'InstallmentPlans'
  | 'InstallmentPayments'
  | 'RecurringRules'
  | 'RecurringOccurrences'
  | 'SavingsGoals'
  | 'SavingsContributions';

// Order here is the order sheets appear in the workbook. Meta first so
// anyone opening the file — human or importer — immediately sees which
// format version they're looking at before anything else.
export const SHEET_ORDER: SheetName[] = [
  'Meta',
  'Currencies',
  'Accounts',
  'AccountBalances',
  'Categories',
  'Tags',
  'Transactions',
  'TransactionTags',
  'Budgets',
  'CategoryBudgets',
  'Transfers',
  'LoanDetails',
  'LoanPayments',
  'CreditCardPayoffs',
  'InstallmentPlans',
  'InstallmentPayments',
  'RecurringRules',
  'RecurringOccurrences',
  'SavingsGoals',
  'SavingsContributions',
];

// Column headers, in order, per sheet. Every reference to another table
// is by its human-readable name/code (AccountName, CategoryName,
// CurrencyCode, TagName, ...) rather than an internal database id — ids
// are meaningless once restored into a fresh database and would only
// invite something to depend on them. No sheet has an "Id" column
// anywhere in this list, on purpose.
export const SHEET_COLUMNS: Record<SheetName, string[]> = {
  Meta: ['SchemaVersion', 'ExportedAt', 'AppVersion'],
  Currencies: ['Code', 'Name', 'IsDefault', 'CreatedAt'],
  Accounts: ['Name', 'Type', 'Active', 'CreatedAt'],
  AccountBalances: ['AccountName', 'CurrencyCode', 'Balance'],
  Categories: ['Name', 'IsSystemReserved', 'CreatedAt'],
  Tags: ['Name', 'CreatedAt'],
  Transactions: [
    'Date',
    'AccountName',
    'EntryType',
    'Amount',
    'CategoryName',
    'CurrencyCode',
    'Description',
    'Tags',
    'ExcludeFromBudget',
    'CreatedAt',
  ],
  // A normalized, one-row-per-tag view of the same tag assignments
  // already denormalized into Transactions' comma-separated Tags
  // column. Transactions have no natural human-readable key of their
  // own (no "name" field), so this sheet identifies "which transaction"
  // using the same fields a person would eyeball-match it back to a
  // Transactions row with: Date + AccountName + Amount + Description.
  // This is a best-effort match, not a guaranteed-unique key — two
  // identical transactions on the same day would be just as ambiguous
  // here as they'd be to a human reading the sheet. Deliberately no
  // invented "row number" column to work around that: an export-local
  // ordinal would still just be an id by another name.
  TransactionTags: ['Date', 'AccountName', 'Amount', 'Description', 'TagName'],
  Budgets: [
    'Month',
    'CurrencyCode',
    'Category',
    'LimitAmount',
    'Period',
    'StartDate',
    'CreatedAt',
  ],
  CategoryBudgets: ['Month', 'CategoryName', 'CurrencyCode', 'Amount'],
  Transfers: [
    'Date',
    'FromAccountName',
    'ToAccountName',
    'Amount',
    'CurrencyCode',
    'CreatedAt',
  ],
  // Identified by AccountName rather than a separate "loan name" — the
  // schema enforces one loan per account (loan_details.account_id is
  // unique), so the account's own name already doubles as the loan's
  // human-readable key, and LoanPayments below references it the same
  // way.
  LoanDetails: [
    'AccountName',
    'CounterpartyName',
    'DateCreated',
    'LastAccrualAnchorDate',
    'DueDate',
    'InterestRate',
    'InterestPeriod',
  ],
  LoanPayments: [
    'Date',
    'LoanAccountName',
    'CounterpartAccountName',
    'Amount',
    'CurrencyCode',
    'CreatedAt',
  ],
  CreditCardPayoffs: [
    'Date',
    'CreditCardAccountName',
    'PayingAccountName',
    'Amount',
    'CurrencyCode',
    'CreatedAt',
  ],
  InstallmentPlans: [
    'Name',
    'PrincipalAmount',
    'InterestRate',
    'NumberOfMonths',
    'MonthlyAmount',
    'FinalInstallmentAmount',
    'TotalRepayable',
    'CategoryName',
    'CurrencyCode',
    'StartDate',
    'DueDayOfMonth',
    'CreatedAt',
  ],
  // No transaction reference needed — (PlanName, InstallmentNumber) is
  // already the schema's own unique key for a payment (see
  // plan_installment_unique in db/schema.ts), so nothing has to be
  // invented here to identify a row.
  InstallmentPayments: [
    'PlanName',
    'InstallmentNumber',
    'AccountName',
    'PaidDate',
    'CreatedAt',
  ],
  RecurringRules: [
    'Name',
    'RuleType',
    'Amount',
    'DayOfMonth',
    'CategoryName',
    'AccountName',
    'CurrencyCode',
    'Active',
    'CreatedAt',
  ],
  // No transaction reference needed — (RuleName, DueDate) is already the
  // schema's own unique key (see rule_due_date_unique in db/schema.ts).
  RecurringOccurrences: [
    'RuleName',
    'DueDate',
    'Status',
    'ConfirmedAmount',
    'ResolvedAt',
  ],
  SavingsGoals: [
    'Name',
    'TargetAmount',
    'CurrencyCode',
    'TargetDate',
    'Status',
    'CreatedAt',
  ],
  SavingsContributions: ['GoalName', 'Amount', 'Date', 'Note', 'CreatedAt'],
};

// A cell can only ever be one of these three JS types — nullable DB
// fields and "not applicable" references (e.g. Category for an Income
// transaction) are normalized to '' at the point the row is built
// (db/queries.ts's getAllDataForExport), rather than carrying `null`
// through to here. That keeps every consumer of this type — the
// projection below, the xlsx writer, and Stage 17b's importer — free of
// null-checking.
export type ExportCellValue = string | number | boolean;
export type ExportRow = Record<string, ExportCellValue>;
export type ExportWorkbookData = Record<SheetName, ExportRow[]>;

// Projects a row object into a plain array of cell values, in exactly
// the column order defined by SHEET_COLUMNS[sheet] — this is what
// guarantees a sheet's on-disk column order can never silently drift
// from the shared header list above, regardless of what order a row
// object's own keys happen to be in. Throws rather than silently writing
// a blank cell if a row is missing a column the format declares, since
// that would otherwise fail silently as an empty cell indistinguishable
// from a legitimately blank one.
export function projectRow(sheet: SheetName, row: ExportRow): ExportCellValue[] {
  return SHEET_COLUMNS[sheet].map(column => {
    if (!(column in row)) {
      throw new Error(
        `projectRow: sheet "${sheet}" row is missing expected column "${column}"`,
      );
    }
    return row[column];
  });
}
