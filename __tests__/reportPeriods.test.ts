import {
  countDaysInclusive,
  formatDateRangeLabel,
  formatPeriodShortLabel,
  formatRangeHeader,
  formatTrendRowLabel,
  getPreviousPeriod,
  lastNDaysRange,
  resolveReportPeriod,
  validateCustomRange,
} from '../utils/dateUtils';

const TODAY = '2026-10-11';

describe('resolveReportPeriod', () => {
  test('a single past month covers the whole month', () => {
    expect(resolveReportPeriod({ kind: 'month', month: '2026-09' }, TODAY)).toEqual({
      kind: 'month',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      months: ['2026-09'],
      dayCount: 30,
      label: '1 – 30 September 2026',
    });
  });

  test('leap-year February ends on the 29th', () => {
    const resolved = resolveReportPeriod({ kind: 'month', month: '2024-02' }, TODAY);
    expect(resolved.endDate).toBe('2024-02-29');
    expect(resolved.dayCount).toBe(29);
  });

  test('3 Months is the current month and the two before it', () => {
    const resolved = resolveReportPeriod({ kind: 'last3Months' }, TODAY);
    expect(resolved.startDate).toBe('2026-08-01');
    expect(resolved.endDate).toBe('2026-10-31');
    expect(resolved.months).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(resolved.dayCount).toBe(92);
    expect(resolved.label).toBe('August 2026 – October 2026');
  });

  test('Year is twelve months ending with the current one', () => {
    const resolved = resolveReportPeriod({ kind: 'lastYear' }, TODAY);
    expect(resolved.startDate).toBe('2025-11-01');
    expect(resolved.endDate).toBe('2026-10-31');
    expect(resolved.months).toHaveLength(12);
    expect(resolved.dayCount).toBe(365);
  });

  test('a custom range keeps its exact dates and lists every month it touches', () => {
    const resolved = resolveReportPeriod(
      { kind: 'custom', startDate: '2026-07-15', endDate: '2026-09-02' },
      TODAY,
    );
    expect(resolved.months).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(resolved.dayCount).toBe(50);
    expect(resolved.label).toBe('15 Jul – 2 Sep 2026');
  });

  test('custom labels across a year end and within one month', () => {
    expect(
      resolveReportPeriod(
        { kind: 'custom', startDate: '2025-12-15', endDate: '2026-01-02' },
        TODAY,
      ).label,
    ).toBe('15 Dec 2025 – 2 Jan 2026');
    expect(
      resolveReportPeriod(
        { kind: 'custom', startDate: '2026-09-03', endDate: '2026-09-19' },
        TODAY,
      ).label,
    ).toBe('3 – 19 Sep 2026');
  });
});

describe('range labels', () => {
  test('formatRangeHeader keeps the original whole-month formats', () => {
    expect(
      formatRangeHeader({
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        months: ['2026-08'],
      }),
    ).toBe('1 – 31 August 2026');
  });

  test('formatRangeHeader shows exact dates for a partial range', () => {
    expect(
      formatRangeHeader({
        startDate: '2026-07-15',
        endDate: '2026-09-02',
        months: ['2026-07', '2026-08', '2026-09'],
      }),
    ).toBe('15 Jul – 2 Sep 2026');
  });

  test('formatTrendRowLabel marks partial months', () => {
    expect(formatTrendRowLabel('2026-07', '2026-07-15', '2026-09-02')).toBe('15 – 31 Jul 2026');
    expect(formatTrendRowLabel('2026-08', '2026-07-15', '2026-09-02')).toBe('August 2026');
    expect(formatTrendRowLabel('2026-09', '2026-07-15', '2026-09-02')).toBe('1 – 2 Sep 2026');
  });

  test('formatPeriodShortLabel', () => {
    expect(formatPeriodShortLabel('2026-09-01', '2026-09-30')).toBe('Sep 2026');
    expect(formatPeriodShortLabel('2026-07-01', '2026-09-30')).toBe('Jul – Sep 2026');
    expect(formatPeriodShortLabel('2025-11-01', '2026-10-31')).toBe('Nov 2025 – Oct 2026');
    expect(formatPeriodShortLabel('2026-10-01', '2026-10-11')).toBe('1 – 11 Oct 2026');
  });

  test('formatDateRangeLabel for a single day', () => {
    expect(formatDateRangeLabel('2026-08-01', '2026-08-01')).toBe('1 Aug 2026');
  });
});

describe('custom range helpers', () => {
  test('countDaysInclusive', () => {
    expect(countDaysInclusive('2026-08-01', '2026-09-19')).toBe(50);
    expect(countDaysInclusive('2026-10-11', '2026-10-11')).toBe(1);
  });

  test('lastNDaysRange ends today', () => {
    expect(lastNDaysRange(7, TODAY)).toEqual({ startDate: '2026-10-05', endDate: TODAY });
    expect(countDaysInclusive(lastNDaysRange(90, TODAY).startDate, TODAY)).toBe(90);
  });

  test('validateCustomRange', () => {
    expect(validateCustomRange('2026-08-01', '2026-09-19', TODAY).message).toBeNull();
    expect(validateCustomRange('2026-09-20', '2026-09-19', TODAY)).toEqual({
      startInvalid: true,
      endInvalid: true,
      message: 'Start date must be on or before the end date.',
    });
    expect(validateCustomRange('2026-10-01', '2026-10-12', TODAY)).toEqual({
      startInvalid: false,
      endInvalid: true,
      message: "Dates can't be in the future.",
    });
  });
});

describe('getPreviousPeriod', () => {
  const previousOf = (period: Parameters<typeof resolveReportPeriod>[0], today = TODAY) =>
    getPreviousPeriod(resolveReportPeriod(period, today), today);

  test('a past month is compared with the whole previous calendar month', () => {
    const result = previousOf({ kind: 'month', month: '2026-09' });
    expect(result.current).toMatchObject({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      dayCount: 30,
      shortLabel: 'Sep 2026',
    });
    expect(result.previous).toMatchObject({
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      dayCount: 31,
      shortLabel: 'Aug 2026',
      dateLabel: '1 – 31 Aug 2026',
    });
    expect(result.monthToDate).toBe(false);
    expect(result.note).toBeNull();
  });

  test('January is compared with the previous December', () => {
    const result = previousOf({ kind: 'month', month: '2026-01' });
    expect(result.previous.startDate).toBe('2025-12-01');
    expect(result.previous.endDate).toBe('2025-12-31');
  });

  test('March is compared with February, 28 or 29 days', () => {
    expect(previousOf({ kind: 'month', month: '2026-03' }).previous.endDate).toBe('2026-02-28');
    expect(previousOf({ kind: 'month', month: '2024-03' }).previous.endDate).toBe('2024-02-29');
  });

  test('the month in progress is compared month-to-date', () => {
    const result = previousOf({ kind: 'month', month: '2026-10' });
    expect(result.monthToDate).toBe(true);
    expect(result.current).toMatchObject({
      startDate: '2026-10-01',
      endDate: '2026-10-11',
      dayCount: 11,
    });
    expect(result.previous).toMatchObject({
      startDate: '2026-09-01',
      endDate: '2026-09-11',
      dayCount: 11,
    });
    expect(result.note).toBe('Comparing 1–11 Oct with 1–11 Sep (month to date)');
  });

  test('month-to-date clamps to the shorter previous month', () => {
    const result = previousOf({ kind: 'month', month: '2026-03' }, '2026-03-30');
    expect(result.previous.endDate).toBe('2026-02-28');
    expect(result.note).toBe('Comparing 1–30 Mar with 1–28 Feb (month to date)');
    const leap = previousOf({ kind: 'month', month: '2024-03' }, '2024-03-30');
    expect(leap.previous.endDate).toBe('2024-02-29');
  });

  test('month-to-date in January reaches back into December', () => {
    const result = previousOf({ kind: 'month', month: '2026-01' }, '2026-01-11');
    expect(result.previous.startDate).toBe('2025-12-01');
    expect(result.previous.endDate).toBe('2025-12-11');
  });

  test('on the last day of the month the whole month is compared', () => {
    const result = previousOf({ kind: 'month', month: '2026-03' }, '2026-03-31');
    expect(result.monthToDate).toBe(false);
    expect(result.previous.endDate).toBe('2026-02-28');
  });

  test('3 Months is compared with the three whole months before', () => {
    const result = previousOf({ kind: 'last3Months' }, '2026-09-15');
    expect(result.current.shortLabel).toBe('Jul – Sep 2026');
    expect(result.previous).toMatchObject({
      startDate: '2026-04-01',
      endDate: '2026-06-30',
      shortLabel: 'Apr – Jun 2026',
    });
    // Jul (31) + Aug (31) + 1–15 Sep: averages only count days so far.
    expect(result.current.dayCount).toBe(77);
  });

  test('Year is compared with the twelve months before', () => {
    const result = previousOf({ kind: 'lastYear' });
    expect(result.previous.startDate).toBe('2024-11-01');
    expect(result.previous.endDate).toBe('2025-10-31');
  });

  test('a 50-day custom range is compared with the 50 days before it', () => {
    const result = previousOf({
      kind: 'custom',
      startDate: '2026-08-01',
      endDate: '2026-09-19',
    });
    expect(result.current.dayCount).toBe(50);
    expect(result.previous).toMatchObject({
      startDate: '2026-06-12',
      endDate: '2026-07-31',
      dayCount: 50,
    });
  });
});
