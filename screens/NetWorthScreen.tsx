import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import ScreenBackground from '../components/ScreenBackground';
import Card from '../components/Card';
import { getNetWorthByCurrency, NetWorthByCurrency } from '../utils/netWorth';
import { formatAmount } from '../utils/formatAmount';
import { useTheme } from '../contexts/ThemeContext';
import { typography, scaleFont } from '../theme/typography';

// Its own screen, deliberately NOT a Dashboard card and NOT a flat entry
// in the main More list — "everything you own minus everything you owe,
// in one number" is exactly the figure someone glancing over your
// shoulder shouldn't see for free. Reached from Accounts ("View Net
// Worth →" at the bottom of that screen) so getting here takes an actual
// choice, not just opening the app or opening More.
function NetWorthScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const [netWorthByCurrency, setNetWorthByCurrency] = useState<
    Record<string, NetWorthByCurrency>
  >({});
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      getNetWorthByCurrency()
        .then(result => {
          if (!cancelled) {
            setNetWorthByCurrency(result);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

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

        {loading ? (
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
    paddingBottom: 40,
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
