import { useQuery } from '@tanstack/react-query';
import { getContributions, getSavingsGoals } from '../../db/queries';
import { queryKeys } from '../../db/queryKeys';

export type SavingsGoalRow = Awaited<ReturnType<typeof getSavingsGoals>>[number];

// Transactional stale time: a goal row carries its saved-so-far amount,
// which moves with every contribution — the target is stable, but the
// progress figure rendered next to it is not, so the row as a whole
// takes the money window.
export function useSavingsGoals(enabled = true) {
  return useQuery({
    queryKey: queryKeys.transactional.savingsGoals.list,
    // Wrapped rather than passed by reference: getSavingsGoals takes an
    // optional status filter, and a bare reference would receive
    // TanStack's query context as that argument.
    queryFn: () => getSavingsGoals(),
    enabled,
  });
}

// Transactional stale time: one goal's contribution ledger — the rows
// the progress figure above is summed from, so it cannot be allowed to
// outlive it.
export function useContributions(savingsGoalId: number | null) {
  return useQuery({
    queryKey: queryKeys.transactional.savingsGoals.contributions(
      savingsGoalId ?? -1,
    ),
    queryFn: () => getContributions(savingsGoalId as number),
    enabled: savingsGoalId != null,
  });
}
