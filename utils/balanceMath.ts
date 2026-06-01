// The single place that decides which direction an Expense or Income
// moves an account's balance. Before this file existed, that decision
// was duplicated (and had to stay duplicated *in sync*) between the
// SQL that derives a balance from transaction history and the code
// that reverses a balance correction back into a transaction — two
// places that could silently drift apart. Every call site listed in
// db/queries.ts now goes through this function instead.
//
// THE DEBT INVERSION, IN PLAIN LANGUAGE:
// For a normal "asset" account (Bank, Cash, CryptoWallet) the balance
// means "money you have." Spending money (an Expense) makes that number
// go DOWN. Getting money (an Income) makes it go UP. Ordinary and
// intuitive.
//
// A credit card is the opposite kind of number: the balance means
// "money you owe," not money you have. Charging something to the card
// (an Expense) makes you owe MORE — the number goes UP, not down.
// Paying the card off (recorded as an Income, since money is moving
// back onto the account) makes you owe LESS — the number goes DOWN.
//
// So for every other account type, Expense is negative and Income is
// positive. For a credit card, it's flipped: Expense is positive and
// Income is negative. This is not a bug and not inconsistent — it's
// the correct behavior for a number that represents a debt instead of
// a stash of cash. A future reader who "fixes" this to match the asset
// case will make every credit card balance move backwards.
//
// Liability and Receivable accounts are excluded on purpose: those
// balances are never touched by an ordinary Expense/Income transaction
// at all. They're entirely owned by createLoanAccount() and
// settleLoan() (Stage 9), which move money via their own dedicated
// baseline-shifting logic, not this one. Calling this function for
// either type is always a mistake, so it throws instead of returning a
// number that would look plausible and quietly corrupt a loan balance.
export function getBalanceDelta(
  accountType: string,
  entryType: 'Expense' | 'Income',
  amount: number,
): number {
  if (accountType === 'Liability' || accountType === 'Receivable') {
    throw new Error(
      `getBalanceDelta: ${accountType} accounts are managed exclusively by ` +
        'createLoanAccount()/settleLoan(), not by ordinary transactions. ' +
        'This function should never be called for a loan account — check ' +
        'the call site.',
    );
  }

  if (accountType === 'CreditCard') {
    // Debt inversion (see the block comment above): charging the card
    // increases what's owed, paying it down decreases it.
    return entryType === 'Expense' ? amount : -amount;
  }

  // Bank, Cash, CryptoWallet — ordinary asset accounts.
  return entryType === 'Expense' ? -amount : amount;
}

// Credit card balances are stored per the debt inversion documented
// above (a positive stored balance means money owed to you, so a card's
// balance is the negative of what's actually owed) — see
// db/queries/creditCards.ts's getCreditCardDebt for the DB-side version
// of this same convention. This is the client-side mirror for UI code
// that already has a balance in hand and just needs to flip its sign for
// display, without a DB round trip.
export function creditCardDebt(balance: number): number {
  return -balance;
}
