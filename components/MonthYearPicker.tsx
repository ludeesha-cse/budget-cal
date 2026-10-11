import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import BottomSheetModal from './BottomSheetModal';
import { getCurrentMonthString, getCurrentYearString } from '../utils/date';
import { useTheme } from '../contexts/ThemeContext';
import { scaleFont } from '../theme/typography';

export const MONTH_OPTIONS = [
  { label: 'January', value: '01' },
  { label: 'February', value: '02' },
  { label: 'March', value: '03' },
  { label: 'April', value: '04' },
  { label: 'May', value: '05' },
  { label: 'June', value: '06' },
  { label: 'July', value: '07' },
  { label: 'August', value: '08' },
  { label: 'September', value: '09' },
  { label: 'October', value: '10' },
  { label: 'November', value: '11' },
  { label: 'December', value: '12' },
];

const MONTH_LABELS = Object.fromEntries(
  MONTH_OPTIONS.map(m => [m.value, m.label]),
) as Record<string, string>;

const currentYear = Number(getCurrentYearString());
// Newest first. The year stepper below walks this list, so it can never
// land on a year outside it.
export const YEAR_OPTIONS = [currentYear, currentYear - 1, currentYear - 2].map(
  String,
);

type MonthYearPickerProps = {
  month: string;
  year: string;
  onMonthChange: (month: string) => void;
  onYearChange: (year: string) => void;
  includeAllMonths?: boolean;
  // Greys out months after the current one in the current year. Off by
  // default: budgets are legitimately set for months that haven't
  // started yet. Reports turns it on — there is nothing to report there.
  disableFutureMonths?: boolean;
  // Outer spacing for the chip. The chip itself carries no margin, so it
  // lines up with whatever it sits next to (History's tag chips).
  style?: StyleProp<ViewStyle>;
};

// A chip showing the selected month ("September 2026") that opens a
// themed sheet: a year stepper above a 3x4 grid of months.
//
// This replaced two @react-native-picker/picker components laid side by
// side. Android's dropdown variant of that picker ignores the theme, so
// its text was unreadable (invisible in dark mode), and iOS's wheels were
// clipped in half a screen width each — in practice nobody could pick a
// month. Everything here is drawn with plain views and theme colors.
function MonthYearPicker({
  month,
  year,
  onMonthChange,
  onYearChange,
  includeAllMonths = false,
  disableFutureMonths = false,
  style,
}: MonthYearPickerProps): React.JSX.Element {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  // The year shown in the sheet. Stepping it only browses — nothing is
  // applied until a month is tapped, which commits year and month
  // together. That way the screen behind never reloads for a year the
  // user was just passing through on the way to another.
  const [draftYear, setDraftYear] = useState(year);

  const buttonLabel = `${month ? MONTH_LABELS[month] : 'All'} ${year}`;
  const yearIndex = YEAR_OPTIONS.indexOf(draftYear);
  const canGoOlder = yearIndex >= 0 && yearIndex < YEAR_OPTIONS.length - 1;
  const canGoNewer = yearIndex > 0;
  const currentMonth = getCurrentMonthString();

  const openSheet = () => {
    setDraftYear(year);
    setOpen(true);
  };

  const pickMonth = (value: string) => {
    if (draftYear !== year) {
      onYearChange(draftYear);
    }
    onMonthChange(value);
    setOpen(false);
  };

  const monthCells = [
    ...(includeAllMonths ? [{ label: 'All', value: '' }] : []),
    ...MONTH_OPTIONS.map(m => ({ label: m.label.slice(0, 3), value: m.value })),
  ];

  return (
    <View style={style}>
      <Pressable
        style={[styles.chip, { backgroundColor: colors.primary }]}
        onPress={openSheet}
        accessibilityRole="button"
        accessibilityLabel={`Month: ${buttonLabel}. Tap to change.`}
      >
        <Text style={[styles.chipText, { color: colors.primaryText }]}>
          {buttonLabel}
        </Text>
      </Pressable>

      <BottomSheetModal
        visible={open}
        onClose={() => setOpen(false)}
        title="Select month"
        cancelLabel="Close"
      >
        <View style={styles.yearRow}>
          <Pressable
            style={[styles.yearArrow, !canGoOlder && styles.disabled]}
            disabled={!canGoOlder}
            hitSlop={8}
            accessibilityLabel="Previous year"
            onPress={() => setDraftYear(YEAR_OPTIONS[yearIndex + 1])}
          >
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.yearText, { color: colors.text }]}>
            {draftYear}
          </Text>
          <Pressable
            style={[styles.yearArrow, !canGoNewer && styles.disabled]}
            disabled={!canGoNewer}
            hitSlop={8}
            accessibilityLabel="Next year"
            onPress={() => setDraftYear(YEAR_OPTIONS[yearIndex - 1])}
          >
            <ChevronRight size={24} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.grid}>
          {monthCells.map(cell => {
            const selected = draftYear === year && cell.value === month;
            const disabled =
              disableFutureMonths &&
              cell.value !== '' &&
              `${draftYear}-${cell.value}` > currentMonth;
            return (
              <Pressable
                key={cell.value || 'all'}
                disabled={disabled}
                onPress={() => pickMonth(cell.value)}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled }}
                style={[
                  styles.cell,
                  cell.value === '' && styles.cellWide,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                  selected && {
                    backgroundColor: colors.primary,
                    borderColor: colors.primary,
                  },
                  disabled && styles.disabled,
                ]}
              >
                <Text
                  style={[
                    styles.cellText,
                    { color: selected ? colors.primaryText : colors.text },
                  ]}
                >
                  {cell.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: scaleFont(14),
    fontWeight: '700',
  },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  yearArrow: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearText: {
    fontSize: scaleFont(18),
    fontWeight: '700',
  },
  // Three per row: each cell is just under a third of the width and
  // space-between spreads the remainder between them.
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  cell: {
    width: '31%',
    minHeight: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // "All" spans its own row above the twelve months, rather than being a
  // 13th cell left on a row by itself at the end.
  cellWide: {
    width: '100%',
  },
  cellText: {
    fontSize: scaleFont(15),
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.35,
  },
});

export default MonthYearPicker;
