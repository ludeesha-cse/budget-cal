import * as XLSX from 'xlsx';
import {
  SCHEMA_VERSION,
  type SheetName,
  type ExportRow,
} from './exportFormat';
import {
  getAccounts,
  getCurrencies,
  getInstallmentPlans,
  getRecurringRules,
  getSavingsGoals,
} from '../db/queries';

// Stage 17b: Excel import, Phase 1 (validate) only. This file never
// writes to the database — it only reads current reference data (via
// db/queries.ts's existing read functions) to check whether a name in
// the workbook resolves to something real. The actual write phase lives
// in db/queries.ts's importData(), called separately by the caller only
// once this returns { valid: true }. Mixing the two phases in one place
// is exactly what the spec warns against, so this file is READ-ONLY by
// construction: it imports no insert/update/delete function from
// db/queries.ts at all.

export type ImportMode = 'merge' | 'replace';

// Row numbers are 1-based and count the header row as row 1, so the
// first data row is row 2 — this matches what a person sees in Excel's
// own row gutter when they go looking for the row an error names.
export type ValidationError = {
  sheet: SheetName | 'File';
  row: number;
  message: string;
};

export type ImportWorkbookData = Partial<Record<SheetName, ExportRow[]>>;

export type ValidationResult =
  | {
      valid: true;
      data: ImportWorkbookData;
      rowCounts: Partial<Record<SheetName, number>>;
    }
  | { valid: false; errors: ValidationError[] };

const VALID_ACCOUNT_TYPES = [
  'Cash',
  'Bank',
  'CreditCard',
  'CryptoWallet',
  'Receivable',
  'Liability',
];
const LOAN_ACCOUNT_TYPES = ['Liability', 'Receivable'];

// ---------------------------------------------------------------------
// Small, pure parsing helpers
// ---------------------------------------------------------------------

function cellToString(value: unknown): string {
  if (value == null) {
    return '';
  }
  return String(value).trim();
}

// Rejects calendar-invalid dates like Feb 30 that a naive `new
// Date(string)` would otherwise silently roll over into March —
// constructing from the parsed parts and reading them back is what
// catches that.
function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = cellToString(value).toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  return fallback;
}

function parseNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const str = cellToString(value);
  if (str === '') {
    return null;
  }
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------
// Workbook parsing
// ---------------------------------------------------------------------

function readSheetRows(
  workbook: XLSX.WorkBook,
  sheetName: string,
): { headers: string[]; rows: Record<string, unknown>[] } {
  const worksheet = workbook.Sheets[sheetName];
  const headerRow = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
  })[0] as unknown[] | undefined;
  const headers = (headerRow ?? []).map(h => cellToString(h));
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: '',
  });
  return { headers, rows };
}

// ---------------------------------------------------------------------
// Shared validation helpers — every one appends to the same `errors`
// array rather than throwing, so a single pass over a 300-row sheet
// collects every problem instead of stopping at the first one.
// ---------------------------------------------------------------------

class RowValidator {
  constructor(
    private readonly sheet: SheetName,
    private readonly row: Record<string, unknown>,
    private readonly rowNum: number,
    private readonly errors: ValidationError[],
  ) {}

  private push(message: string): void {
    this.errors.push({ sheet: this.sheet, row: this.rowNum, message });
  }

  string(column: string): string {
    return cellToString(this.row[column]);
  }

  requiredString(column: string): string {
    const value = this.string(column);
    if (!value) {
      this.push(`${column} is required.`);
    }
    return value;
  }

  requiredDate(column: string): string {
    const value = this.string(column);
    if (!value) {
      this.push(`${column} is required.`);
    } else if (!isValidDateString(value)) {
      this.push(`${column} "${value}" is not a valid YYYY-MM-DD date.`);
    }
    return value;
  }

  optionalDate(column: string): string {
    const value = this.string(column);
    if (value && !isValidDateString(value)) {
      this.push(`${column} "${value}" is not a valid YYYY-MM-DD date.`);
    }
    return value;
  }

  requiredNumber(column: string): number {
    const parsed = parseNumberOrNull(this.row[column]);
    if (parsed == null) {
      this.push(`${column} must be a number.`);
      return 0;
    }
    return parsed;
  }

  optionalNumber(column: string): number | null {
    const raw = this.string(column);
    if (raw === '') {
      return null;
    }
    const parsed = parseNumberOrNull(this.row[column]);
    if (parsed == null) {
      this.push(`${column} must be a number if present.`);
    }
    return parsed;
  }

  boolean(column: string, fallback: boolean): boolean {
    return parseBoolean(this.row[column], fallback);
  }

  // Requires the name to be non-blank AND present in `set` (existing DB
  // rows already merged with anything the same workbook defines) —
  // used for Account/Currency/InstallmentPlan/RecurringRule/SavingsGoal
  // references, all of which carry required fields a bare reference
  // can't supply, so they must resolve to a real, fully-defined row.
  requiredResolvedName(
    column: string,
    set: ReadonlySet<string>,
    kindLabel: string,
  ): string {
    const value = this.string(column);
    if (!value) {
      this.push(`${column} is required.`);
      return value;
    }
    if (!set.has(value)) {
      this.push(
        `${column} "${value}" does not match an existing ${kindLabel}, and no ${kindLabel} with that name is defined elsewhere in this workbook.`,
      );
    }
    return value;
  }

  // Category and Tag names need no existence check at all — either one
  // needs nothing but its own name to be a fully valid row, so any name
  // referenced anywhere is simply auto-created during apply. This
  // method exists (rather than callers just reading the cell directly)
  // purely so every "name" field in this file goes through the same
  // kind of accessor, making the two different policies visually
  // obvious side by side at each call site.
  freeformName(column: string): string {
    return this.string(column);
  }

  enumValue(column: string, allowed: readonly string[]): string {
    const value = this.string(column);
    if (!allowed.includes(value)) {
      this.push(`${column} "${value}" must be one of: ${allowed.join(', ')}.`);
    }
    return value;
  }
}

function checkRequiredHeaders(
  sheet: SheetName,
  headers: string[],
  required: string[],
  errors: ValidationError[],
): void {
  const headerSet = new Set(headers);
  for (const column of required) {
    if (!headerSet.has(column)) {
      errors.push({
        sheet,
        row: 1,
        message: `Sheet "${sheet}" is missing expected column "${column}".`,
      });
    }
  }
}

// ---------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------

export async function validateExcelFile(
  base64: string,
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const data: ImportWorkbookData = {};
  const rowCounts: Partial<Record<SheetName, number>> = {};

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(base64, { type: 'base64' });
  } catch (error) {
    return {
      valid: false,
      errors: [
        {
          sheet: 'File',
          row: 0,
          message: `This file could not be read as an Excel workbook: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
    };
  }

  const present = (sheet: SheetName): boolean =>
    workbook.SheetNames.includes(sheet);

  // ---- Meta (optional — a hand-authored bulk-import file may have no
  // Meta sheet at all, which is fine; there is simply nothing to check
  // against) ----
  if (present('Meta')) {
    const { rows } = readSheetRows(workbook, 'Meta');
    const metaRow = rows[0];
    if (!metaRow) {
      errors.push({ sheet: 'Meta', row: 2, message: 'Meta sheet has no data row.' });
    } else {
      const version = parseNumberOrNull(metaRow.SchemaVersion);
      if (version == null) {
        errors.push({
          sheet: 'Meta',
          row: 2,
          message: 'SchemaVersion is missing or not a number.',
        });
      } else if (version > SCHEMA_VERSION) {
        errors.push({
          sheet: 'Meta',
          row: 2,
          message: `This file was exported by a newer version of the app (schema version ${version}) than this build understands (version ${SCHEMA_VERSION}). Update the app before importing this file.`,
        });
      }
    }
  }

  // ---- Existing reference data — reads only, never writes. This is
  // what "exists in the database already" is checked against below. ----
  // Categories and Tags need no existence read at all — either one is
  // freely auto-createable from a bare name reference (see the
  // freeformName() accessor below), so there's nothing to check them
  // against here.
  const [
    dbAccounts,
    dbCurrencies,
    dbInstallmentPlans,
    dbRecurringRules,
    dbSavingsGoals,
  ] = await Promise.all([
    getAccounts(),
    getCurrencies(),
    getInstallmentPlans(),
    getRecurringRules(false),
    getSavingsGoals(),
  ]);

  const accountTypeByName = new Map(dbAccounts.map(a => [a.name, a.type]));
  const accountNameSet = new Set(dbAccounts.map(a => a.name));
  const currencyCodeSet = new Set(dbCurrencies.map(c => c.code));
  const installmentPlanNameSet = new Set(dbInstallmentPlans.map(p => p.name));
  const recurringRuleNameSet = new Set(dbRecurringRules.map(r => r.name));
  const savingsGoalNameSet = new Set(dbSavingsGoals.map(g => g.name));

  // ---- Currencies ----
  if (present('Currencies')) {
    const { headers, rows } = readSheetRows(workbook, 'Currencies');
    checkRequiredHeaders('Currencies', headers, ['Code', 'Name'], errors);
    const sheetRows: ExportRow[] = [];
    rows.forEach((row, i) => {
      const v = new RowValidator('Currencies', row, i + 2, errors);
      const code = v.requiredString('Code');
      const name = v.requiredString('Name');
      const isDefault = v.boolean('IsDefault', false);
      const createdAt = v.string('CreatedAt');
      if (code) {
        currencyCodeSet.add(code);
      }
      sheetRows.push({ Code: code, Name: name, IsDefault: isDefault, CreatedAt: createdAt });
    });
    data.Currencies = sheetRows;
    rowCounts.Currencies = sheetRows.length;
  }

  // ---- Accounts ----
  if (present('Accounts')) {
    const { headers, rows } = readSheetRows(workbook, 'Accounts');
    checkRequiredHeaders('Accounts', headers, ['Name', 'Type'], errors);
    const sheetRows: ExportRow[] = [];
    rows.forEach((row, i) => {
      const v = new RowValidator('Accounts', row, i + 2, errors);
      const name = v.requiredString('Name');
      const type = v.enumValue('Type', VALID_ACCOUNT_TYPES);
      const active = v.boolean('Active', true);
      const createdAt = v.string('CreatedAt');
      if (name) {
        // An account name colliding with an EXISTING account of a
        // DIFFERENT type is rejected rather than silently reused —
        // silently treating a Cash account as a CreditCard (or vice
        // versa) would flip the debt-inversion balance math in
        // utils/balanceMath.ts for every transaction against it.
        const existingType = accountTypeByName.get(name);
        if (existingType != null && existingType !== type && type) {
          errors.push({
            sheet: 'Accounts',
            row: i + 2,
            message: `Account "${name}" already exists with type "${existingType}", but this sheet says "${type}". An account's type can't change on import.`,
          });
        }
        accountNameSet.add(name);
      }
      sheetRows.push({ Name: name, Type: type, Active: active, CreatedAt: createdAt });
    });
    data.Accounts = sheetRows;
    rowCounts.Accounts = sheetRows.length;
  }

  // ---- Categories ----
  if (present('Categories')) {
    const { headers, rows } = readSheetRows(workbook, 'Categories');
    checkRequiredHeaders('Categories', headers, ['Name'], errors);
    const sheetRows: ExportRow[] = [];
    rows.forEach((row, i) => {
      const v = new RowValidator('Categories', row, i + 2, errors);
      const name = v.requiredString('Name');
      const createdAt = v.string('CreatedAt');
      // IsSystemReserved from the sheet is deliberately never trusted —
      // see the identical decision made in db/queries.ts's importData.
      sheetRows.push({ Name: name, IsSystemReserved: false, CreatedAt: createdAt });
    });
    data.Categories = sheetRows;
    rowCounts.Categories = sheetRows.length;
  }

  // ---- Tags ----
  if (present('Tags')) {
    const { headers, rows } = readSheetRows(workbook, 'Tags');
    checkRequiredHeaders('Tags', headers, ['Name'], errors);
    const sheetRows: ExportRow[] = [];
    rows.forEach((row, i) => {
      const v = new RowValidator('Tags', row, i + 2, errors);
      const name = v.requiredString('Name');
      const createdAt = v.string('CreatedAt');
      sheetRows.push({ Name: name, CreatedAt: createdAt });
    });
    data.Tags = sheetRows;
    rowCounts.Tags = sheetRows.length;
  }

  // ---- AccountBalances ----
  if (present('AccountBalances')) {
    const { headers, rows } = readSheetRows(workbook, 'AccountBalances');
    checkRequiredHeaders(
      'AccountBalances',
      headers,
      ['AccountName', 'CurrencyCode', 'Balance'],
      errors,
    );
    const sheetRows: ExportRow[] = [];
    rows.forEach((row, i) => {
      const v = new RowValidator('AccountBalances', row, i + 2, errors);
      const accountName = v.requiredResolvedName(
        'AccountName',
        accountNameSet,
        'account',
      );
      const currencyCode = v.requiredResolvedName(
        'CurrencyCode',
        currencyCodeSet,
        'currency',
      );
      const balance = v.requiredNumber('Balance');
      sheetRows.push({
        AccountName: accountName,
        CurrencyCode: currencyCode,
        Balance: balance,
      });
    });
    data.AccountBalances = sheetRows;
    rowCounts.AccountBalances = sheetRows.length;
  }

  // ---- Transactions (the main bulk-import sheet) ----
  if (present('Transactions')) {
    const { headers, rows } = readSheetRows(workbook, 'Transactions');
    checkRequiredHeaders(
      'Transactions',
      headers,
      ['Date', 'AccountName', 'EntryType', 'Amount', 'CurrencyCode'],
      errors,
    );
    const sheetRows: ExportRow[] = [];
    rows.forEach((row, i) => {
      const rowNum = i + 2;
      const v = new RowValidator('Transactions', row, rowNum, errors);
      const date = v.requiredDate('Date');
      const accountName = v.requiredResolvedName(
        'AccountName',
        accountNameSet,
        'account',
      );
      const entryType = v.enumValue('EntryType', ['Expense', 'Income']);
      const amount = v.requiredNumber('Amount');
      const currencyCode = v.requiredResolvedName(
        'CurrencyCode',
        currencyCodeSet,
        'currency',
      );
      const categoryName = v.freeformName('CategoryName');
      // CRITICAL (per spec): a category on an Income row is a
      // validation error, not something to accept, ignore, or silently
      // strip — it would mean the row is lying about being income-only.
      if (entryType === 'Income' && categoryName !== '') {
        errors.push({
          sheet: 'Transactions',
          row: rowNum,
          message: `CategoryName must be blank for an Income row, but got "${categoryName}".`,
        });
      }
      if (entryType === 'Expense' && categoryName === '') {
        errors.push({
          sheet: 'Transactions',
          row: rowNum,
          message: 'CategoryName is required for an Expense row.',
        });
      }
      const description = v.string('Description');
      const tags = v.string('Tags');
      const excludeFromBudget = v.boolean('ExcludeFromBudget', false);
      const createdAt = v.string('CreatedAt');
      sheetRows.push({
        Date: date,
        AccountName: accountName,
        EntryType: entryType,
        Amount: amount,
        CategoryName: categoryName,
        CurrencyCode: currencyCode,
        Description: description,
        Tags: tags,
        ExcludeFromBudget: excludeFromBudget,
        CreatedAt: createdAt,
      });
    });
    data.Transactions = sheetRows;
    rowCounts.Transactions = sheetRows.length;
  }

  // ---- TransactionTags: deliberately NOT read. Transactions' own
  // comma-separated Tags column is authoritative and sufficient to
  // reconstruct every tag assignment — re-deriving them from
  // TransactionTags' composite-match reference (Date + AccountName +
  // Amount + Description, see utils/exportFormat.ts) would be redundant
  // and could conflict with Transactions.Tags if the two were ever
  // hand-edited inconsistently. ----

  // ---- Budgets ----
  if (present('Budgets')) {
    const { headers, rows } = readSheetRows(workbook, 'Budgets');
    checkRequiredHeaders(
      'Budgets',
      headers,
      ['Month', 'Category', 'LimitAmount', 'Period'],
      errors,
    );
    const sheetRows: ExportRow[] = [];
    rows.forEach((row, i) => {
      const v = new RowValidator('Budgets', row, i + 2, errors);
      const month = v.requiredString('Month');
      const category = v.requiredString('Category');
      const limitAmount = v.requiredNumber('LimitAmount');
      const period = v.requiredString('Period');
      const startDate = v.optionalDate('StartDate');
      const createdAt = v.string('CreatedAt');
      sheetRows.push({
        Month: month,
        Category: category,
        LimitAmount: limitAmount,
        Period: period,
        StartDate: startDate,
        CreatedAt: createdAt,
      });
    });
    data.Budgets = sheetRows;
    rowCounts.Budgets = sheetRows.length;
  }

  // ---- CategoryBudgets ----
  if (present('CategoryBudgets')) {
    const { headers, rows } = readSheetRows(workbook, 'CategoryBudgets');
    checkRequiredHeaders(
      'CategoryBudgets',
      headers,
      ['Month', 'CategoryName', 'Amount'],
      errors,
    );
    const sheetRows: ExportRow[] = [];
    rows.forEach((row, i) => {
      const v = new RowValidator('CategoryBudgets', row, i + 2, errors);
      const month = v.requiredString('Month');
      const categoryName = v.requiredString('CategoryName');
      const amount = v.requiredNumber('Amount');
      sheetRows.push({ Month: month, CategoryName: categoryName, Amount: amount });
    });
    data.CategoryBudgets = sheetRows;
    rowCounts.CategoryBudgets = sheetRows.length;
  }

  // ---- Transfers ----
  if (present('Transfers')) {
    const { headers, rows } = readSheetRows(workbook, 'Transfers');
    checkRequiredHeaders(
      'Transfers',
      headers,
      ['Date', 'FromAccountName', 'ToAccountName', 'Amount', 'CurrencyCode'],
      errors,
    );
    const sheetRows: ExportRow[] = [];
    rows.forEach((row, i) => {
      const v = new RowValidator('Transfers', row, i + 2, errors);
      const date = v.requiredDate('Date');
      const fromAccountName = v.requiredResolvedName(
        'FromAccountName',
        accountNameSet,
        'account',
      );
      const toAccountName = v.requiredResolvedName(
        'ToAccountName',
        accountNameSet,
        'account',
      );
      const amount = v.requiredNumber('Amount');
      const currencyCode = v.requiredResolvedName(
        'CurrencyCode',
        currencyCodeSet,
        'currency',
      );
      const createdAt = v.string('CreatedAt');
      sheetRows.push({
        Date: date,
        FromAccountName: fromAccountName,
        ToAccountName: toAccountName,
        Amount: amount,
        CurrencyCode: currencyCode,
        CreatedAt: createdAt,
      });
    });
    data.Transfers = sheetRows;
    rowCounts.Transfers = sheetRows.length;
  }

  // ---- LoanDetails ----
  if (present('LoanDetails')) {
    const { headers, rows } = readSheetRows(workbook, 'LoanDetails');
    checkRequiredHeaders(
      'LoanDetails',
      headers,
      ['AccountName', 'CounterpartyName', 'DateCreated', 'LastAccrualAnchorDate'],
      errors,
    );
    const sheetRows: ExportRow[] = [];
    rows.forEach((row, i) => {
      const rowNum = i + 2;
      const v = new RowValidator('LoanDetails', row, rowNum, errors);
      const accountName = v.requiredResolvedName(
        'AccountName',
        accountNameSet,
        'account',
      );
      if (accountName) {
        const type = accountTypeByName.get(accountName);
        if (type != null && !LOAN_ACCOUNT_TYPES.includes(type)) {
          errors.push({
            sheet: 'LoanDetails',
            row: rowNum,
            message: `AccountName "${accountName}" must be a Liability or Receivable account, but it is "${type}".`,
          });
        }
      }
      const counterpartyName = v.requiredString('CounterpartyName');
      const dateCreated = v.requiredDate('DateCreated');
      const lastAccrualAnchorDate = v.requiredDate('LastAccrualAnchorDate');
      const dueDate = v.optionalDate('DueDate');
      const interestRate = v.optionalNumber('InterestRate');
      const interestPeriod = v.string('InterestPeriod');
      if (interestPeriod && !['monthly', 'annual'].includes(interestPeriod)) {
        errors.push({
          sheet: 'LoanDetails',
          row: rowNum,
          message: `InterestPeriod "${interestPeriod}" must be "monthly" or "annual" if present.`,
        });
      }
      sheetRows.push({
        AccountName: accountName,
        CounterpartyName: counterpartyName,
        DateCreated: dateCreated,
        LastAccrualAnchorDate: lastAccrualAnchorDate,
        DueDate: dueDate,
        InterestRate: interestRate ?? '',
        InterestPeriod: interestPeriod,
      });
    });
    data.LoanDetails = sheetRows;
    rowCounts.LoanDetails = sheetRows.length;
  }

  // ---- LoanPayments ----
  if (present('LoanPayments')) {
    const { headers, rows } = readSheetRows(workbook, 'LoanPayments');
    checkRequiredHeaders(
      'LoanPayments',
      headers,
      ['Date', 'LoanAccountName', 'CounterpartAccountName', 'Amount', 'CurrencyCode'],
      errors,
    );
    const sheetRows: ExportRow[] = [];
    rows.forEach((row, i) => {
      const v = new RowValidator('LoanPayments', row, i + 2, errors);
      const date = v.requiredDate('Date');
      const loanAccountName = v.requiredResolvedName(
        'LoanAccountName',
        accountNameSet,
        'account',
      );
      const counterpartAccountName = v.requiredResolvedName(
        'CounterpartAccountName',
        accountNameSet,
        'account',
      );
      const amount = v.requiredNumber('Amount');
      const currencyCode = v.requiredResolvedName(
        'CurrencyCode',
        currencyCodeSet,
        'currency',
      );
      const createdAt = v.string('CreatedAt');
      sheetRows.push({
        Date: date,
        LoanAccountName: loanAccountName,
        CounterpartAccountName: counterpartAccountName,
        Amount: amount,
        CurrencyCode: currencyCode,
        CreatedAt: createdAt,
      });
    });
    data.LoanPayments = sheetRows;
    rowCounts.LoanPayments = sheetRows.length;
  }

  // ---- CreditCardPayoffs ----
  if (present('CreditCardPayoffs')) {
    const { headers, rows } = readSheetRows(workbook, 'CreditCardPayoffs');
    checkRequiredHeaders(
      'CreditCardPayoffs',
      headers,
      ['Date', 'CreditCardAccountName', 'PayingAccountName', 'Amount', 'CurrencyCode'],
      errors,
    );
    const sheetRows: ExportRow[] = [];
    rows.forEach((row, i) => {
      const v = new RowValidator('CreditCardPayoffs', row, i + 2, errors);
      const date = v.requiredDate('Date');
      const creditCardAccountName = v.requiredResolvedName(
        'CreditCardAccountName',
        accountNameSet,
        'account',
      );
      const payingAccountName = v.requiredResolvedName(
        'PayingAccountName',
        accountNameSet,
        'account',
      );
      const amount = v.requiredNumber('Amount');
      const currencyCode = v.requiredResolvedName(
        'CurrencyCode',
        currencyCodeSet,
        'currency',
      );
      const createdAt = v.string('CreatedAt');
      sheetRows.push({
        Date: date,
        CreditCardAccountName: creditCardAccountName,
        PayingAccountName: payingAccountName,
        Amount: amount,
        CurrencyCode: currencyCode,
        CreatedAt: createdAt,
      });
    });
    data.CreditCardPayoffs = sheetRows;
    rowCounts.CreditCardPayoffs = sheetRows.length;
  }

  // ---- InstallmentPlans ----
  if (present('InstallmentPlans')) {
    const { headers, rows } = readSheetRows(workbook, 'InstallmentPlans');
    checkRequiredHeaders(
      'InstallmentPlans',
      headers,
      [
        'Name',
        'NumberOfMonths',
        'MonthlyAmount',
        'FinalInstallmentAmount',
        'TotalRepayable',
        'CategoryName',
        'CurrencyCode',
        'StartDate',
      ],
      errors,
    );
    const sheetRows: ExportRow[] = [];
    rows.forEach((row, i) => {
      const v = new RowValidator('InstallmentPlans', row, i + 2, errors);
      const name = v.requiredString('Name');
      const principalAmount = v.optionalNumber('PrincipalAmount');
      const interestRate = v.optionalNumber('InterestRate');
      const numberOfMonths = v.requiredNumber('NumberOfMonths');
      const monthlyAmount = v.requiredNumber('MonthlyAmount');
      const finalInstallmentAmount = v.requiredNumber('FinalInstallmentAmount');
      const totalRepayable = v.requiredNumber('TotalRepayable');
      const categoryName = v.requiredString('CategoryName');
      const currencyCode = v.requiredResolvedName(
        'CurrencyCode',
        currencyCodeSet,
        'currency',
      );
      const startDate = v.requiredDate('StartDate');
      const createdAt = v.string('CreatedAt');
      if (name) {
        installmentPlanNameSet.add(name);
      }
      sheetRows.push({
        Name: name,
        PrincipalAmount: principalAmount ?? '',
        InterestRate: interestRate ?? '',
        NumberOfMonths: numberOfMonths,
        MonthlyAmount: monthlyAmount,
        FinalInstallmentAmount: finalInstallmentAmount,
        TotalRepayable: totalRepayable,
        CategoryName: categoryName,
        CurrencyCode: currencyCode,
        StartDate: startDate,
        CreatedAt: createdAt,
      });
    });
    data.InstallmentPlans = sheetRows;
    rowCounts.InstallmentPlans = sheetRows.length;
  }

  // ---- InstallmentPayments ----
  if (present('InstallmentPayments')) {
    const { headers, rows } = readSheetRows(workbook, 'InstallmentPayments');
    checkRequiredHeaders(
      'InstallmentPayments',
      headers,
      ['PlanName', 'InstallmentNumber', 'AccountName', 'PaidDate'],
      errors,
    );
    const sheetRows: ExportRow[] = [];
    rows.forEach((row, i) => {
      const v = new RowValidator('InstallmentPayments', row, i + 2, errors);
      const planName = v.requiredResolvedName(
        'PlanName',
        installmentPlanNameSet,
        'installment plan',
      );
      const installmentNumber = v.requiredNumber('InstallmentNumber');
      const accountName = v.requiredResolvedName(
        'AccountName',
        accountNameSet,
        'account',
      );
      const paidDate = v.requiredDate('PaidDate');
      const createdAt = v.string('CreatedAt');
      sheetRows.push({
        PlanName: planName,
        InstallmentNumber: installmentNumber,
        AccountName: accountName,
        PaidDate: paidDate,
        CreatedAt: createdAt,
      });
    });
    data.InstallmentPayments = sheetRows;
    rowCounts.InstallmentPayments = sheetRows.length;
  }

  // ---- RecurringRules ----
  if (present('RecurringRules')) {
    const { headers, rows } = readSheetRows(workbook, 'RecurringRules');
    checkRequiredHeaders(
      'RecurringRules',
      headers,
      ['Name', 'RuleType', 'Amount', 'DayOfMonth', 'AccountName', 'CurrencyCode'],
      errors,
    );
    const sheetRows: ExportRow[] = [];
    rows.forEach((row, i) => {
      const rowNum = i + 2;
      const v = new RowValidator('RecurringRules', row, rowNum, errors);
      const name = v.requiredString('Name');
      const ruleType = v.enumValue('RuleType', ['Income', 'Expense']);
      const amount = v.requiredNumber('Amount');
      const dayOfMonth = v.requiredNumber('DayOfMonth');
      const categoryName = v.freeformName('CategoryName');
      // Same Income/blank-category rule as Transactions, for the same
      // reason (see db/schema.ts's recurringRules comment).
      if (ruleType === 'Income' && categoryName !== '') {
        errors.push({
          sheet: 'RecurringRules',
          row: rowNum,
          message: `CategoryName must be blank for an Income rule, but got "${categoryName}".`,
        });
      }
      if (ruleType === 'Expense' && categoryName === '') {
        errors.push({
          sheet: 'RecurringRules',
          row: rowNum,
          message: 'CategoryName is required for an Expense rule.',
        });
      }
      const accountName = v.requiredResolvedName(
        'AccountName',
        accountNameSet,
        'account',
      );
      const currencyCode = v.requiredResolvedName(
        'CurrencyCode',
        currencyCodeSet,
        'currency',
      );
      const active = v.boolean('Active', true);
      const createdAt = v.string('CreatedAt');
      if (name) {
        recurringRuleNameSet.add(name);
      }
      sheetRows.push({
        Name: name,
        RuleType: ruleType,
        Amount: amount,
        DayOfMonth: dayOfMonth,
        CategoryName: categoryName,
        AccountName: accountName,
        CurrencyCode: currencyCode,
        Active: active,
        CreatedAt: createdAt,
      });
    });
    data.RecurringRules = sheetRows;
    rowCounts.RecurringRules = sheetRows.length;
  }

  // ---- RecurringOccurrences ----
  if (present('RecurringOccurrences')) {
    const { headers, rows } = readSheetRows(workbook, 'RecurringOccurrences');
    checkRequiredHeaders(
      'RecurringOccurrences',
      headers,
      ['RuleName', 'DueDate', 'Status'],
      errors,
    );
    const sheetRows: ExportRow[] = [];
    rows.forEach((row, i) => {
      const rowNum = i + 2;
      const v = new RowValidator('RecurringOccurrences', row, rowNum, errors);
      const ruleName = v.requiredResolvedName(
        'RuleName',
        recurringRuleNameSet,
        'recurring rule',
      );
      const dueDate = v.requiredDate('DueDate');
      const status = v.enumValue('Status', ['pending', 'confirmed', 'skipped']);
      const confirmedAmount = v.optionalNumber('ConfirmedAmount');
      const resolvedAt = v.optionalDate('ResolvedAt');
      if (status === 'confirmed' && confirmedAmount == null) {
        errors.push({
          sheet: 'RecurringOccurrences',
          row: rowNum,
          message: 'ConfirmedAmount is required when Status is "confirmed".',
        });
      }
      if (status !== 'pending' && !resolvedAt) {
        errors.push({
          sheet: 'RecurringOccurrences',
          row: rowNum,
          message: 'ResolvedAt is required when Status is "confirmed" or "skipped".',
        });
      }
      sheetRows.push({
        RuleName: ruleName,
        DueDate: dueDate,
        Status: status,
        ConfirmedAmount: confirmedAmount ?? '',
        ResolvedAt: resolvedAt,
      });
    });
    data.RecurringOccurrences = sheetRows;
    rowCounts.RecurringOccurrences = sheetRows.length;
  }

  // ---- SavingsGoals ----
  if (present('SavingsGoals')) {
    const { headers, rows } = readSheetRows(workbook, 'SavingsGoals');
    checkRequiredHeaders(
      'SavingsGoals',
      headers,
      ['Name', 'TargetAmount', 'CurrencyCode'],
      errors,
    );
    const sheetRows: ExportRow[] = [];
    rows.forEach((row, i) => {
      const v = new RowValidator('SavingsGoals', row, i + 2, errors);
      const name = v.requiredString('Name');
      const targetAmount = v.requiredNumber('TargetAmount');
      const currencyCode = v.requiredResolvedName(
        'CurrencyCode',
        currencyCodeSet,
        'currency',
      );
      const targetDate = v.optionalDate('TargetDate');
      const status = v.string('Status') || 'active';
      if (!['active', 'achieved', 'abandoned'].includes(status)) {
        errors.push({
          sheet: 'SavingsGoals',
          row: i + 2,
          message: `Status "${status}" must be one of: active, achieved, abandoned.`,
        });
      }
      const createdAt = v.string('CreatedAt');
      if (name) {
        savingsGoalNameSet.add(name);
      }
      sheetRows.push({
        Name: name,
        TargetAmount: targetAmount,
        CurrencyCode: currencyCode,
        TargetDate: targetDate,
        Status: status,
        CreatedAt: createdAt,
      });
    });
    data.SavingsGoals = sheetRows;
    rowCounts.SavingsGoals = sheetRows.length;
  }

  // ---- SavingsContributions ----
  if (present('SavingsContributions')) {
    const { headers, rows } = readSheetRows(workbook, 'SavingsContributions');
    checkRequiredHeaders(
      'SavingsContributions',
      headers,
      ['GoalName', 'Amount', 'Date'],
      errors,
    );
    const sheetRows: ExportRow[] = [];
    rows.forEach((row, i) => {
      const v = new RowValidator('SavingsContributions', row, i + 2, errors);
      const goalName = v.requiredResolvedName(
        'GoalName',
        savingsGoalNameSet,
        'savings goal',
      );
      const amount = v.requiredNumber('Amount');
      const date = v.requiredDate('Date');
      const note = v.string('Note');
      const createdAt = v.string('CreatedAt');
      sheetRows.push({
        GoalName: goalName,
        Amount: amount,
        Date: date,
        Note: note,
        CreatedAt: createdAt,
      });
    });
    data.SavingsContributions = sheetRows;
    rowCounts.SavingsContributions = sheetRows.length;
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true, data, rowCounts };
}
