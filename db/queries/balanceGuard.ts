import { and, eq, sql } from 'drizzle-orm';
import { db } from '../index';
import { accountBalances, transactions } from '../schema';

// Building blocks other query functions share. Not exported through
// db/queries/index.ts: these are not app-level entry points.

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbExecutor = Pick<typeof db, 'select'>;

// Current balance of an ordinary asset account (Cash/Bank/CryptoWallet)
// in one currency: the stored baseline plus every Income minus every
// Expense recorded against it. Same formula as getAccountBalance in
// ./accounts.ts, as one SQL aggregate, and readable through a
// transaction handle so it sees that transaction's own uncommitted
// writes. Only meaningful for the account types the balance rule
// applies to — a credit card stores its balance inverted (see
// getStoredBalanceDelta), which is one more reason the guard below skips
// card accounts entirely.
export async function getAssetBalanceWithin(
  executor: DbExecutor,
  accountId: number,
  currencyId: number,
): Promise<number> {
  const [baseline] = await executor
    .select({ balance: accountBalances.balance })
    .from(accountBalances)
    .where(
      and(
        eq(accountBalances.accountId, accountId),
        eq(accountBalances.currencyId, currencyId),
      ),
    )
    .limit(1);
  const [net] = await executor
    .select({
      total: sql<number>`coalesce(sum(case when ${transactions.entryType} = 'Income' then ${transactions.amount} else -${transactions.amount} end), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        eq(transactions.currencyId, currencyId),
      ),
    );
  return (baseline?.balance ?? 0) + Number(net?.total ?? 0);
}
