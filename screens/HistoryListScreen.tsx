import React, { useCallback, useState } from 'react';
import { Alert, Button, FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HistoryStackParamList } from '../navigation/types';
import {
  deleteTransaction,
  getLoanPaymentsByMonth,
  getLoanPaymentsByYear,
  getTransactionsByMonth,
  getTransactionsByYear,
} from '../db/queries';
import { getCurrentMonthString, getCurrentYearString } from '../utils/date';
import MonthYearPicker from '../components/MonthYearPicker';
import { useTheme } from '../contexts/ThemeContext';

type TransactionRow = Awaited<ReturnType<typeof getTransactionsByMonth>>[number];
type LoanPaymentRow = Awaited<ReturnType<typeof getLoanPaymentsByMonth>>[number];

// A tagged union so one FlatList can render transactions and loan_payments
// rows side by side without either shape leaking into the other's fields.
// Transfers/credit_card_payoffs aren't included here — neither feature
// exists yet in this codebase (transfers is Stage 11, not built; a
// credit_card_payoffs table was never created), so there's nothing to
// merge in for them.
type HistoryRow =
  | { kind: 'transaction'; date: string; data: TransactionRow }
  | { kind: 'loanPayment'; date: string; data: LoanPaymentRow };

type Props = NativeStackScreenProps<HistoryStackParamList, 'HistoryList'>;

function HistoryListScreen({ navigation }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const [month, setMonth] = useState(getCurrentMonthString().slice(5));
  const [year, setYear] = useState(getCurrentYearString());
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [transactionRows, loanPaymentRows] = month
      ? await Promise.all([
          getTransactionsByMonth(`${year}-${month}`),
          getLoanPaymentsByMonth(`${year}-${month}`),
        ])
      : await Promise.all([
          getTransactionsByYear(year),
          getLoanPaymentsByYear(year),
        ]);
    const merged: HistoryRow[] = [
      ...transactionRows.map(
        (data): HistoryRow => ({ kind: 'transaction', date: data.date, data }),
      ),
      ...loanPaymentRows.map(
        (data): HistoryRow => ({ kind: 'loanPayment', date: data.date, data }),
      ),
    ];
    // Neither source query sorts on its own — merging two lists needs a
    // single consistent order, and date is the only field both share.
    merged.sort((a, b) => a.date.localeCompare(b.date));
    setRows(merged);
    setLoading(false);
  }, [month, year]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleDelete = (id: number) => {
    Alert.alert(
      'Delete transaction',
      'Are you sure you want to delete this transaction?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteTransaction(id);
            load();
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MonthYearPicker
        month={month}
        year={year}
        onMonthChange={setMonth}
        onYearChange={setYear}
        includeAllMonths
      />

      {loading ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>
          Loading...
        </Text>
      ) : rows.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>
          No transactions found.
        </Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={item => `${item.kind}-${item.data.id}`}
          renderItem={({ item }) => {
            if (item.kind === 'loanPayment') {
              const loan = item.data;
              // Money flows from the real account into the loan account
              // when paying down a Liability, and from the loan account
              // into the real account when a Receivable pays you back —
              // same direction logic settleLoan itself uses.
              const isLiability = loan.loanAccountType === 'Liability';
              const fromName = isLiability
                ? loan.counterpartAccountName
                : loan.loanAccountName;
              const toName = isLiability
                ? loan.loanAccountName
                : loan.counterpartAccountName;
              return (
                <View style={[styles.row, { borderBottomColor: colors.border }]}>
                  <View style={styles.rowDetails}>
                    <Text style={[styles.rowDate, { color: colors.text }]}>
                      {loan.date}
                    </Text>
                    <Text style={{ color: colors.textSecondary }}>
                      {isLiability ? 'Loan repayment' : 'Loan collection'}:{' '}
                      {fromName} → {toName}
                    </Text>
                    <Text style={[styles.rowAmount, { color: colors.primary }]}>
                      {loan.currencyCode} {loan.amount.toFixed(2)}
                    </Text>
                  </View>
                </View>
              );
            }

            const item_ = item.data;
            return (
              <View style={[styles.row, { borderBottomColor: colors.border }]}>
                <View style={styles.rowDetails}>
                  <Text style={[styles.rowDate, { color: colors.text }]}>
                    {item_.date}
                  </Text>
                  <Text style={{ color: colors.textSecondary }}>
                    {item_.categoryName ?? (item_.entryType === 'Income' ? 'Income' : 'Unknown')}
                    {' · '}
                    {item_.description || '—'}
                  </Text>
                  <Text
                    style={[
                      styles.rowAmount,
                      {
                        color:
                          item_.entryType === 'Income'
                            ? colors.success
                            : colors.danger,
                      },
                    ]}>
                    {item_.entryType === 'Income' ? '+' : '-'}
                    {item_.amount.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.rowActions}>
                  <Button
                    title="Edit"
                    color={colors.primary}
                    onPress={() =>
                      navigation.navigate('EditTransaction', { id: item_.id })
                    }
                  />
                  <Button
                    title="Delete"
                    color={colors.danger}
                    onPress={() => handleDelete(item_.id)}
                  />
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  empty: {
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowDetails: {
    flex: 1,
  },
  rowDate: {
    fontWeight: '600',
  },
  rowAmount: {
    marginTop: 2,
    fontWeight: '600',
  },
  rowActions: {
    flexDirection: 'row',
    gap: 4,
  },
});

export default HistoryListScreen;
