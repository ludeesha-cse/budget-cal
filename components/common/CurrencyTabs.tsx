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

function CurrencyTabs({ currencies, value, onChange, style }: Props): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <ScrollView
      horizontal
      style={styles.scrollView}
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
              numberOfLines={1}
              style={[
                styles.tabText,
                { color: colors.text },
                active && { color: colors.primaryText },
              ]}>
              {currency.code || '—'}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flexGrow: 0,
  },
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
    justifyContent: 'center',
  },
  tabText: {
    fontSize: scaleFont(14),
    fontWeight: '700',
  },
});

export default CurrencyTabs;
