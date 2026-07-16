import { resetExchangeRate, setExchangeRate } from '../../../db/queries';
import { invalidates, useDbMutation } from '../invalidation';

// A rate is a setting the user types in, and nothing stored anywhere is
// derived from it — a past transfer keeps the amounts that were actually
// agreed. So both writes invalidate the rate list and nothing else; if
// you ever find balances or transfers added here, that is a sign
// something started recomputing a stored amount from a live rate, which
// is the thing this feature is designed not to do.

export function useSetExchangeRate() {
  return useDbMutation(setExchangeRate, invalidates.exchangeRateWrite);
}

export function useResetExchangeRate() {
  return useDbMutation(resetExchangeRate, invalidates.exchangeRateWrite);
}
