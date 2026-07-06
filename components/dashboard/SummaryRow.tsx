import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont, typography } from '../../theme/typography';

type Props = {
  icon: LucideIcon;
  iconColor: string;
  iconBackground: string;
  label: string;
  value: string;
  valueColor: string;
  isLast?: boolean;
};

function SummaryRow({
  icon: Icon,
  iconColor,
  iconBackground,
  label,
  value,
  valueColor,
  isLast = false,
}: Props): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <View style={[styles.row, !isLast && [styles.rowDivider, { borderBottomColor: colors.border }]]}>
      <View style={[styles.iconCircle, { backgroundColor: iconBackground }]}>
        <Icon size={18} color={iconColor} />
      </View>
      <View style={styles.textCol}>
        <Text style={[typography.eyebrow, styles.label, { color: colors.textSecondary }]}>
          {label}
        </Text>
        <Text style={[typography.amountMono, styles.value, { color: valueColor }]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textCol: {
    flex: 1,
  },
  label: {
    marginBottom: 4,
  },
  value: {
    fontSize: scaleFont(15),
  },
});

export default SummaryRow;
