import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';

export type SegmentedToggleOption<T extends string> = {
  key: T;
  label: string;
};

type Props<T extends string> = {
  options: SegmentedToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
};

// Replaces the `toggleRow`/`toggleButton` pair reimplemented from scratch
// in 6+ screen files (see REFACTOR_AUDIT.md, pattern #3) — Installment
// Plans' mode picker, Recurring Rules' list filter *and* form type picker,
// Liabilities & Receivables' list filter, Reports' range preset, Savings
// Goals' list filter, and TransactionForm's Expense/Income toggle. Two of
// those (Installment Plans, Recurring Rules' form toggle) were still on an
// older visual treatment (always-colored border/text) that the other
// sites had already moved past — this standardizes everyone onto the
// newer one (neutral border, primary fill + primaryText only when active)
// rather than picking a treatment and leaving the inconsistency in place.
//
// Generic over the option's own key type (string literal unions like
// 'Expense' | 'Income') so callers keep full type safety on `value` and
// `onChange` instead of widening to a bare `string`.
function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  style,
}: Props<T>): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, style]}>
      {options.map(option => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            style={[
              styles.button,
              { backgroundColor: colors.surface, borderColor: colors.border },
              active && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
            onPress={() => onChange(option.key)}>
            <Text
              style={[
                styles.buttonText,
                { color: colors.text },
                active && { color: colors.primaryText },
              ]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: scaleFont(14),
    fontWeight: '700',
  },
});

export default SegmentedToggle;
