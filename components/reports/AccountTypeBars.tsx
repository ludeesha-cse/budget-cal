import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Card from '../Card';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';
import { formatAmount } from '../../utils/formatAmount';
import type { ReportAccountTypeRow } from '../../hooks/useReportData';

type Props = {
  accountTypeBreakdown: ReportAccountTypeRow[];
  currencyCode: string;
};

// gifted-charts' horizontal BarChart used to render here, but its
// auto-computed x-axis scale (0, 251, 502, ...) routinely ran wider than
// the card and got clipped/illegible — especially with just one or two
// account types, which is the common case. A plain proportional bar per
// row (same track/fill language as the budget progress bars elsewhere on
// this screen and on Dashboard) can't overflow, since its width is
// always a percentage of the card, and reads just as clearly with a
// single row as with five.
function AccountTypeBars({ accountTypeBreakdown, currencyCode }: Props): React.JSX.Element {
  const { colors } = useTheme();

  // Denominator for each row's proportional bar width — at least 1 so a
  // lone $0 row can't divide by zero, though `.length === 0` already
  // short-circuits before this is ever read in that case.
  const maxTotal = useMemo(
    () => Math.max(1, ...accountTypeBreakdown.map(row => row.total)),
    [accountTypeBreakdown],
  );

  if (accountTypeBreakdown.length === 0) {
    return (
      <Card colors={colors} style={styles.card}>
        <Text style={{ color: colors.textSecondary }}>No expenses in this range.</Text>
      </Card>
    );
  }

  return (
    <Card colors={colors} style={styles.card}>
      {accountTypeBreakdown.map((row, index) => (
        <View
          key={row.accountType}
          style={index === accountTypeBreakdown.length - 1 ? styles.accountTypeRowLast : styles.accountTypeRow}>
          <View style={styles.accountTypeHeaderRow}>
            <Text style={[styles.listRowName, { color: colors.text }]}>{row.accountType}</Text>
            <Text style={{ color: colors.text }}>{formatAmount(row.total, currencyCode)}</Text>
          </View>
          <View style={[styles.accountTypeTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.accountTypeFill,
                {
                  width: `${Math.max(4, (row.total / maxTotal) * 100)}%`,
                  backgroundColor: colors.primary,
                },
              ]}
            />
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
  },
  listRowName: {
    fontSize: scaleFont(15),
    fontWeight: '600',
    flex: 1,
  },
  accountTypeRow: {
    marginBottom: 16,
  },
  accountTypeRowLast: {
    marginBottom: 0,
  },
  accountTypeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  accountTypeTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  accountTypeFill: {
    height: '100%',
    borderRadius: 4,
  },
});

export default AccountTypeBars;
