import { useQuery } from '@tanstack/react-query';
import {
  getAllBudgetsForCurrency,
  getBudgetForMonth,
  getBudgetsForMonth,
  getCategoryBudget,
  getCategoryBudgetsForMonth,
} from '../../db/queries';
import { queryKeys } from '../../db/queryKeys';

// Budget reads — the limit side of every "spent X of Y" pair. Filed as
// transactional because they are read alongside, and compared against,
// figures that move constantly; a budget limit that lags its spend
// figure is exactly the mismatched-numbers bug this refactor must not
// introduce.

export type BudgetRow = Awaited<
  ReturnType<typeof getAllBudgetsForCurrency>
>[number];

// Transactional stale time: one month's overall budget in one currency.
// The limit itself changes rarely, but it is always rendered next to a
// 10-minute-fresh spend total, so caching it any longer would let the
// two halves of one sentence disagree.
export function useBudgetForMonth(month: string, currencyId: number | null) {
  return useQuery({
    queryKey: queryKeys.transactional.budgets.forMonth(month, currencyId ?? -1),
    queryFn: () => getBudgetForMonth(month, currencyId as number),
    enabled: currencyId != null,
  });
}

// Transactional stale time: every currency's budget for one month —
// drives the dashboard's budget cards, each paired with a live spend
// total, so it shares that pairing's tolerance.
export function useBudgetsForMonth(month: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.transactional.budgets.monthList(month),
    queryFn: () => getBudgetsForMonth(month),
    enabled,
  });
}

// Transactional stale time: one currency's budget history, shown on the
// budget settings screen right after the user saves into it — correct-
// after-write matters more here than long caching, and the write
// invalidates it.
export function useAllBudgetsForCurrency(currencyId: number | null) {
  return useQuery({
    queryKey: queryKeys.transactional.budgets.allForCurrency(currencyId ?? -1),
    queryFn: () => getAllBudgetsForCurrency(currencyId as number),
    enabled: currencyId != null,
  });
}

// Transactional stale time: per-category limits for a month, rendered
// beside per-category spend on both the dashboard breakdown and the
// category budgets screen — same paired-numbers reasoning as the overall
// budget above.
export function useCategoryBudgetsForMonth(
  month: string,
  currencyId: number | null,
) {
  return useQuery({
    queryKey: queryKeys.transactional.categoryBudgets.forMonth(
      month,
      currencyId ?? -1,
    ),
    queryFn: () => getCategoryBudgetsForMonth(month, currencyId as number),
    enabled: currencyId != null,
  });
}

// Transactional stale time: a single category's limit, read on the same
// clock as the spend figure it is compared against.
export function useCategoryBudget(
  month: string,
  categoryId: number | null,
  currencyId: number | null,
) {
  return useQuery({
    queryKey: queryKeys.transactional.categoryBudgets.single(
      month,
      categoryId ?? -1,
      currencyId ?? -1,
    ),
    queryFn: () =>
      getCategoryBudget(month, categoryId as number, currencyId as number),
    enabled: categoryId != null && currencyId != null,
  });
}
