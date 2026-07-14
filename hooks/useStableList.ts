import { useRef } from 'react';

// Collapses a variable-length list of values into ONE dependency whose
// identity changes only when the contents actually change.
//
// This exists because of a real bug, not a style preference. `useQueries`
// hands back a fresh results array on every render, so the resolved
// `.data` values are a new array each time even when nothing changed.
// The tempting way to feed those into a `useMemo` is to spread them into
// the dependency array:
//
//     }, [accountIds, ...values]);   // <-- WRONG
//
// React requires a hook's dependency array to keep a CONSTANT LENGTH
// between renders, and these lists grow and shrink with the user's own
// data — one entry per active loan, per installment plan, per currency,
// per transaction on screen. The moment that count changes, React logs
//
//     The final argument passed to useMemo changed size between renders.
//     Previous: []  Incoming: [4,3, , ]
//
// and falls back to comparing whichever positions happen to line up.
// That is not merely noisy: it can hand back a memo that should have
// been recomputed (a stale figure on screen) or recompute one that
// should not have been (a new object identity that re-fires every
// downstream effect). Because these lists start empty on first render
// and fill in as the queries resolve, it fires on essentially every one
// of these hooks the first time real data arrives.
//
// Passing the list through here instead gives the caller a fixed-length
// dependency array, and gives consumers that put the derived value in
// their OWN dependency arrays a reference that is stable between real
// updates. It pairs well with TanStack's structural sharing: a query's
// `data` keeps its identity unless the rows actually changed, so an
// unchanged list compares equal position by position.
//
// The ref write below is a pure memo cache — derived only from this
// render's own argument, with no side effect — so a render React
// discards and replays produces the same answer.
export function useStableList<T>(values: readonly T[]): readonly T[] {
  const ref = useRef(values);
  const previous = ref.current;
  const unchanged =
    previous.length === values.length &&
    values.every((value, index) => Object.is(value, previous[index]));
  if (!unchanged) {
    ref.current = values;
  }
  return ref.current;
}
