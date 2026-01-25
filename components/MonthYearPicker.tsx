import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { getCurrentYearString } from '../utils/date';
import { useTheme } from '../contexts/ThemeContext';

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
export const YEAR_OPTIONS = [currentYear, currentYear - 1, currentYear - 2].map(
  String,
);

type MonthYearPickerProps = {
  month: string;
  year: string;
  onMonthChange: (month: string) => void;
  onYearChange: (year: string) => void;
  includeAllMonths?: boolean;
};

function MonthYearPicker({
  month,
  year,
  onMonthChange,
  onYearChange,
  includeAllMonths = false,
}: MonthYearPickerProps): React.JSX.Element {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const monthOptions = includeAllMonths
    ? [{ label: 'All', value: '' }, ...MONTH_OPTIONS]
    : MONTH_OPTIONS;

  const buttonLabel = `${month ? MONTH_LABELS[month] : 'All'} ${year}`;

  const handleMonthChange = (value: string) => {
    onMonthChange(value);
    setExpanded(false);
  };

  return (
    <View>
      <Pressable
        style={[
          styles.filterButton,
          { borderColor: colors.border, backgroundColor: colors.surface },
        ]}
        onPress={() => setExpanded(current => !current)}>
        <Text style={[styles.filterButtonText, { color: colors.text }]}>
          {buttonLabel}
        </Text>
      </Pressable>
      {expanded && (
        <View style={styles.filters}>
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={month}
              onValueChange={handleMonthChange}
              // itemStyle only applies on iOS's wheel picker — Android's
              // dropdown picker inherits colors differently and isn't
              // themed here to keep this a low-risk, additive change.
              itemStyle={{ color: colors.text }}>
              {monthOptions.map(m => (
                <Picker.Item key={m.value} label={m.label} value={m.value} />
              ))}
            </Picker>
          </View>
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={year}
              onValueChange={onYearChange}
              itemStyle={{ color: colors.text }}>
              {YEAR_OPTIONS.map(y => (
                <Picker.Item key={y} label={y} value={y} />
              ))}
            </Picker>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  filterButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  filterButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  filters: {
    flexDirection: 'row',
  },
  pickerWrapper: {
    flex: 1,
  },
});

export default MonthYearPicker;
