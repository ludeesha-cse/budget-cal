import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, scaleFont } from '../../theme/typography';
import { splitDateForRow } from '../../utils/dateUtils';

type Props = {
  date: string;
};

// The day/month block repeated identically at the start of every History
// row kind (loan payment, transfer, transaction) — "07" / "AUG".
function HistoryRowDateBlock({ date }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { day, month } = splitDateForRow(date);

  return (
    <View style={styles.dateBlock}>
      <Text style={[styles.dateDay, { color: colors.text }]}>{day}</Text>
      <Text style={[typography.eyebrow, styles.dateMonth, { color: colors.textSecondary }]}>
        {month}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dateBlock: {
    width: 40,
    alignItems: 'flex-start',
    marginRight: 12,
  },
  dateDay: {
    fontSize: scaleFont(20),
    fontWeight: '700',
  },
  dateMonth: {
    marginTop: 1,
  },
});

export default HistoryRowDateBlock;
