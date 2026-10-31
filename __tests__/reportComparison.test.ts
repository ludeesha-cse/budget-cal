import {
  OTHER_KEY,
  biggestDecreases,
  biggestIncreases,
  categoryRowsForComparison,
  compareBreakdown,
  compareMetric,
  compareTotals,
  formatPercentChange,
  percentChange,
  savingsRate,
  topWithOther,
} from '../utils/reportComparison';
import {
  TREND_MIN_SLOT_WIDTH,
  computeTrendBarLayout,
} from '../utils/chartHelpers';

describe('percentChange / formatPercentChange', () => {
  test('previous 0 and current > 0 is "New", never Infinity', () => {
    expect(percentChange(500, 0)).toEqual({ kind: 'new' });
    expect(formatPercentChange(percentChange(500, 0))).toBe('New');
  });

  test('both 0 is "—", never NaN', () => {
    expect(percentChange(0, 0)).toEqual({ kind: 'none' });
    expect(formatPercentChange(percentChange(0, 0))).toBe('—');
  });

  test('current 0 and previous > 0 is -100%', () => {
    expect(percentChange(0, 500)).toEqual({ kind: 'pct', value: -100 });
    expect(formatPercentChange(percentChange(0, 500))).toBe('-100.0%');
  });

  test('ordinary changes', () => {
    expect(formatPercentChange(percentChange(1184, 1000))).toBe('+18.4%');
    expect(formatPercentChange(percentChange(750, 1000))).toBe('-25.0%');
  });

  test('a negative previous value is measured against its magnitude', () => {
    // Net from -1,000 to -500 is an improvement.
    expect(percentChange(-500, -1000)).toEqual({ kind: 'pct', value: 50 });
  });
});

describe('compareMetric tone (meaning, not direction)', () => {
  test('expenses going up is bad, down is good', () => {
    expect(compareMetric(1200, 1000, false).tone).toBe('bad');
    expect(compareMetric(800, 1000, false).tone).toBe('good');
  });

  test('income or net going up is good, down is bad', () => {
    expect(compareMetric(1200, 1000, true).tone).toBe('good');
    expect(compareMetric(800, 1000, true).tone).toBe('bad');
  });

  test('under 1% is neutral', () => {
    const delta = compareMetric(1005, 1000, false);
    expect(delta.direction).toBe('up');
    expect(delta.tone).toBe('neutral');
  });

  test('no change and both-zero are neutral', () => {
    expect(compareMetric(1000, 1000, true)).toMatchObject({ direction: 'flat', tone: 'neutral' });
    expect(compareMetric(0, 0, false).tone).toBe('neutral');
  });

  test('new spending is bad, new income is good', () => {
    expect(compareMetric(500, 0, false).tone).toBe('bad');
    expect(compareMetric(500, 0, true).tone).toBe('good');
  });
});

describe('compareTotals', () => {
  const result = compareTotals(
    { totalIncome: 1000, totalExpenses: 600 },
    { totalIncome: 800, totalExpenses: 900 },
    10,
    30,
  );

  test('income, expenses and net', () => {
    expect(result.income).toMatchObject({ current: 1000, previous: 800, delta: 200 });
    expect(result.expenses).toMatchObject({ delta: -300, tone: 'good' });
    expect(result.net).toMatchObject({ current: 400, previous: -100, delta: 500, tone: 'good' });
  });

  test('average daily spend uses each period\'s own day count', () => {
    expect(result.avgDailySpend).toMatchObject({ current: 60, previous: 30, tone: 'bad' });
  });

  test('savings rate', () => {
    expect(result.savingsRate.current).toBe(40);
    expect(result.savingsRate.previous).toBe(-12.5);
    expect(savingsRate({ totalIncome: 0, totalExpenses: 300 })).toBeNull();
  });
});

describe('compareBreakdown', () => {
  const rows = compareBreakdown(
    [
      { key: 'food', label: 'Food', total: 500 },
      { key: 'transport', label: 'Transport', total: 200 },
    ],
    [
      { key: 'food', label: 'Food', total: 300 },
      { key: 'rent', label: 'Rent', total: 1000 },
    ],
  );

  test('keeps rows from only one period, sorted by the larger amount', () => {
    expect(rows.map(row => [row.key, row.current, row.previous, row.status])).toEqual([
      ['rent', 0, 1000, 'gone'],
      ['food', 500, 300, 'both'],
      ['transport', 200, 0, 'new'],
    ]);
  });

  test('deltas and percentages per row', () => {
    expect(rows[0]).toMatchObject({ delta: -1000, percent: { kind: 'pct', value: -100 } });
    expect(rows[1].delta).toBe(200);
    expect(rows[2].percent).toEqual({ kind: 'new' });
  });

  test('biggest increases and decreases', () => {
    expect(biggestIncreases(rows).map(row => row.key)).toEqual(['food', 'transport']);
    expect(biggestDecreases(rows).map(row => row.key)).toEqual(['rent']);
  });

  test('lists are capped at 5', () => {
    const many = compareBreakdown(
      Array.from({ length: 8 }, (_, i) => ({ key: `c${i}`, label: `C${i}`, total: 100 + i })),
      [],
    );
    expect(biggestIncreases(many)).toHaveLength(5);
  });
});

describe('topWithOther', () => {
  test('folds everything past the top 6 into "Other"', () => {
    const rows = compareBreakdown(
      Array.from({ length: 8 }, (_, i) => ({ key: `c${i}`, label: `C${i}`, total: 80 - i * 10 })),
      Array.from({ length: 8 }, (_, i) => ({ key: `c${i}`, label: `C${i}`, total: 10 })),
    );
    const top = topWithOther(rows, 6);
    expect(top).toHaveLength(7);
    expect(top[6]).toMatchObject({ key: OTHER_KEY, label: 'Other', current: 30, previous: 20 });
  });

  test('leaves a short list alone', () => {
    const rows = compareBreakdown([{ key: 'a', label: 'A', total: 1 }], []);
    expect(topWithOther(rows, 6)).toBe(rows);
  });
});

test('categoryRowsForComparison keys uncategorized spending', () => {
  expect(
    categoryRowsForComparison([
      { categoryId: null, categoryName: 'Uncategorized', total: 5 },
      { categoryId: 3, categoryName: 'Food', total: 9 },
    ]).map(row => row.key),
  ).toEqual(['uncategorized', '3']);
});

describe('computeTrendBarLayout', () => {
  test.each([3, 6, 12])('%i months on a 393dp phone fit without scrolling', months => {
    const plotWidth = 313;
    const layout = computeTrendBarLayout(plotWidth, months);
    expect(layout.scrollable).toBe(false);
    expect(layout.slotWidth * months).toBeLessThanOrEqual(plotWidth);
    expect(layout.slotWidth).toBeGreaterThanOrEqual(TREND_MIN_SLOT_WIDTH);
  });

  test('12 months on a narrow phone scroll instead of shrinking labels', () => {
    const layout = computeTrendBarLayout(280, 12);
    expect(layout.scrollable).toBe(true);
    expect(layout.slotWidth).toBeGreaterThanOrEqual(TREND_MIN_SLOT_WIDTH);
  });
});
