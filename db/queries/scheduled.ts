import {
  getPendingInstallmentOccurrences,
  type PendingInstallmentOccurrenceRow,
} from './installments';
import { getPendingOccurrences } from './recurring';

export type PendingRecurringOccurrenceRow = Awaited<
  ReturnType<typeof getPendingOccurrences>
>[number];

// The one shape the Dashboard banner and the review screen speak.
//
// A tagged union rather than a flattened row with half its fields
// nullable: the two kinds genuinely differ in what acting on them means
// (a recurring occurrence is confirmed into a brand-new transaction at
// an amount and account the user picks; an installment occurrence is
// paid through payInstallment, which already knows both the amount and
// which installment number it is), and the tag is what lets a screen
// hold onto the FULL typed row it needs for that action instead of
// re-fetching it. The four fields hoisted to the top level —
// dueDate, name, amount, currencyCode — are exactly the ones both kinds
// share and the only ones the merge itself has to reason about.
export type PendingScheduledPayment =
  | {
      kind: 'recurring';
      // Ids are only unique WITHIN each occurrence table, so a list
      // holding both needs a key that carries the kind too.
      key: string;
      dueDate: string;
      name: string;
      amount: number;
      currencyCode: string;
      recurring: PendingRecurringOccurrenceRow;
    }
  | {
      kind: 'installment';
      key: string;
      dueDate: string;
      name: string;
      amount: number;
      currencyCode: string;
      installment: PendingInstallmentOccurrenceRow;
    };

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/scheduled-payments?status=pending, keeping the same
// return shape — or with two calls merged here exactly as below, since
// the merge is the point rather than an implementation detail of one
// endpoint.
//
// THIS is the "unified" part: recurring rules and installment plans keep
// entirely separate tables, separate lifecycles and separate resolution
// paths, and are brought together only here, at the query layer, so the
// Dashboard has one list to count and one list to sort. Anything that
// needs to act on a row still goes back to that row's own kind-specific
// path.
export async function getPendingScheduledPayments(): Promise<
  PendingScheduledPayment[]
> {
  try {
    const [recurring, installments] = await Promise.all([
      getPendingOccurrences(),
      getPendingInstallmentOccurrences(),
    ]);

    const merged: PendingScheduledPayment[] = [
      ...recurring.map(
        (row): PendingScheduledPayment => ({
          kind: 'recurring',
          key: `recurring-${row.id}`,
          dueDate: row.dueDate,
          name: row.ruleName,
          amount: row.amount,
          currencyCode: row.currencyCode,
          recurring: row,
        }),
      ),
      ...installments.map(
        (row): PendingScheduledPayment => ({
          kind: 'installment',
          key: `installment-${row.id}`,
          dueDate: row.dueDate,
          name: row.planName,
          amount: row.amount,
          currencyCode: row.currencyCode,
          installment: row,
        }),
      ),
    ];

    // Oldest due date first — the same order each list already came in,
    // so the merged list reads as one queue of "what is waiting on you",
    // with name as a tie-break purely so two items due the same day keep
    // a stable order between renders instead of depending on which query
    // resolved first.
    return merged.sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name),
    );
  } catch (error) {
    console.error(
      'getPendingScheduledPayments: failed to load the merged pending scheduled payments',
      error,
    );
    throw error;
  }
}
