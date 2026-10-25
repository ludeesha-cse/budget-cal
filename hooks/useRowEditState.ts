import { useCallback, useEffect, useState } from 'react';
import { validationError } from '../utils/appErrors';
import { getPendingOccurrences } from '../db/queries';

export type PendingOccurrenceRow = Awaited<
  ReturnType<typeof getPendingOccurrences>
>[number];

export interface ConfirmParams {
  occurrenceId: number;
  amount: number;
  accountId: number;
  date: string;
}

export interface UseRowEditStateResult {
  editedAmount: Record<number, string>;
  editedAccountId: Record<number, number>;
  editedDate: Record<number, string>;
  setAmount: (id: number, value: string) => void;
  setAccountId: (id: number, value: number) => void;
  setDate: (id: number, value: string) => void;
  seedDefaults: (rows: PendingOccurrenceRow[]) => void;
  buildParams: (row: PendingOccurrenceRow) => ConfirmParams;
}

// ReviewOccurrencesScreen's per-row editable state, factored out of the
// screen itself. Keyed by occurrence id — every row is independently
// editable, so a single flat set of maps (rather than nesting edited
// values inside the rows array itself) keeps typing in one row from
// re-deriving anything about the others.
export function useRowEditState(
  rows: PendingOccurrenceRow[],
): UseRowEditStateResult {
  const [editedAmount, setEditedAmount] = useState<Record<number, string>>({});
  const [editedAccountId, setEditedAccountId] = useState<
    Record<number, number>
  >({});
  const [editedDate, setEditedDate] = useState<Record<number, string>>({});

  // Seeds each occurrence's edit state with its rule's defaults, but only
  // for occurrences not already being edited — a background reload (e.g.
  // after confirming one row) must never clobber what's still being
  // typed into another. One generic pass over the three maps rather than
  // three separately-duplicated loops.
  const seedDefaults = useCallback((rowsToSeed: PendingOccurrenceRow[]) => {
    setEditedAmount(current => {
      const next = { ...current };
      for (const row of rowsToSeed) {
        if (!(row.id in next)) {
          next[row.id] = String(row.amount);
        }
      }
      return next;
    });
    setEditedAccountId(current => {
      const next = { ...current };
      for (const row of rowsToSeed) {
        if (!(row.id in next)) {
          next[row.id] = row.accountId;
        }
      }
      return next;
    });
    setEditedDate(current => {
      const next = { ...current };
      for (const row of rowsToSeed) {
        if (!(row.id in next)) {
          next[row.id] = row.dueDate;
        }
      }
      return next;
    });
  }, []);

  // Keeps edit state in sync with whatever rows the screen currently
  // holds — runs the same seeding pass every time `rows` changes (i.e.
  // every time the screen's own load() re-fetches), so the caller never
  // has to remember to call seedDefaults itself.
  useEffect(() => {
    seedDefaults(rows);
  }, [rows, seedDefaults]);

  const setAmount = useCallback((id: number, value: string) => {
    setEditedAmount(current => ({ ...current, [id]: value }));
  }, []);

  const setAccountId = useCallback((id: number, value: number) => {
    setEditedAccountId(current => ({ ...current, [id]: value }));
  }, []);

  const setDate = useCallback((id: number, value: string) => {
    setEditedDate(current => ({ ...current, [id]: value }));
  }, []);

  const buildParams = useCallback(
    (row: PendingOccurrenceRow): ConfirmParams => {
      const amountText = editedAmount[row.id] ?? String(row.amount);
      const parsedAmount = Number(amountText);
      if (!amountText || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        throw validationError(
          `Enter an amount greater than 0 for "${row.ruleName}"`,
          'amount',
        );
      }
      const accountId = editedAccountId[row.id] ?? row.accountId;
      const date = editedDate[row.id] ?? row.dueDate;
      return { occurrenceId: row.id, amount: parsedAmount, accountId, date };
    },
    [editedAmount, editedAccountId, editedDate],
  );

  return {
    editedAmount,
    editedAccountId,
    editedDate,
    setAmount,
    setAccountId,
    setDate,
    seedDefaults,
    buildParams,
  };
}
