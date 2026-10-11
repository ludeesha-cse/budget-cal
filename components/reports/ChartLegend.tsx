import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';

type Props = {
  items: { label: string; color: string }[];
};

// "● Income  ● Expenses" — the key under a chart whose series are told
// apart only by color.
function ChartLegend({ items }: Props): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      {items.map(item => (
        <View key={item.label} style={styles.item}>
          <View style={[styles.dot, { backgroundColor: item.color }]} />
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 16,
    rowGap: 4,
    marginTop: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  label: {
    fontSize: scaleFont(12),
    fontWeight: '600',
  },
});

export default ChartLegend;
