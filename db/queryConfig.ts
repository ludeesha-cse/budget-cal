export const TRANSACTIONAL_STALE_TIME = 20 * 60 * 1000;

// Reference data: categories, tags, currencies (including the default
// currency), and the account list itself — names and types, never their
// live balances, which are transactional above.
export const REFERENCE_STALE_TIME = 24 * 60 * 60 * 1000;

// gcTime must be comfortably LONGER than the matching staleTime, or the
// cache entry is evicted while it is still fresh and the next screen
// focus re-reads the database anyway — precisely the behaviour this
// refactor removes. React Navigation unmounts stack screens when they
// are popped, so an unmounted query going inactive is the normal case
// here, not an edge case.
export const TRANSACTIONAL_GC_TIME = 30 * 60 * 1000;
export const REFERENCE_GC_TIME = 36 * 60 * 60 * 1000;
