import { useCallback, useState } from 'react';

export interface UseLazyExpandableDetailResult<T> {
  expandedId: number | null;
  dataById: Record<number, T[]>;
  toggle: (id: number) => void;
  // Re-fetches one row's detail unconditionally, bypassing the cache —
  // for a row whose detail can be mutated while it's already expanded
  // (e.g. SavingsGoalsScreen adding/editing/deleting a contribution from
  // inside an open goal's details). Doesn't touch `expandedId`, so it's
  // safe to call whether or not that row happens to be the expanded one.
  // Not needed by every consumer (RecurringRulesScreen's occurrence
  // history is read-only once fetched), so it's a separate method rather
  // than something toggle itself has to account for.
  refresh: (id: number) => Promise<void>;
}

// The "tap a row to expand its detail, fetched once and cached from then
// on" pattern used by every screen with a per-row history/breakdown list
// (installment payments, savings goal contributions, recurring rule
// occurrence history). Only one row is ever expanded at a time — toggling
// a second row's id simply moves `expandedId` there, collapsing whatever
// was open before, same as every current hand-rolled version already did.
//
// Expansion only happens *after* a fetch resolves and its result is
// cached (never mid-fetch): so a consumer never sees `expandedId === id`
// paired with `dataById[id]` still missing. Re-expanding an already-
// cached row skips fetchFn entirely and flips `expandedId` immediately.
export function useLazyExpandableDetail<T>(
  fetchFn: (id: number) => Promise<T[]>,
): UseLazyExpandableDetailResult<T> {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [dataById, setDataById] = useState<Record<number, T[]>>({});

  const toggle = useCallback(
    (id: number) => {
      if (expandedId === id) {
        setExpandedId(null);
        return;
      }
      if (id in dataById) {
        setExpandedId(id);
        return;
      }
      // Not cached yet — fetch, store, and only then expand, so
      // `expandedId` flipping to `id` always implies `dataById[id]` is
      // already populated (a consumer that wants to show "Loading..."
      // meanwhile should key it off dataById[id] being undefined while
      // expandedId hasn't reached this row yet, not the other way round).
      fetchFn(id).then(result => {
        setDataById(current => ({ ...current, [id]: result }));
        setExpandedId(id);
      });
    },
    [expandedId, dataById, fetchFn],
  );

  const refresh = useCallback(
    async (id: number) => {
      const result = await fetchFn(id);
      setDataById(current => ({ ...current, [id]: result }));
    },
    [fetchFn],
  );

  return { expandedId, dataById, toggle, refresh };
}
