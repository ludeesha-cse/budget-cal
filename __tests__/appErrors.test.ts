import {
  AppError,
  INSUFFICIENT_FUNDS_MESSAGE,
  STORAGE_ERROR_MESSAGE,
  UNKNOWN_ERROR_MESSAGE,
  insufficientFundsError,
  reportError,
  toAppError,
  toUserMessage,
  validationError,
} from '../utils/appErrors';

// drizzle wraps a failing statement in its own error and keeps the
// SQLite error as `cause` — the shape most real failures arrive in.
function drizzleWrapped(sqliteMessage: string): Error {
  const cause = new Error(sqliteMessage);
  const wrapper = new Error('Failed to run the query \'insert into "x" ...\'');
  (wrapper as Error & { cause?: unknown }).cause = cause;
  return wrapper;
}

describe('toUserMessage', () => {
  test.each([
    'database or disk is full',
    'SQLITE_FULL: database or disk is full',
    'disk I/O error',
    'database is locked',
    'SQLITE_BUSY: database is locked',
    'out of memory',
  ])('storage failure "%s" becomes the storage sentence', raw => {
    expect(toUserMessage(new Error(raw))).toBe(STORAGE_ERROR_MESSAGE);
    expect(toUserMessage(drizzleWrapped(raw))).toBe(STORAGE_ERROR_MESSAGE);
  });

  test('a duplicate names the thing the user typed', () => {
    const error = drizzleWrapped('UNIQUE constraint failed: categories.name');
    expect(toUserMessage(error, { name: 'Food' })).toBe(
      "A category called 'Food' already exists.",
    );
    expect(toUserMessage(error)).toBe('A category with that name already exists.');
  });

  test('a duplicate in another table uses that table’s word, or the caller’s', () => {
    expect(
      toUserMessage(new Error('UNIQUE constraint failed: tags.name'), {
        name: 'Shared',
      }),
    ).toBe("A tag called 'Shared' already exists.");
    expect(
      toUserMessage(new Error('UNIQUE constraint failed: currencies.code'), {
        entity: 'currency',
        name: 'USD',
      }),
    ).toBe("A currency called 'USD' already exists.");
    expect(
      toUserMessage(
        new Error('UNIQUE constraint failed: account_balances.account_id'),
      ),
    ).toBe('This account already holds that currency.');
  });

  test('a foreign key failure says the account is gone', () => {
    expect(toUserMessage(new Error('FOREIGN KEY constraint failed'))).toBe(
      'That account no longer exists — it may have been deleted.',
    );
    expect(
      toUserMessage(new Error('FOREIGN KEY constraint failed'), {
        entity: 'category',
      }),
    ).toBe('That category no longer exists — it may have been deleted.');
  });

  test.each([
    "Cannot read property 'id' of undefined",
    'no such table: transactions',
    "undefined is not an object (evaluating 'a.id')",
    '',
  ])('raw text "%s" never reaches the user', raw => {
    expect(toUserMessage(new Error(raw))).toBe(UNKNOWN_ERROR_MESSAGE);
  });

  test('non-Error values fall back too', () => {
    expect(toUserMessage('boom')).toBe(UNKNOWN_ERROR_MESSAGE);
    expect(toUserMessage(undefined)).toBe(UNKNOWN_ERROR_MESSAGE);
    expect(toUserMessage({ weird: true })).toBe(UNKNOWN_ERROR_MESSAGE);
  });

  test('a caller can supply its own fallback for non-database operations', () => {
    expect(
      toUserMessage(new Error('DEVELOPER_ERROR 10'), {
        fallback: 'Sign-in did not complete. Please try again.',
      }),
    ).toBe('Sign-in did not complete. Please try again.');
  });

  test('an AppError passes through with its own message and field', () => {
    const error = validationError('Choose an account', 'account');
    expect(toUserMessage(error)).toBe('Choose an account');
    expect(toAppError(error)).toBe(error);
    expect(toAppError(error).field).toBe('account');
  });

  test('the insufficient-balance error carries the exact sentence and the account field', () => {
    const error = insufficientFundsError();
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('INSUFFICIENT_FUNDS');
    expect(error.field).toBe('account');
    expect(toUserMessage(error)).toBe(
      'Insufficient balance, transfer or withdraw to the account first',
    );
    expect(INSUFFICIENT_FUNDS_MESSAGE).toBe(
      'Insufficient balance, transfer or withdraw to the account first',
    );
  });
});

describe('reportError', () => {
  test('logs the technical cause with the operation name and returns the friendly error', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const raw = new Error('database is locked');
    const appError = reportError(raw, { operation: 'Cannot save category' });
    expect(appError.message).toBe(STORAGE_ERROR_MESSAGE);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Cannot save category'),
      raw,
    );
    spy.mockRestore();
  });
});
