import type { ThemeColors } from '../contexts/ThemeContext';

// Stage 16b: pure, RN-free helpers for turning the Stage 16a report
// aggregate rows into chart-ready shapes. Kept separate from
// ReportsScreen.tsx (rather than inlined) for two reasons: this logic can
// be dry-run tested with a plain Node script — this project's established
// way of verifying logic without simulator access — and it never has to
// change if the chart library underneath it is ever swapped out.

// Cap on individual pie slices before the remainder collapses into a
// single "Other" slice — a pie with many slivers communicates nothing,
// and the full breakdown is always available in the numeric list
// rendered below the chart.
export const PIE_CHART_TOP_N = 6;

export type ChartPieSlice = {
  label: string;
  value: number;
  color: string;
};

export type ChartBarDatum = {
  label: string;
  value: number;
  frontColor: string;
};

export type ChartTrendPoint = {
  month: string;
  label: string;
  income: number;
  expenses: number;
};

// Truncates a label to at most maxLength characters, appending a single
// ellipsis character when truncation actually happened, so chart labels
// can never overflow their allotted space or squash the rest of a chart.
export function truncateLabel(label: string, maxLength: number): string {
  if (label.length <= maxLength) {
    return label;
  }
  return `${label.slice(0, Math.max(0, maxLength - 1))}…`;
}

// Six accent colors pulled straight from the active theme palette (never
// invented hex values), reused in a fixed order for pie slices. These
// slices are always expense categories, so reusing success/danger here is
// purely for visual variety — it carries no "good/bad" meaning in this
// context.
export function categoryChartPalette(colors: ThemeColors): string[] {
  return [
    colors.primary,
    colors.success,
    colors.warning,
    colors.danger,
    colors.chevron,
    colors.textSecondary,
  ];
}

// Rows are assumed already sorted descending by `total` (which is what
// getSpendingByCategory guarantees) — takes the top N as individual
// slices and folds everything past that into one "Other" slice, so a
// category list of any length always produces a readable pie. The
// numeric breakdown rendered below the chart is untouched and still
// lists every category individually; this function only affects the
// chart.
export function buildCategoryPieSlices(
  rows: { categoryName: string; total: number }[],
  colors: ThemeColors,
  topN: number = PIE_CHART_TOP_N,
): ChartPieSlice[] {
  const palette = categoryChartPalette(colors);
  const top = rows.slice(0, topN);
  const rest = rows.slice(topN);
  const slices: ChartPieSlice[] = top.map((row, index) => ({
    label: truncateLabel(row.categoryName, 12),
    value: row.total,
    color: palette[index % palette.length],
  }));
  const otherTotal = rest.reduce((sum, row) => sum + row.total, 0);
  if (otherTotal > 0) {
    // Deliberately colors.border (a neutral grey, not one of the six
    // accent colors above) so "Other" always reads as the catch-all
    // bucket rather than looking like just another category.
    slices.push({ label: 'Other', value: otherTotal, color: colors.border });
  }
  return slices;
}

// Horizontal bar chart data for the account-type breakdown — a single
// uniform color since bars are already distinguished by their own label,
// so there's no need for a multi-color palette here.
export function buildAccountTypeBarData(
  rows: { accountType: string; total: number }[],
  colors: ThemeColors,
): ChartBarDatum[] {
  return rows.map(row => ({
    label: truncateLabel(row.accountType, 14),
    value: row.total,
    frontColor: colors.primary,
  }));
}

// Maps trend rows (already zero-filled for every month in range by
// getMonthlyTrend) into the shape the chart and its x-axis labels need,
// applying the caller's own short month-label formatter so this file
// never needs its own copy of month-name strings.
export function buildTrendChartData(
  rows: { month: string; totalIncome: number; totalExpenses: number }[],
  formatLabel: (month: string) => string,
): ChartTrendPoint[] {
  return rows.map(row => ({
    month: row.month,
    label: formatLabel(row.month),
    income: row.totalIncome,
    expenses: row.totalExpenses,
  }));
}
