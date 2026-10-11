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
  // Share of the whole pie (top-N slices + the folded-in "Other" slice),
  // 0-100 — precomputed here rather than recalculated in JSX every
  // render, and against the same `Math.max(1, total)` floor so a
  // same-as-before render can't divide by zero.
  percent: number;
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

// Straight from the active theme palette's own `chart` rotation
// (theme/palettes.ts) rather than assembled from other tokens here — one
// definition of "what a chart looks like" per palette, reused for
// pie slices. These slices are always expense categories, so the
// rotation carries no "good/bad" meaning in this context, purely visual
// variety.
export function categoryChartPalette(colors: ThemeColors): string[] {
  return colors.chart;
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
  const slices: Omit<ChartPieSlice, 'percent'>[] = top.map((row, index) => ({
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
  const total = Math.max(1, slices.reduce((sum, slice) => sum + slice.value, 0));
  return slices.map(slice => ({ ...slice, percent: (slice.value / total) * 100 }));
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

// Gap between a month's income bar and its expense bar.
export const TREND_INNER_GAP = 2;
// Narrowest a month's slot (both bars + the gap after them) can get and
// still fit its 3-letter label ("Sep") at the smallest font allowed,
// scaleFont(10). Below this the chart scrolls sideways instead of
// squeezing the labels.
export const TREND_MIN_SLOT_WIDTH = 26;
const TREND_MAX_BAR_WIDTH = 18;
const TREND_MIN_BAR_WIDTH = 4;

export type TrendBarLayout = {
  barWidth: number;
  // Gap after each month's pair of bars (gifted-charts `spacing` on the
  // expense bar).
  groupSpacing: number;
  // Both bars plus the gap between them.
  groupWidth: number;
  // groupWidth + groupSpacing: the horizontal space one month takes.
  slotWidth: number;
  // True when `monthCount` slots don't fit in `plotWidth` at the minimum
  // slot width, so the chart has to scroll.
  scrollable: boolean;
};

// Sizes the month groups to fill `plotWidth` (the chart's drawable width
// after its initial spacing): bars get ~60% of a slot, the gap between
// months the rest. This is what fixes the "…" labels — the old fixed
// 10px bars left a month's label a 10px box to fit in.
export function computeTrendBarLayout(
  plotWidth: number,
  monthCount: number,
): TrendBarLayout {
  const count = Math.max(1, monthCount);
  const fitted = plotWidth / count;
  const scrollable = fitted < TREND_MIN_SLOT_WIDTH;
  const slot = scrollable ? TREND_MIN_SLOT_WIDTH : fitted;
  const barWidth = Math.max(
    TREND_MIN_BAR_WIDTH,
    Math.min(TREND_MAX_BAR_WIDTH, Math.floor((slot * 0.6 - TREND_INNER_GAP) / 2)),
  );
  const groupWidth = barWidth * 2 + TREND_INNER_GAP;
  const groupSpacing = Math.max(4, Math.floor(slot - groupWidth));
  return {
    barWidth,
    groupSpacing,
    groupWidth,
    slotWidth: groupWidth + groupSpacing,
    scrollable,
  };
}

// The tallest bar in the trend (income or expenses, any month) — the
// value the chart's top line stands for. 0 when there is no activity.
export function trendMaxValue(points: ChartTrendPoint[]): number {
  return points.reduce(
    (max, point) => Math.max(max, point.income, point.expenses),
    0,
  );
}
