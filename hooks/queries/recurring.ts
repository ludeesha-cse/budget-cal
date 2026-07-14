import { useQuery } from '@tanstack/react-query';
import {
  getOccurrenceHistory,
  getPendingOccurrences,
  getRecurringRules,
} from '../../db/queries';
import { queryKeys } from '../../db/queryKeys';

export type RecurringRuleRow = Awaited<
  ReturnType<typeof getRecurringRules>
>[number];
export type PendingOccurrenceRow = Awaited<
  ReturnType<typeof getPendingOccurrences>
>[number];

// FLAGGED (build-order step 7): recurring RULES do not fit either rule
// cleanly. A rule's user-set fields (name, amount, day of month) are
// reference-shaped — edited on a settings screen, otherwise immutable —
// but the same rows also carry generation bookkeeping that
// generatePendingOccurrences() advances on its own as the calendar
// moves, with no user write involved. That second half is time-driven,
// which reference caching cannot express. Filed under transactional as
// the closer of the two rather than inventing a third category for one
// screen: the cost of choosing it is a re-read every 10 minutes, whereas
// choosing reference would risk a rule's row showing pre-generation
// bookkeeping for half a day.
export function useRecurringRules(activeOnly: boolean, enabled = true) {
  return useQuery({
    queryKey: queryKeys.transactional.recurring.rules(activeOnly),
    queryFn: () => getRecurringRules(activeOnly),
    enabled,
  });
}

// Transactional stale time: pending occurrences are generated from the
// calendar, so the list grows purely because a due date passed — a
// clock-driven change no invalidation can anticipate, which is exactly
// what the 10-minute window is for.
export function usePendingOccurrences(enabled = true) {
  return useQuery({
    queryKey: queryKeys.transactional.recurring.pendingOccurrences,
    queryFn: getPendingOccurrences,
    enabled,
  });
}

// Transactional stale time: one rule's confirmed/skipped history, which
// gains a row on every confirm or skip and is read right after those
// actions.
export function useOccurrenceHistory(ruleId: number | null) {
  return useQuery({
    queryKey: queryKeys.transactional.recurring.occurrenceHistory(ruleId ?? -1),
    queryFn: () => getOccurrenceHistory(ruleId as number),
    enabled: ruleId != null,
  });
}
