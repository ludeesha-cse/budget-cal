import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { formatAmount } from '../../utils/formatAmount';
import type { getOccurrenceHistory } from '../../db/queries';

type HistoryRow = Awaited<ReturnType<typeof getOccurrenceHistory>>[number];

type Props = {
  history: HistoryRow[] | undefined;
  currencyCode: string;
};

// The expanded occurrence-history list for one rule — fetched lazily on
// first expand (see useLazyExpandableDetail wiring in the screen), so
// `history` is undefined until that fetch resolves.
function OccurrenceHistoryList({ history, currencyCode }: Props): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <View style={styles.historyList}>
      {!history ? (
        <Text style={{ color: colors.textSecondary }}>Loading...</Text>
      ) : history.length === 0 ? (
        <Text style={{ color: colors.textSecondary }}>No resolved occurrences yet.</Text>
      ) : (
        history.map(occurrence => (
          <View key={occurrence.id} style={[styles.historyRow, { borderTopColor: colors.border }]}>
            <Text style={{ color: colors.text }}>
              {occurrence.dueDate} —{' '}
              {occurrence.status === 'confirmed'
                ? `Confirmed ${formatAmount(occurrence.confirmedAmount ?? 0, currencyCode)}${
                    occurrence.accountName ? ` (${occurrence.accountName})` : ''
                  }`
                : occurrence.status === 'skipped'
                  ? 'Skipped'
                  : 'Pending'}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  historyList: {
    marginTop: 8,
    gap: 4,
  },
  historyRow: {
    paddingVertical: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

export default OccurrenceHistoryList;
