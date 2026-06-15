import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';

type Props = {
  label: string;
  primaryText: string;
  primaryColor: string;
  secondaryText: string;
  secondaryColor: string;
};

// One "label on the left, two stacked figures on the right" row — shared
// by the category breakdown list (amount + percent) and the monthly
// trend list (income + expense), which previously duplicated this exact
// layout byte-for-byte.
function AmountListRow({
  label,
  primaryText,
  primaryColor,
  secondaryText,
  secondaryColor,
}: Props): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <View style={[styles.listRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.listRowName, { color: colors.text }]}>{label}</Text>
      <View style={styles.listRowValues}>
        <Text style={{ color: primaryColor }}>{primaryText}</Text>
        <Text style={{ color: secondaryColor }}>{secondaryText}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listRowName: {
    fontSize: scaleFont(15),
    fontWeight: '600',
    flex: 1,
  },
  listRowValues: {
    alignItems: 'flex-end',
    gap: 2,
  },
});

export default AmountListRow;
