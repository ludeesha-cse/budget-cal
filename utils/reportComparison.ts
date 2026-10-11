// Pure maths for the Reports "Compare" tab: current period vs the one
// before it. Works only on rows the report queries already returned (and
// cached) — nothing here reads the database or knows about React, so it
// is unit-tested directly (see __tests__/reportComparison.test.ts).

// How a percentage change reads:
//   'new'  — nothing before, something now (never shown as ∞ or NaN)
//   'none' — nothing in either period ("—")
//   'pct'  — an ordinary change; previous = 0 can't reach here
export type PercentChange =
  | { kind: 'new' }
  | { kind: 'none' }
  | { kind: 'pct'; value: number };

// 'good' / 'bad' come from what the figure means, not which way it
// moved: more income is good, more spending is bad.
export type DeltaTone = 'good' | 'bad' | 'neutral';

export type Direction = 'up' | 'down' | 'flat';

export type MetricDelta = {
  current: number;
  previous: number;
  delta: number;
  percent: PercentChange;
  direction: Direction;
  tone: DeltaTone;
};

// Below this (in percent) a change reads as "about the same" and is
// shown neutral rather than as good or bad news.
export const NEUTRAL_THRESHOLD_PERCENT = 1;

export function percentChange(
  current: number,
  previous: number,
): PercentChange {
  if (previous === 0) {
    return current === 0 ? { kind: 'none' } : { kind: 'new' };
  }
  // Against the magnitude, so a net that goes from -1,000 to -500 reads
  // as a +50% improvement rather than -50%.
  return {
    kind: 'pct',
    value: ((current - previous) / Math.abs(previous)) * 100,
  };
}

export function formatPercentChange(change: PercentChange): string {
  if (change.kind === 'new') {
    return 'New';
  }
  if (change.kind === 'none') {
    return '—';
  }
  const sign = change.value > 0 ? '+' : '';
  return `${sign}${change.value.toFixed(1)}%`;
}

// higherIsBetter: true for income/net, false for expenses/spend.
export function compareMetric(
  current: number,
  previous: number,
  higherIsBetter: boolean,
): MetricDelta {
  const delta = current - previous;
  const percent = percentChange(current, previous);
  const direction: Direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const negligible =
    direction === 'flat' ||
    percent.kind === 'none' ||
    (percent.kind === 'pct' &&
      Math.abs(percent.value) < NEUTRAL_THRESHOLD_PERCENT);
  const tone: DeltaTone = negligible
    ? 'neutral'
    : (direction === 'up') === higherIsBetter
    ? 'good'
    : 'bad';
  return { current, previous, delta, percent, direction, tone };
}

export type PeriodTotals = {
  totalIncome: number;
  totalExpenses: number;
};

export type TotalsComparison = {
  income: MetricDelta;
  expenses: MetricDelta;
  net: MetricDelta;
  // Spending divided by the days in each period, so a 31-day month and a
  // 28-day one (or 11 days so far vs a whole month) compare fairly.
  avgDailySpend: MetricDelta;
  // Share of income kept, 0-100; null when there was no income to keep.
  savingsRate: { current: number | null; previous: number | null };
};

export function savingsRate(totals: PeriodTotals): number | null {
  if (totals.totalIncome <= 0) {
    return null;
  }
  return (
    ((totals.totalIncome - totals.totalExpenses) / totals.totalIncome) * 100
  );
}

export function compareTotals(
  current: PeriodTotals,
  previous: PeriodTotals,
  currentDays: number,
  previousDays: number,
): TotalsComparison {
  return {
    income: compareMetric(current.totalIncome, previous.totalIncome, true),
    expenses: compareMetric(
      current.totalExpenses,
      previous.totalExpenses,
      false,
    ),
    net: compareMetric(
      current.totalIncome - current.totalExpenses,
      previous.totalIncome - previous.totalExpenses,
      true,
    ),
    avgDailySpend: compareMetric(
      current.totalExpenses / Math.max(1, currentDays),
      previous.totalExpenses / Math.max(1, previousDays),
      false,
    ),
    savingsRate: {
      current: savingsRate(current),
      previous: savingsRate(previous),
    },
  };
}

export type BreakdownInputRow = { key: string; label: string; total: number };

// 'new'  — spending this period, none in the previous one
// 'gone' — spending in the previous period, none this one
export type BreakdownStatus = 'both' | 'new' | 'gone';

export type BreakdownComparisonRow = {
  key: string;
  label: string;
  current: number;
  previous: number;
  delta: number;
  percent: PercentChange;
  status: BreakdownStatus;
};

// Joins two breakdowns (by category, by account type) on `key`, keeping
// rows that appear in only one of them. Sorted by the larger of the two
// amounts, so the rows that matter most in either period come first.
export function compareBreakdown(
  current: BreakdownInputRow[],
  previous: BreakdownInputRow[],
): BreakdownComparisonRow[] {
  const byKey = new Map<
    string,
    { label: string; current: number; previous: number }
  >();
  for (const row of current) {
    byKey.set(row.key, { label: row.label, current: row.total, previous: 0 });
  }
  for (const row of previous) {
    const existing = byKey.get(row.key);
    if (existing) {
      existing.previous = row.total;
    } else {
      byKey.set(row.key, { label: row.label, current: 0, previous: row.total });
    }
  }
  return Array.from(byKey.entries())
    .map(([key, value]) => ({
      key,
      label: value.label,
      current: value.current,
      previous: value.previous,
      delta: value.current - value.previous,
      percent: percentChange(value.current, value.previous),
      status: (value.previous === 0
        ? 'new'
        : value.current === 0
        ? 'gone'
        : 'both') as BreakdownStatus,
    }))
    .filter(row => row.current !== 0 || row.previous !== 0)
    .sort(
      (a, b) =>
        Math.max(b.current, b.previous) - Math.max(a.current, a.previous) ||
        a.label.localeCompare(b.label),
    );
}

// Largest increases first (Δ > 0 only).
export function biggestIncreases(
  rows: BreakdownComparisonRow[],
  limit = 5,
): BreakdownComparisonRow[] {
  return rows
    .filter(row => row.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, limit);
}

// Largest decreases first (Δ < 0 only).
export function biggestDecreases(
  rows: BreakdownComparisonRow[],
  limit = 5,
): BreakdownComparisonRow[] {
  return rows
    .filter(row => row.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, limit);
}

export const OTHER_KEY = '__other__';

// The top `limit` rows (input already sorted by compareBreakdown), with
// everything after them added together as one "Other" row — so a chart
// stays readable however many categories there are.
export function topWithOther(
  rows: BreakdownComparisonRow[],
  limit = 6,
): BreakdownComparisonRow[] {
  if (rows.length <= limit) {
    return rows;
  }
  const rest = rows.slice(limit);
  const current = rest.reduce((sum, row) => sum + row.current, 0);
  const previous = rest.reduce((sum, row) => sum + row.previous, 0);
  return [
    ...rows.slice(0, limit),
    {
      key: OTHER_KEY,
      label: 'Other',
      current,
      previous,
      delta: current - previous,
      percent: percentChange(current, previous),
      status: previous === 0 ? 'new' : current === 0 ? 'gone' : 'both',
    },
  ];
}

// Category rows from getSpendingByCategory, keyed the way the Overview
// list keys them (a null categoryId is the one "Uncategorized" bucket).
export function categoryRowsForComparison(
  rows: { categoryId: number | null; categoryName: string; total: number }[],
): BreakdownInputRow[] {
  return rows.map(row => ({
    key: row.categoryId == null ? 'uncategorized' : String(row.categoryId),
    label: row.categoryName,
    total: row.total,
  }));
}

export function accountTypeRowsForComparison(
  rows: { accountType: string; total: number }[],
): BreakdownInputRow[] {
  return rows.map(row => ({
    key: row.accountType,
    label: row.accountType,
    total: row.total,
  }));
}
