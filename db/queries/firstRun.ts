import { and, eq } from 'drizzle-orm';
import { db } from '../index';
import { accountBalances, accounts, appMeta, currencies } from '../schema';
import { AppError, validationError } from '../../utils/appErrors';
import { MAX_AMOUNT } from '../../utils/amountValidation';
import { DEFAULT_CASH_ACCOUNT_NAME, findDefaultWallet } from './accounts';
import { confirmDefaultCurrencyWithin } from './currencies';
import { getAssetBalanceWithin } from './balanceGuard';

export type FirstRunSetupParams = {
  // The app's default currency, chosen at the top of the screen.
  defaultCurrencyId: number;
  // The currency the cash in the user's wallet is in — usually the same,
  // but someone may budget in LKR while carrying USD.
  walletCurrencyId: number;
  // How much cash they have right now. Zero is a real answer.
  openingBalance: number;
};

// The one sentence the screen shows when the write itself fails. True
// because of the transaction below: if this is thrown, nothing from this
// screen was kept.
export const FIRST_RUN_NOT_SAVED_MESSAGE =
  "Couldn't finish setting up — nothing was saved. Please check your phone has free storage and try again.";

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/setup/complete), keeping the same input shape.
//
// Everything the first-run screen decides, written as ONE transaction:
//
//   1. the "Cash in wallet" account exists and is open — created here if
//      ensureDefaultAccount() never managed to, and reopened if it was
//      closed, rather than failing with nothing to attach a balance to;
//   2. the wallet's currency is enabled, and the wallet holds it with the
//      opening balance (zero still writes the row: "no cash" is a balance,
//      while "no row" means the wallet has no currency at all);
//   3. the default currency is confirmed (see confirmDefaultCurrencyWithin
//      — it runs AFTER step 2 so the wallet's currency counts as in use and
//      stays enabled);
//   4. app_meta records that first-run setup is finished.
//
// Either all four land or none do, so a failure leaves the user on the
// same screen, inputs intact, with nothing half-configured behind it.
// The read-back afterwards tells "the write threw" apart from "the write
// silently did nothing" — same reasoning as addAccountWithBalance.
export async function completeFirstRunSetup(
  params: FirstRunSetupParams,
): Promise<{ walletAccountId: number }> {
  const { defaultCurrencyId, walletCurrencyId, openingBalance } = params;
  if (!Number.isFinite(openingBalance) || openingBalance < 0) {
    throw validationError(
      "Enter how much cash you have — it can't be negative",
      'openingBalance',
    );
  }
  if (openingBalance > MAX_AMOUNT) {
    throw validationError(
      'That amount is too large — check for extra digits',
      'openingBalance',
    );
  }

  let walletAccountId: number;
  try {
    // Checked before anything is written, so a currency that vanished
    // between picking it and pressing Confirm is named rather than
    // reported as a storage failure.
    for (const [id, field] of [
      [defaultCurrencyId, 'defaultCurrency'],
      [walletCurrencyId, 'walletCurrency'],
    ] as const) {
      const [row] = await db
        .select({ id: currencies.id })
        .from(currencies)
        .where(eq(currencies.id, id))
        .limit(1);
      if (!row) {
        throw new AppError(
          'CURRENCY_MISSING',
          'That currency no longer exists. Choose another currency.',
          { field },
        );
      }
    }

    walletAccountId = await db.transaction(async tx => {
      let wallet = await findDefaultWallet(tx);
      if (!wallet) {
        const [created] = await tx
          .insert(accounts)
          .values({
            name: DEFAULT_CASH_ACCOUNT_NAME,
            type: 'Cash',
            active: true,
            createdAt: Date.now(),
          })
          .returning();
        if (!created) {
          throw new AppError('WALLET_MISSING', FIRST_RUN_NOT_SAVED_MESSAGE);
        }
        wallet = created;
      } else if (!wallet.active) {
        await tx
          .update(accounts)
          .set({ active: true })
          .where(eq(accounts.id, wallet.id));
      }

      await tx
        .update(currencies)
        .set({ active: true })
        .where(eq(currencies.id, walletCurrencyId));

      // "How much cash do you have right now" is the CURRENT balance,
      // not the stored baseline. On a fresh install they are the same
      // number; on an older install reaching this screen for the first
      // time the wallet may already have history, and writing the answer
      // straight into the baseline would then show baseline + history.
      // So the baseline is set to whatever makes the current balance
      // come out to exactly what the user typed.
      const [existing] = await tx
        .select()
        .from(accountBalances)
        .where(
          and(
            eq(accountBalances.accountId, wallet.id),
            eq(accountBalances.currencyId, walletCurrencyId),
          ),
        )
        .limit(1);
      if (!existing) {
        await tx.insert(accountBalances).values({
          accountId: wallet.id,
          currencyId: walletCurrencyId,
          balance: 0,
        });
      }
      const current = await getAssetBalanceWithin(
        tx,
        wallet.id,
        walletCurrencyId,
      );
      await tx
        .update(accountBalances)
        .set({ balance: (existing?.balance ?? 0) + (openingBalance - current) })
        .where(
          and(
            eq(accountBalances.accountId, wallet.id),
            eq(accountBalances.currencyId, walletCurrencyId),
          ),
        );

      await confirmDefaultCurrencyWithin(tx, defaultCurrencyId);

      const [meta] = await tx.select().from(appMeta).limit(1);
      if (meta) {
        await tx
          .update(appMeta)
          .set({ onboardingCompleted: true, defaultCurrencyConfirmed: true })
          .where(eq(appMeta.id, meta.id));
      } else {
        await tx
          .insert(appMeta)
          .values({ onboardingCompleted: true, defaultCurrencyConfirmed: true });
      }
      return wallet.id;
    });
  } catch (error) {
    console.error(
      `completeFirstRunSetup: failed (default currency id=${defaultCurrencyId}, wallet currency id=${walletCurrencyId}, opening balance=${openingBalance})`,
      error,
    );
    if (error instanceof AppError && error.code !== 'UNKNOWN') {
      throw error;
    }
    throw new AppError('STORAGE', FIRST_RUN_NOT_SAVED_MESSAGE, { cause: error });
  }

  const [confirmedBalance] = await db
    .select({ id: accountBalances.id })
    .from(accountBalances)
    .where(
      and(
        eq(accountBalances.accountId, walletAccountId),
        eq(accountBalances.currencyId, walletCurrencyId),
      ),
    )
    .limit(1);
  const [confirmedMeta] = await db.select().from(appMeta).limit(1);
  if (!confirmedBalance || !confirmedMeta?.defaultCurrencyConfirmed) {
    console.error(
      'completeFirstRunSetup: the write reported success but the wallet balance or setup flag is missing on read-back',
    );
    throw new AppError('STORAGE', FIRST_RUN_NOT_SAVED_MESSAGE);
  }
  return { walletAccountId };
}
