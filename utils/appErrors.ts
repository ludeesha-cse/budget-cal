// One vocabulary for "something went wrong", shared by the query layer
// (which knows WHAT failed) and the UI (which has to say it to a person).
//
// THE RULE THIS FILE ENFORCES: raw SQLite or JavaScript error text never
// reaches the user. "UNIQUE constraint failed: categories.name",
// "database is locked" and "Cannot read property 'id' of undefined" are
// all true, and none of them tells someone holding a phone what to do.
// So:
//
//   * A failure the user can fix (a missing account, an empty amount, a
//     name that is already taken, not enough money in the account) is
//     thrown from db/queries as an AppError whose message is already the
//     sentence to show.
//   * Anything else is passed through toUserMessage(), which recognises
//     the handful of SQLite failures worth naming (storage, duplicates,
//     missing rows) and otherwise falls back to one honest sentence.
//
// The technical cause is never thrown away — it is logged with the
// operation's name, so it is still there when someone has to debug it.

export type AppErrorCode =
  // The phone could not complete the write: disk full, I/O error, the
  // database busy or locked, out of memory.
  | 'STORAGE'
  // A unique constraint: a category, tag or currency that already exists.
  | 'DUPLICATE'
  // A row the write depends on is gone (deleted elsewhere, or a foreign
  // key that no longer resolves).
  | 'NOT_FOUND'
  | 'ACCOUNT_MISSING'
  // The default "Cash in wallet" account specifically.
  | 'WALLET_MISSING'
  | 'ACCOUNT_INACTIVE'
  | 'CURRENCY_MISSING'
  | 'CURRENCY_INACTIVE'
  // The account exists but holds no balance in the currency being used.
  | 'ACCOUNT_CURRENCY_MISSING'
  | 'INSUFFICIENT_FUNDS'
  | 'INVALID_AMOUNT'
  // Any other "the input is not acceptable" rule from the query layer.
  | 'VALIDATION'
  | 'UNKNOWN';

export type AppErrorOptions = {
  // Which form field the problem belongs to, so a form can show the
  // message next to that control instead of (or as well as) an Alert.
  // 'account' means "the account this money comes out of".
  field?: string;
  cause?: unknown;
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly field?: string;
  readonly cause?: unknown;

  constructor(
    code: AppErrorCode,
    message: string,
    options: AppErrorOptions = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.field = options.field;
    this.cause = options.cause;
    // Keeps `instanceof AppError` working after Babel's class transform.
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

// The exact sentence Part 3 of the balance rules asks for. Exported so the
// form-side check and the query-layer safety net cannot drift apart.
export const INSUFFICIENT_FUNDS_MESSAGE =
  'Insufficient balance, transfer or withdraw to the account first';

export const STORAGE_ERROR_MESSAGE =
  "Couldn't save — your phone may be low on storage. Nothing was saved. Please free up space and try again.";

export const UNKNOWN_ERROR_MESSAGE =
  'Something went wrong and nothing was saved. Please try again.';

// Shorthand for the most common case in db/queries: a rule the user broke
// and can fix, worded as the sentence to show them.
export function validationError(message: string, field?: string): AppError {
  return new AppError('VALIDATION', message, { field });
}

export function insufficientFundsError(): AppError {
  return new AppError('INSUFFICIENT_FUNDS', INSUFFICIENT_FUNDS_MESSAGE, {
    field: 'account',
  });
}

export type ErrorContext = {
  // What was being attempted, for the log line ("addTransaction",
  // "Cannot save category"). Never shown to the user.
  operation?: string;
  // What kind of thing was being written, for the duplicate / not-found
  // sentences: 'category', 'tag', 'currency', 'account'.
  entity?: string;
  // The name the user typed, so a duplicate can be named back to them.
  name?: string;
  // The sentence to use when nothing more specific is known. Defaults to
  // UNKNOWN_ERROR_MESSAGE, which promises nothing was saved — a caller
  // whose operation is not a database write (signing in, opening a file)
  // passes its own.
  fallback?: string;
};

const STORAGE_PATTERNS = [
  /database or disk is full/i,
  /SQLITE_FULL/i,
  /disk i\/o error/i,
  /SQLITE_IOERR/i,
  /database is locked/i,
  /SQLITE_BUSY/i,
  /SQLITE_LOCKED/i,
  /database table is locked/i,
  /out of memory/i,
  /SQLITE_NOMEM/i,
  /unable to open database/i,
  /SQLITE_CANTOPEN/i,
  /attempt to write a readonly database/i,
  /SQLITE_READONLY/i,
];

// Table name in "UNIQUE constraint failed: <table>.<column>" -> the word
// a person would use for one row of it.
const ENTITY_BY_TABLE: Record<string, string> = {
  categories: 'category',
  tags: 'tag',
  currencies: 'currency',
  accounts: 'account',
  budgets: 'budget',
  category_budgets: 'category budget',
  exchange_rates: 'exchange rate',
};

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return '';
}

// Walks the `cause` chain too: drizzle wraps a failed statement in its
// own error ("Failed to run the query ...") with the SQLite error as the
// cause, and either layer can carry the text that identifies it.
function allMessages(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current != null && depth < 5; depth += 1) {
    parts.push(messageOf(current));
    current = (current as { cause?: unknown }).cause;
  }
  return parts.join(' | ');
}

function duplicateMessage(rawText: string, context: ErrorContext): string {
  const table = /UNIQUE constraint failed:\s*([a-z_]+)\./i.exec(rawText)?.[1];
  if (table === 'account_balances') {
    return 'This account already holds that currency.';
  }
  const entity =
    context.entity ??
    (table ? ENTITY_BY_TABLE[table.toLowerCase()] : undefined);
  if (entity && context.name?.trim()) {
    return `A ${entity} called '${context.name.trim()}' already exists.`;
  }
  if (entity) {
    return `A ${entity} with that name already exists.`;
  }
  return 'That already exists.';
}

// Classifies any thrown value into an AppError with a user-facing
// message. Pure: no logging, no side effects — see reportError for the
// logged version every UI path should call.
export function toAppError(
  error: unknown,
  context: ErrorContext = {},
): AppError {
  if (isAppError(error)) {
    return error;
  }
  const rawText = allMessages(error);

  if (STORAGE_PATTERNS.some(pattern => pattern.test(rawText))) {
    return new AppError('STORAGE', STORAGE_ERROR_MESSAGE, { cause: error });
  }
  if (/UNIQUE constraint failed/i.test(rawText)) {
    return new AppError('DUPLICATE', duplicateMessage(rawText, context), {
      cause: error,
    });
  }
  if (/FOREIGN KEY constraint failed/i.test(rawText)) {
    const entity = context.entity ?? 'account';
    return new AppError(
      'NOT_FOUND',
      `That ${entity} no longer exists — it may have been deleted.`,
      { cause: error },
    );
  }
  return new AppError('UNKNOWN', context.fallback ?? UNKNOWN_ERROR_MESSAGE, {
    cause: error,
  });
}

// The sentence to show for `error`. Never returns raw error text unless
// that text came from an AppError, whose message was written for a
// person in the first place.
export function toUserMessage(
  error: unknown,
  context: ErrorContext = {},
): string {
  return toAppError(error, context).message;
}

// toAppError plus the log line. Logs the ORIGINAL error (and the
// operation name) so the technical cause is never lost, even though the
// user only ever sees the friendly sentence. An AppError the query layer
// threw on purpose (a validation rule) is an expected outcome, so it is
// logged as a warning rather than an error.
export function reportError(
  error: unknown,
  context: ErrorContext = {},
): AppError {
  const appError = toAppError(error, context);
  const label = context.operation ?? 'operation';
  if (
    isAppError(error) &&
    error.code !== 'UNKNOWN' &&
    error.code !== 'STORAGE'
  ) {
    console.warn(`[${label}] ${error.code}: ${error.message}`);
  } else {
    console.error(`[${label}] failed (${appError.code})`, error);
  }
  return appError;
}
