// A stand-in for @op-engineering/op-sqlite's connection, backed by Node's
// built-in SQLite (node:sqlite, Node 22+), so the real query layer — real
// migrations, real drizzle, real SQL — can run under jest.
//
// Only the methods drizzle's op-sqlite driver and db/index.ts actually
// call are implemented: executeAsync (statements), executeRawAsync
// (rows as arrays, which drizzle maps by column position so joins with
// duplicate column names survive) and execute (rows as objects).

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

type Row = Record<string, unknown>;

function bindable(params: unknown[] | undefined): unknown[] {
  return (params ?? []).map(value => {
    if (value === undefined) {
      return null;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    return value;
  });
}

export function createSqliteClient() {
  const database = new DatabaseSync(':memory:');

  const runObjects = (query: string, params?: unknown[]): Row[] => {
    const statement = database.prepare(query);
    return statement.all(...bindable(params)) as Row[];
  };

  const runArrays = (query: string, params?: unknown[]): unknown[][] => {
    const statement = database.prepare(query);
    statement.setReturnArrays(true);
    return statement.all(...bindable(params)) as unknown[][];
  };

  const objectResult = (rows: Row[]) => {
    const list = rows as Row[] & { _array?: Row[] };
    list._array = rows;
    return { rows: list, rowsAffected: 0 };
  };

  return {
    database,
    // Lets a test break the database on purpose (e.g. drop a table the
    // write needs) to prove that a failed write rolls back.
    exec: (query: string) => database.exec(query),
    executeAsync: async (query: string, params?: unknown[]) =>
      objectResult(query.trim() ? runObjects(query, params) : []),
    executeRawAsync: async (query: string, params?: unknown[]) =>
      runArrays(query, params),
    execute: (query: string, params?: unknown[]) =>
      objectResult(runObjects(query, params)),
  };
}

export type SqliteClient = ReturnType<typeof createSqliteClient>;
