import { useQuery } from '@tanstack/react-query';
import {
  getTransferableAccounts,
  getTransfers,
  getTransfersByYear,
} from '../../db/queries';
import { queryKeys } from '../../db/queryKeys';

export type TransferRow = Awaited<ReturnType<typeof getTransfers>>[number];

// Transactional stale time: transfers are money-movement rows merged
// into History beside transactions and loan payments — same list, same
// staleness tolerance.
export function useTransfersByMonth(month: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.transactional.transfers.byMonth(month),
    queryFn: () => getTransfers(month),
    enabled,
  });
}

// Transactional stale time: the yearly slice of the same transfer
// ledger.
export function useTransfersByYear(year: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.transactional.transfers.byYear(year),
    queryFn: () => getTransfersByYear(year),
    enabled,
  });
}

// FLAGGED (build-order step 7): this returns accounts, which would
// suggest the reference rule, but when a currency is supplied it also
// filters by which accounts actually HOLD that currency — a balance-row
// fact that changes when a currency is added to an account. Filed under
// transactional as the closer of the two: an account missing from a
// transfer picker for up to 10 minutes is recoverable, whereas half a
// day of it would read as a bug.
export function useTransferableAccounts(currencyId?: number) {
  return useQuery({
    queryKey: queryKeys.transactional.transfers.transferableAccounts(currencyId),
    queryFn: () => getTransferableAccounts(currencyId),
  });
}
