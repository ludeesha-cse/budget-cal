// TEMPORARY INSTRUMENTATION — added alongside the TanStack Query caching
// layer so the "fewer database round trips" claim can be counted rather
// than assumed.
//
// This file wraps the query layer from the OUTSIDE: db/queries/index.ts
// runs every exported function of every domain module through
// `instrument()` before re-exporting it. Nothing inside
// db/queries/*.ts is touched — their bodies, return types and
// NETWORK-READY comments are exactly as they were, and the wrapper is a
// pure pass-through that logs the call and returns whatever the original
// returned.
//
// It only sees calls that come through the barrel (`from '../db/queries'`),
// which is every call site in the app. Calls the domain modules make to
// each other use relative imports (e.g. loans.ts -> './accounts'), so
// those internal helper calls are deliberately NOT double-counted — what
// gets logged is one line per real app-level database entry point.
//
// Gated behind __DEV__, so it costs nothing in a release build. Safe to
// delete this file (and restore db/queries/index.ts to a plain
// `export * from './x'` barrel) once the improvement has been confirmed,
// or to keep as-is for future debugging.

const LOGGING_ENABLED = __DEV__;

const hitCountsByName = new Map<string, number>();
let totalHits = 0;

export interface DbHitReport {
  total: number;
  byFunction: Record<string, number>;
}

// Snapshot of every database entry point hit so far. Also reachable from
// a debugger/console as `global.__dbHits()` (registered below).
export function getDbHitReport(): DbHitReport {
  return {
    total: totalHits,
    byFunction: Object.fromEntries(
      Array.from(hitCountsByName.entries()).sort((a, b) => b[1] - a[1]),
    ),
  };
}

// Call this from the console right before a "navigate between screens
// without changing data" pass so the counts that follow start from zero.
export function resetDbHitReport(): void {
  hitCountsByName.clear();
  totalHits = 0;
  console.log('[db] hit counters reset');
}

export function logDbHitReport(label = 'db hit report'): void {
  const report = getDbHitReport();
  console.log(`[db] ${label}: ${report.total} total DB hits`, report.byFunction);
}

function recordHit(name: string): number {
  const next = (hitCountsByName.get(name) ?? 0) + 1;
  hitCountsByName.set(name, next);
  totalHits += 1;
  return next;
}

// Wraps every function-valued property of `mod`, passing anything else
// (exported constants such as CREDIT_CARD_TYPE) straight through. The
// `T` in / `T` out signature is what keeps every call site's inferred
// types — including `Awaited<ReturnType<typeof getAccounts>>`, which
// several hooks derive their row types from — byte-for-byte identical to
// the un-instrumented barrel.
export function instrument<T extends Record<string, unknown>>(mod: T): T {
  if (!LOGGING_ENABLED) {
    return mod;
  }
  const wrapped: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(mod)) {
    if (typeof value !== 'function') {
      wrapped[name] = value;
      continue;
    }
    const original = value as (...args: unknown[]) => unknown;
    wrapped[name] = (...args: unknown[]) => {
      const callNumber = recordHit(name);
      console.log(`[db] ${name}() call #${callNumber} — ${totalHits} DB hits total`);
      return original(...args);
    };
  }
  return wrapped as T;
}

if (LOGGING_ENABLED) {
  // Handy from the Metro/Chrome console: __dbHits() to read the running
  // totals, __resetDbHits() to zero them before a navigation pass.
  const devGlobal = globalThis as unknown as Record<string, unknown>;
  devGlobal.__dbHits = getDbHitReport;
  devGlobal.__resetDbHits = resetDbHitReport;
}
