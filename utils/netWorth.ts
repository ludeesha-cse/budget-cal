import {
  getAccountBalance,
  getAccountBalances,
  getAccounts,
  getActiveLoanAccounts,
  getCurrencies,
  getLoanTotalOwed,
  getRemainingInstallmentBalance,
} from '../db/queries';
import { getCurrentDateString } from './date';

export type NetWorthByCurrency = {
  currencyCode: string;
  assets: number; // Bank + Cash + CryptoWallet + Receivable (Receivable includes accrued interest)
  liabilities: number; // Liability total owed, including accrued interest
  creditCardDebt: number;
  remainingInstallments: number; // Stage 12b: unpaid portion of every installment plan in this currency
  netWorth: number; // assets - liabilities - creditCardDebt - remainingInstallments
};

const ASSET_ACCOUNT_TYPES = ['Bank', 'Cash', 'CryptoWallet'];
const CREDIT_CARD_TYPE = 'CreditCard';

function addTo(
  totals: Record<string, NetWorthByCurrency>,
  currencyCode: string,
  field: 'assets' | 'liabilities' | 'creditCardDebt' | 'remainingInstallments',
  amount: number,
): void {
  const existing =
    totals[currencyCode] ??
    ({
      currencyCode,
      assets: 0,
      liabilities: 0,
      creditCardDebt: 0,
      remainingInstallments: 0,
      netWorth: 0,
    } satisfies NetWorthByCurrency);
  existing[field] += amount;
  totals[currencyCode] = existing;
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/net-worth, keeping the same return shape. Computes,
// per currency (never summed across currencies — a USD asset can't
// offset an LKR debt):
//   Bank + Cash + CryptoWallet + Receivable
//   − Liability − CreditCard debt − remaining installments
//
// Deliberately does NOT reuse getTotalCashInHandByCurrency() for the
// asset side: that function sums the raw account_balances.balance
// column, which is only the stored *opening* baseline (see
// getAccountBalance's comment) and never reflects any transaction
// logged since an account was created or last balance-corrected. Net
// worth needs the actual current balance, so this walks every active
// asset account and calls getAccountBalance() (which nets in
// transaction history) directly instead.
//
// Liability/Receivable figures include accrued-but-unpaid interest via
// getLoanTotalOwed — the same methodology the Liabilities & Receivables
// dashboard section already uses — since interest that has accrued but
// not yet been paid or logged as a transaction is still real debt (or,
// for a Receivable, real money owed to you).
//
// Only active accounts are counted. A closed account can only be closed
// with a zero balance in every currency (see closeAccount's gate), so an
// inactive account never contributes a nonzero figure anyway.
//
// remainingInstallments (Stage 12b) is the unpaid portion of every
// installment plan in that currency — real future spending that hasn't
// happened yet, so it belongs on the debt side the same way an unpaid
// Liability does, even though nothing in `accounts` represents it.
export async function getNetWorthByCurrency(): Promise<
  Record<string, NetWorthByCurrency>
> {
  try {
    const totals: Record<string, NetWorthByCurrency> = {};
    const today = getCurrentDateString();

    const accounts = await getAccounts();
    const activeAssetAccounts = accounts.filter(
      a => a.active && ASSET_ACCOUNT_TYPES.includes(a.type),
    );
    const activeCreditCardAccounts = accounts.filter(
      a => a.active && a.type === CREDIT_CARD_TYPE,
    );

    for (const account of activeAssetAccounts) {
      const balances = await getAccountBalances(account.id);
      for (const balance of balances) {
        const currentBalance = await getAccountBalance(
          account.id,
          balance.currencyId,
        );
        addTo(totals, balance.currencyCode, 'assets', currentBalance);
      }
    }

    for (const account of activeCreditCardAccounts) {
      const balances = await getAccountBalances(account.id);
      for (const balance of balances) {
        const currentBalance = await getAccountBalance(
          account.id,
          balance.currencyId,
        );
        // Stored balance is the negative of what's owed (see
        // getCreditCardDebt) — flip it back to a positive debt figure.
        addTo(totals, balance.currencyCode, 'creditCardDebt', -currentBalance);
      }
    }

    const [receivables, liabilities] = await Promise.all([
      getActiveLoanAccounts('Receivable'),
      getActiveLoanAccounts('Liability'),
    ]);
    for (const loan of receivables) {
      const totalOwed = await getLoanTotalOwed(loan.accountId, today);
      addTo(totals, loan.currencyCode, 'assets', totalOwed);
    }
    for (const loan of liabilities) {
      const totalOwed = await getLoanTotalOwed(loan.accountId, today);
      addTo(totals, loan.currencyCode, 'liabilities', totalOwed);
    }

    const allCurrencies = await getCurrencies();
    for (const currency of allCurrencies) {
      const remaining = await getRemainingInstallmentBalance(currency.id);
      // Only adds an entry when there's actually something to show —
      // otherwise a currency with installment plans but no cash accounts
      // at all (an edge case, but not an impossible one) would be the
      // only way a brand-new currencyCode key ever appeared here, and a
      // currency with zero of everything shouldn't show up in net worth
      // just because it exists in the currencies table.
      if (remaining !== 0) {
        addTo(totals, currency.code, 'remainingInstallments', remaining);
      }
    }

    for (const currencyCode of Object.keys(totals)) {
      const row = totals[currencyCode];
      row.netWorth =
        row.assets -
        row.liabilities -
        row.creditCardDebt -
        row.remainingInstallments;
    }

    return totals;
  } catch (error) {
    console.error('getNetWorthByCurrency: failed to compute net worth', error);
    throw error;
  }
}
