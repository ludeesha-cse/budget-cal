import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';

export type CurrencyTabOption = { id: number; code: string };

type Props = {
  currencies: CurrencyTabOption[];
  value: number | null;
  onChange: (currencyId: number) => void;
  style?: StyleProp<ViewStyle>;
};

// Same visual language as SegmentedToggle (neutral border, primary fill +
// primaryText only when active) but deliberately a different component
// rather than a SegmentedToggle variant: SegmentedToggle's buttons are
// `flex: 1`, which only works for the small, fixed-length option lists it
// was built for (Expense/Income, three date-range presets, etc). A
// currency list is DB-driven and open-ended — a user can add as many
// currencies as they like via the Currencies screen — so this renders
// fixed-width pills in a horizontal ScrollView instead, which degrades to
// "scroll sideways" rather than "squeeze N buttons into the screen width"
// once there are more than 3-4 currencies. Single-select, like
// SegmentedToggle — there's always exactly one "current" currency being
// viewed or edited on every screen this is used on.
function CurrencyTabs({ currencies, value, onChange, style }: Props): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, style]}>
      {currencies.map(currency => {
        const active = currency.id === value;
        return (
          <Pressable
            key={currency.id}
            style={[
              styles.tab,
              { backgroundColor: colors.surface, borderColor: colors.border },
              active && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
            onPress={() => onChange(currency.id)}>
            <Text
              style={[
                styles.tabText,
                { color: colors.text },
                active && { color: colors.primaryText },
              ]}>
              {currency.code}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  tabText: {
    fontSize: scaleFont(14),
    fontWeight: '700',
  },
});

export default CurrencyTabs;
