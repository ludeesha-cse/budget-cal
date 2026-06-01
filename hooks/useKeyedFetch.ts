import { useEffect, useState } from 'react';

// The "I have a list of rows and need one more piece of data fetched per
// row, keyed by id" pattern used by screens that show a per-row derived
// figure the main list query doesn't already carry (e.g. installment
// plans' per-plan payment history, loans' per-loan running total). Runs
// every fetch in parallel via Promise.all rather than one round trip per
// row in sequence, and refetches the whole batch whenever the `rows`
// array itself changes (a new reference — same as any other effect
// dependency, so the caller's own load() reassigning the array is what
// triggers this, not a deep-equality check on its contents).
//
// keyFn/fetcher are deliberately not effect dependencies: they're
// typically fresh inline closures every render, and including them would
// refetch on every render instead of only when `rows` actually changes —
// the same reasoning behind the `eslint-disable-next-line
// react-hooks/exhaustive-deps` already used for equivalent effects
// elsewhere in this app (e.g. ReviewOccurrencesScreen's route-param
// effect).
export function useKeyedFetch<TRow, TResult>(
  rows: TRow[],
  keyFn: (row: TRow) => string | number,
  fetcher: (row: TRow) => Promise<TResult>,
): Record<string | number, TResult> {
  const [resultsByKey, setResultsByKey] = useState<
    Record<string | number, TResult>
  >({});

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      rows.map(async row => [keyFn(row), await fetcher(row)] as const),
    ).then(entries => {
      // Guards against a slower, now-superseded batch overwriting a
      // newer one that started (and possibly finished) after it — the
      // same stale-response guard every other load() in this app uses.
      if (!cancelled) {
        setResultsByKey(Object.fromEntries(entries));
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  return resultsByKey;
}
