// The insufficient-balance safety net in the query layer, against a real
// (in-memory) SQLite: refused writes must leave balances exactly as they
// were, credit cards must be exempt, and edits must only be charged for
// what they add.
import { bootDatabase } from './helpers/dbTestSetup';
import { INSUFFICIENT_FUNDS_MESSAGE } from '../utils/appErrors';

jest.mock('@op-engineering/op-sqlite', () => ({
  open: () => require('./helpers/dbTestSetup').testClient(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const queries = () => require('../db/queries');

let lkr: number;
let usd: number;
let walletId: number;
let foodId: number;

const insufficient = {
  code: 'INSUFFICIENT_FUNDS',
  field: 'account',
  message: INSUFFICIENT_FUNDS_MESSAGE,
};

function expense(accountId: number, amount: number, currencyId = lkr) {
  return queries().addTransaction({
    accountId,
    amount,
    categoryId: foodId,
    date: '2026-10-11',
    entryType: 'Expense',
    currencyId,
  });
}

beforeAll(async () => {
  await bootDatabase();
  const currencies = await queries().getCurrencies();
  lkr = currencies.find((c: { code: string }) => c.code === 'LKR').id;
  usd = currencies.find((c: { code: string }) => c.code === 'USD').id;
  await queries().completeFirstRunSetup({
    defaultCurrencyId: lkr,
    walletCurrencyId: lkr,
    openingBalance: 5000,
  });
  walletId = (await queries().findDefaultWallet()).id;
  foodId = (await queries().getCategories()).find(
    (c: { name: string }) => c.name === 'Food',
  ).id;
});

describe('expenses', () => {
  test('an LKR 7,000 expense from a 5,000 wallet is refused and nothing is saved', async () => {
    await expect(expense(walletId, 7000)).rejects.toMatchObject(insufficient);
    expect(await queries().getAccountBalance(walletId, lkr)).toBe(5000);
    expect(await queries().getTransactions()).toHaveLength(0);
  });

  test('an LKR 3,000 expense saves', async () => {
    await expense(walletId, 3000);
    expect(await queries().getAccountBalance(walletId, lkr)).toBe(2000);
  });

  test('editing only has to cover the extra amount', async () => {
    const [row] = await queries().getTransactions();
    // 3,000 -> 5,000 needs 2,000 more, which is exactly what is left.
    await queries().updateTransaction(row.id, { amount: 5000 });
    expect(await queries().getAccountBalance(walletId, lkr)).toBe(0);
    // One rupee more is refused, and the row keeps its old amount.
    await expect(
      queries().updateTransaction(row.id, { amount: 5001 }),
    ).rejects.toMatchObject(insufficient);
    expect((await queries().getTransactionById(row.id)).amount).toBe(5000);
    // Lowering always saves.
    await queries().updateTransaction(row.id, { amount: 1000 });
    expect(await queries().getAccountBalance(walletId, lkr)).toBe(4000);
  });

  test('a credit card can be charged past its balance', async () => {
    const card = await queries().addAccountWithBalance('Visa', 'CreditCard', lkr, 0);
    await expense(card.id, 7000);
    expect(await queries().getCreditCardDebt(card.id, lkr)).toBe(7000);
  });

  test('a turned-off currency is named', async () => {
    await expect(expense(walletId, 10, usd)).rejects.toMatchObject({
      code: 'CURRENCY_INACTIVE',
      field: 'currency',
    });
  });

  test('an account that does not hold the currency is named', async () => {
    await queries().setCurrencyActive(usd, true);
    await expect(expense(walletId, 10, usd)).rejects.toMatchObject({
      code: 'ACCOUNT_CURRENCY_MISSING',
      field: 'account',
      message:
        "Cash in wallet doesn't hold USD yet — add USD to it or pick another account",
    });
  });

  test('income is never refused', async () => {
    await queries().addIncome({
      accountId: walletId,
      amount: 100,
      date: '2026-10-11',
      currencyId: lkr,
    });
    expect(await queries().getAccountBalance(walletId, lkr)).toBe(4100);
  });
});

describe('transfers', () => {
  test('a transfer larger than the source balance is refused and both balances stay put', async () => {
    const bank = await queries().addAccountWithBalance('BOC', 'Bank', lkr, 0);
    await expect(
      queries().createTransfer({
        fromAccountId: walletId,
        toAccountId: bank.id,
        amount: 9000,
        currencyId: lkr,
        date: '2026-10-11',
      }),
    ).rejects.toMatchObject(insufficient);
    expect(await queries().getAccountBalance(walletId, lkr)).toBe(4100);
    expect(await queries().getAccountBalance(bank.id, lkr)).toBe(0);
    expect(await queries().getTransfers('2026-10')).toHaveLength(0);

    await queries().createTransfer({
      fromAccountId: walletId,
      toAccountId: bank.id,
      amount: 1000,
      currencyId: lkr,
      date: '2026-10-11',
    });
    expect(await queries().getAccountBalance(walletId, lkr)).toBe(3100);
    expect(await queries().getAccountBalance(bank.id, lkr)).toBe(1000);
  });
});

describe('installments', () => {
  test('an installment the paying account cannot cover is refused', async () => {
    await queries().createInstallmentPlan({
      name: 'Phone',
      numberOfMonths: 2,
      startDate: '2026-10-01',
      currencyId: lkr,
      categoryId: foodId,
      dueDayOfMonth: 5,
      mode: 'monthly',
      monthlyAmount: 60000,
    });
    const planId = (await queries().getInstallmentPlans())[0].id;
    await expect(
      queries().payInstallment({
        planId,
        accountId: walletId,
        date: '2026-10-11',
      }),
    ).rejects.toMatchObject(insufficient);
    expect(await queries().getInstallmentPayments(planId)).toHaveLength(0);
    expect(await queries().getAccountBalance(walletId, lkr)).toBe(3100);
  });
});
