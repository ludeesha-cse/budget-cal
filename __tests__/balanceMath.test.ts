import {
  hasSufficientBalance,
  overdrawsAccount,
} from '../utils/balanceMath';

const LKR = 1;
const USD = 2;

function account(type: string, lkrBalance: number) {
  return { type, balances: [{ currencyId: LKR, currentBalance: lkrBalance }] };
}

describe('hasSufficientBalance', () => {
  test.each(['Cash', 'Bank', 'CryptoWallet'])(
    '%s: refuses more than the balance, allows up to it',
    type => {
      expect(hasSufficientBalance(account(type, 5000), LKR, 7000)).toBe(false);
      expect(hasSufficientBalance(account(type, 5000), LKR, 5000)).toBe(true);
      expect(hasSufficientBalance(account(type, 5000), LKR, 3000)).toBe(true);
    },
  );

  test.each(['CreditCard', 'Liability', 'Receivable'])(
    '%s is never checked',
    type => {
      expect(hasSufficientBalance(account(type, 0), LKR, 1_000_000)).toBe(true);
      expect(hasSufficientBalance(account(type, -500), LKR, 10)).toBe(true);
    },
  );

  test('a currency the account does not hold counts as zero', () => {
    expect(hasSufficientBalance(account('Cash', 5000), USD, 1)).toBe(false);
  });

  test('float noise does not refuse an exact payment', () => {
    const wallet = account('Cash', 0.1 + 0.2);
    expect(hasSufficientBalance(wallet, LKR, 0.3)).toBe(true);
  });

  describe('editing an existing entry', () => {
    // 3,000 already spent, 2,000 left.
    const wallet = account('Cash', 2000);

    test('only the extra amount has to be covered', () => {
      expect(hasSufficientBalance(wallet, LKR, 5000, 3000)).toBe(true);
      expect(hasSufficientBalance(wallet, LKR, 5001, 3000)).toBe(false);
    });

    test('lowering or keeping the amount always passes, even when overdrawn', () => {
      const overdrawn = account('Bank', -100);
      expect(hasSufficientBalance(overdrawn, LKR, 3000, 3000)).toBe(true);
      expect(hasSufficientBalance(overdrawn, LKR, 1000, 3000)).toBe(true);
    });

    test('turning an income into an expense also takes the income away', () => {
      // A 1,000 income is part of the 2,000 balance; as an expense it
      // costs 1,000 + 1,000.
      expect(hasSufficientBalance(wallet, LKR, 1000, -1000)).toBe(true);
      expect(hasSufficientBalance(wallet, LKR, 1001, -1000)).toBe(false);
    });
  });
});

describe('overdrawsAccount', () => {
  test('refuses only a write that lowers the balance below zero', () => {
    expect(overdrawsAccount('Cash', 5000, -2000)).toBe(true);
    expect(overdrawsAccount('Cash', 5000, 0)).toBe(false);
    expect(overdrawsAccount('Bank', -100, -50)).toBe(false); // went up
    expect(overdrawsAccount('Bank', -100, -100)).toBe(false); // unchanged
    expect(overdrawsAccount('Bank', -100, -150)).toBe(true);
  });

  test('credit cards and loan accounts are exempt', () => {
    expect(overdrawsAccount('CreditCard', 0, -9000)).toBe(false);
    expect(overdrawsAccount('Liability', 0, -9000)).toBe(false);
    expect(overdrawsAccount('Receivable', 0, -9000)).toBe(false);
  });
});
