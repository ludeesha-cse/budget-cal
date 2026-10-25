// Turns a screen's query results into the two things its load-error
// state needs: did any of them FAIL, and a retry that re-runs exactly the
// ones that did.
//
// WHY THIS MATTERS HERE: the query client runs with `retry: false` (see
// db/queryClient.ts), so a failed read goes straight to "error" with no
// data — and a screen rendering `data ?? []` then shows "No accounts
// yet", which is a false statement about the user's data rather than an
// honest "that didn't load". Screens check `loadFailed` first and show
// LoadErrorState (components/common/LoadErrorState.tsx) instead.
//
// A plain function, not a hook: it reads results the caller already has,
// so it adds no subscriptions and no dependency-array concerns.
type QueryLike = { isError: boolean; refetch: () => unknown };

export interface LoadFailure {
  loadFailed: boolean;
  retry: () => void;
}

export function loadFailureOf(...results: QueryLike[]): LoadFailure {
  const failed = results.filter(result => result.isError);
  return {
    loadFailed: failed.length > 0,
    retry: () => {
      for (const result of failed) {
        result.refetch();
      }
    },
  };
}
