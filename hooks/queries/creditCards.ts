import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { getCreditCardDebt, getTotalCreditCardDebt } from '../../db/queries';
import { queryKeys } from '../../db/queryKeys';
import { useStableList } from '../useStableList';
import { TRANSACTIONAL_STALE_TIME } from '../../db/queryConfig';

// Transactional stale time: the dashboard's total card debt, summed from
// live card balances — it moves on every card expense and every payoff,
// so it takes the money window and is invalidated by both.
export function useTotalCreditCardDebt(enabled = true) {
  return useQuery({
    queryKey: queryKeys.transactional.creditCards.totalDebt,
    queryFn: getTotalCreditCardDebt,
    enabled,
  });
}

// Transactional stale time: one card's outstanding debt — the figure a
// payoff is measured against, so it must be current at the moment the
// user decides how much to pay.
export function useCreditCardDebt(
  accountId: number | null,
  currencyId: number | null,
) {
  return useQuery({
    queryKey: queryKeys.transactional.creditCards.debt(
      accountId ?? -1,
      currencyId ?? -1,
    ),
    queryFn: () => getCreditCardDebt(accountId as number, currencyId as number),
    enabled: accountId != null && currencyId != null,
  });
}

// Transactional stale time: the same per-card debt figure as above,
// batched for a list of cards in one currency — one cache entry per
// card, so revisiting the screen re-reads nothing until a write or the
// 10-minute window says otherwise.
export function useCreditCardDebtByAccountId(
  accountIds: number[],
  currencyId: number | null,
): Record<number, number> {
  const results = useQueries({
    queries: accountIds.map(accountId => ({
      queryKey: queryKeys.transactional.creditCards.debt(
        accountId,
        currencyId ?? -1,
      ),
      queryFn: () => getCreditCardDebt(accountId, currencyId as number),
      enabled: currencyId != null,
      staleTime: TRANSACTIONAL_STALE_TIME,
    })),
  });
  // One fixed-size dependency instead of spreading a list whose length
  // tracks the user's data — see hooks/useStableList.ts.
  const values = useStableList(results.map(result => result.data));
  return useMemo(() => {
    const byId: Record<number, number> = {};
    accountIds.forEach((accountId, index) => {
      byId[accountId] = values[index] ?? 0;
    });
    return byId;
  }, [accountIds, values]);
}
