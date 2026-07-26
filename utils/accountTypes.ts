// Liability/Receivable accounts exist ONLY to track what is owed in
// either direction. They are managed exclusively through the loan flows
// (open, top up, edit, settle), each of which keeps loan_details, the
// loan_payments / loan_originations ledgers and the interest anchor in
// step. Spending or receiving money straight from one would move a
// balance without any of that bookkeeping, leaving a debt that quietly
// disagrees with the payments recorded against it.
//
// So they are never offered anywhere the user picks an account to pay
// from or receive into: transactions, installment payments, recurring
// rules, transfers, savings goals and credit-card payoffs. This one
// constant is what every such picker filters on — it used to be
// copy-pasted into four files, which is exactly how one of them
// (installment payments) came to be missing it.
export const NON_TRANSACTABLE_ACCOUNT_TYPES = ['Liability', 'Receivable'];

// True for an account a user may pay from or into. Closed accounts are
// excluded for a different reason than loan accounts — deliberately shut
// down rather than structurally unsuitable — but every caller wants both
// gone, so both live here.
export function isPayableAccount(account: {
  active: boolean;
  type: string;
}): boolean {
  return (
    account.active && !NON_TRANSACTABLE_ACCOUNT_TYPES.includes(account.type)
  );
}
