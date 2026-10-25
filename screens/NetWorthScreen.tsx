import React from 'react';
import LoadErrorState from '../components/common/LoadErrorState';
import { ActivityIndicator, ScrollView, StyleSheet, Text } from 'react-native';
import ScreenBackground from '../components/ScreenBackground';
import Card from '../components/Card';
import { useNetWorthData } from '../hooks/useNetWorthData';
import { formatAmount } from '../utils/formatAmount';
import { useTheme } from '../contexts/ThemeContext';
import { typography, scaleFont } from '../theme/typography';
import { FAB_CLEARANCE } from '../theme/layout';

function NetWorthScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const { netWorthByCurrency, loading, loadFailed, retry } = useNetWorthData();

  return (
    <ScreenBackground colors={colors}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <Text style={[typography.eyebrow, styles.eyebrow, { color: colors.textSecondary }]}>
          Private
        </Text>
        <Text style={[typography.screenTitle, { color: colors.text }]}>
          Net Worth
        </Text>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Assets minus liabilities, credit card debt, and remaining
          installments — by currency, never summed across them.
        </Text>

        {loadFailed ? (
          <LoadErrorState what="your net worth" onRetry={retry} />
        ) : loading ? (
          <ActivityIndicator size="large" style={styles.loadingSpinner} />
        ) : Object.keys(netWorthByCurrency).length > 0 ? (
          Object.values(netWorthByCurrency)
            .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode))
            .map(row => (
              <Card key={row.currencyCode} colors={colors} style={styles.card}>
                <Text style={[styles.currencyLabel, { color: colors.text }]}>
                  {row.currencyCode}
                </Text>
                <Text style={[styles.row, { color: colors.success }]}>
                  Assets:{' '}
                  {formatAmount(row.assets, row.currencyCode, { hideCode: true })}
                </Text>
                <Text style={[styles.row, { color: colors.danger }]}>
                  Liabilities:{' '}
                  {formatAmount(row.liabilities, row.currencyCode, {
                    hideCode: true,
                  })}
                </Text>
                <Text style={[styles.row, { color: colors.danger }]}>
                  Credit card debt:{' '}
                  {formatAmount(row.creditCardDebt, row.currencyCode, {
                    hideCode: true,
                  })}
                </Text>
                <Text style={[styles.row, { color: colors.danger }]}>
                  Remaining installments:{' '}
                  {formatAmount(row.remainingInstallments, row.currencyCode, {
                    hideCode: true,
                  })}
                </Text>
                <Text
                  style={[
                    styles.totalRow,
                    { color: row.netWorth >= 0 ? colors.success : colors.danger },
                  ]}>
                  Net worth:{' '}
                  {formatAmount(row.netWorth, row.currencyCode, { hideCode: true })}
                </Text>
              </Card>
            ))
        ) : (
          <Card colors={colors} style={styles.card}>
            <Text style={{ color: colors.textSecondary }}>
              No accounts to calculate net worth from yet.
            </Text>
          </Card>
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    padding: 16,
    paddingBottom: FAB_CLEARANCE,
  },
  eyebrow: {
    marginBottom: 4,
  },
  hint: {
    fontSize: scaleFont(13),
    marginTop: 8,
    marginBottom: 20,
    lineHeight: scaleFont(18),
  },
  loadingSpinner: {
    marginTop: 24,
  },
  card: {
    padding: 16,
    marginBottom: 10,
  },
  currencyLabel: {
    fontSize: scaleFont(14),
    fontWeight: '700',
    marginBottom: 4,
  },
  row: {
    fontSize: scaleFont(15),
    marginBottom: 6,
  },
  totalRow: {
    fontSize: scaleFont(16),
    fontWeight: '700',
    marginTop: 4,
  },
});

export default NetWorthScreen;
