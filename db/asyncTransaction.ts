import { sql } from 'drizzle-orm';
import { OPSQLiteSession, OPSQLiteTransaction } from 'drizzle-orm/op-sqlite';

// WHY THIS FILE EXISTS: drizzle-orm's op-sqlite driver (0.44.x) runs
// `db.transaction(async tx => ...)` like this:
//
//   this.run(sql`begin`);
//   const result = transaction(tx);   // returns a Promise immediately
//   this.run(sql`commit`);            // fired before that Promise settles
//
// Neither statement is awaited, so COMMIT is queued right after the
// callback's FIRST statement and every later statement autocommits on its
// own. Worse, an error thrown after the first `await` rejects the
// returned Promise instead of reaching the synchronous `catch`, so
// ROLLBACK never runs. Every "this runs in one transaction, so nothing is
// half-saved" comment in db/queries/ was therefore only true on paper —
// a failure part-way through a transfer, a loan settlement or an account
// creation left whatever had already been written.
//
// The replacement below is the same three steps, awaited: BEGIN, run the
// callback to completion, then COMMIT — or ROLLBACK and rethrow. The
// shape of `tx` is unchanged, so no call site needed to change.
//
// SERIALIZED, because there is one connection. With the statements
// genuinely awaited, a second db.transaction() starting while the first
// is still open would issue a nested BEGIN, which SQLite rejects
// ("cannot start a transaction within a transaction"). Queuing them
// behind one another is the correct answer for a single-connection
// database. Nothing in db/queries opens a transaction from inside
// another one's callback (each callback only ever uses its own `tx`) —
// that is what keeps this queue from waiting on itself.
//
// Applied once, by db/index.ts, before the database handle is created.

type TransactionCallback = (tx: unknown) => Promise<unknown>;

let installed = false;
let queue: Promise<unknown> = Promise.resolve();

export function installAsyncTransactions(): void {
  if (installed) {
    return;
  }
  installed = true;

  // The prototypes are typed for drizzle's own (sync-shaped)
  // implementation; replacing a method on them needs this one cast.
  const sessionProto = OPSQLiteSession.prototype as unknown as {
    transaction: (
      fn: TransactionCallback,
      config?: { behavior?: string },
    ) => Promise<unknown>;
  };
  const txProto = OPSQLiteTransaction.prototype as unknown as {
    transaction: (fn: TransactionCallback) => Promise<unknown>;
  };

  sessionProto.transaction = function transaction(
    this: any,
    fn: TransactionCallback,
    config: { behavior?: string } = {},
  ) {
    const run = async () => {
      const tx = new (OPSQLiteTransaction as any)(
        'async',
        this.dialect,
        this,
        this.schema,
      );
      await this.run(
        sql.raw(`begin${config?.behavior ? ` ${config.behavior}` : ''}`),
      );
      try {
        const result = await fn(tx);
        await this.run(sql`commit`);
        return result;
      } catch (error) {
        try {
          await this.run(sql`rollback`);
        } catch (rollbackError) {
          // The original error is the one worth surfacing; a failed
          // rollback is logged so it is not lost entirely.
          console.error('db.transaction: rollback failed', rollbackError);
        }
        throw error;
      }
    };
    const result = queue.then(run, run);
    // The queue only orders transactions; one failing must not stop the
    // next from starting.
    queue = result.catch(() => undefined);
    return result;
  };

  // Nested transactions (savepoints) had the same unawaited shape.
  // Nothing in the app nests today, but anything that ever does should
  // get a savepoint that actually wraps its statements.
  txProto.transaction = async function transaction(
    this: any,
    fn: TransactionCallback,
  ) {
    const savepointName = `sp${this.nestedIndex}`;
    const tx = new (OPSQLiteTransaction as any)(
      'async',
      this.dialect,
      this.session,
      this.schema,
      this.nestedIndex + 1,
    );
    await this.session.run(sql.raw(`savepoint ${savepointName}`));
    try {
      const result = await fn(tx);
      await this.session.run(sql.raw(`release savepoint ${savepointName}`));
      return result;
    } catch (error) {
      await this.session.run(sql.raw(`rollback to savepoint ${savepointName}`));
      throw error;
    }
  };
}
