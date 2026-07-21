import { useQuery } from '@tanstack/react-query';
import { getPendingScheduledPayments } from '../../db/queries';
import { queryKeys } from '../../db/queryKeys';

export type { PendingScheduledPayment } from '../../db/queries';

// Transactional stale time, for the same clock-driven reason
// usePendingOccurrences has one: this list grows purely because a due
// date passed — a recurring occurrence generated overnight, or an
// installment occurrence whose due date has now arrived — with no write
// involved that any invalidation could hang off.
//
// This is the single read behind BOTH the Dashboard banner's count and
// the review screen's list, so the two can never disagree about how many
// things are waiting: they are literally the same cache entry.
export function usePendingScheduledPayments(enabled = true) {
  return useQuery({
    queryKey: queryKeys.transactional.scheduled.pending,
    queryFn: getPendingScheduledPayments,
    enabled,
  });
}
