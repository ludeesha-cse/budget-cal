import type { ThemeColors } from '../contexts/ThemeContext';

export type BudgetStatus = { text: string; soft: string };

// Same three-tier read used by Dashboard's per-category rows, Dashboard's
// overall budget card, and Category Budgets' per-row bars: over 100% spent
// is danger, 90-100% is a warning, under 90% is on track. `budgetAmount <=
// 0` (no budget set) is its own neutral case rather than falling through to
// "on track", since 0 spent against 0 budget isn't really a success.
//
// There's no dedicated `warningSoft` palette key (see theme/palettes.ts),
// so the warning tier's soft companion reuses `primarySoft` — matching
// what Dashboard already did before this was centralized.
export function budgetStatusFor(
  spent: number,
  budgetAmount: number,
  colors: ThemeColors,
): BudgetStatus {
  if (budgetAmount <= 0) {
    return { text: colors.textSecondary, soft: colors.neutralSoft };
  }
  const used = spent / budgetAmount;
  if (used > 1) {
    return { text: colors.danger, soft: colors.dangerSoft };
  }
  if (used >= 0.9) {
    return { text: colors.warning, soft: colors.primarySoft };
  }
  return { text: colors.success, soft: colors.successSoft };
}
