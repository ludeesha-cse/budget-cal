import { useQuery } from '@tanstack/react-query';
import { getCurrencyRates, getExchangeRates } from '../../db/queries';
import { queryKeys } from '../../db/queryKeys';

export type ExchangeRateListRow = Awaited<
  ReturnType<typeof getExchangeRates>
>[number];

// Reference stale time: a rate changes only when the user edits it on
// the Exchange Rates screen. Nothing that moves money can move it.
export function useExchangeRates(enabled = true) {
  return useQuery({
    queryKey: queryKeys.reference.exchangeRates.list,
    queryFn: () => getExchangeRates(),
    enabled,
  });
}

// Reference stale time, same reasoning. This is the narrower read the
// transfer form converts with — only currencies that actually have a
// usable rate. A currency missing from this list is what makes the
// converted-amount field ask to be typed by hand rather than pre-filling
// with a guess.
export function useCurrencyRates(enabled = true) {
  return useQuery({
    queryKey: queryKeys.reference.exchangeRates.usable,
    queryFn: () => getCurrencyRates(),
    enabled,
  });
}
