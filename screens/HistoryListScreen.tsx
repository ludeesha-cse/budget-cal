import React, { useCallback, useState } from 'react';
import { Alert, Button, FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HistoryStackParamList } from '../navigation/types';
import {
  deleteTransaction,
  getTransactionsByMonth,
  getTransactionsByYear,
} from '../db/queries';
import { getCurrentMonthString, getCurrentYearString } from '../utils/date';
import MonthYearPicker from '../components/MonthYearPicker';

type TransactionRow = Awaited<ReturnType<typeof getTransactionsByMonth>>[number];

type Props = NativeStackScreenProps<HistoryStackParamList, 'HistoryList'>;

function HistoryListScreen({ navigation }: Props): React.JSX.Element {
  const [month, setMonth] = useState(getCurrentMonthString().slice(5));
  const [year, setYear] = useState(getCurrentYearString());
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const rows = month
      ? await getTransactionsByMonth(`${year}-${month}`)
      : await getTransactionsByYear(year);
    setTransactions(rows);
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
    <View style={styles.container}>
      <MonthYearPicker
        month={month}
        year={year}
        onMonthChange={setMonth}
        onYearChange={setYear}
        includeAllMonths
      />

      {loading ? (
        <Text style={styles.empty}>Loading...</Text>
      ) : transactions.length === 0 ? (
        <Text style={styles.empty}>No transactions found.</Text>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={item => String(item.id)}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowDetails}>
                <Text style={styles.rowDate}>{item.date}</Text>
                <Text>
                  {item.categoryName ?? 'Unknown'} · {item.description || '—'}
                </Text>
                <Text style={styles.rowAmount}>{item.amount.toFixed(2)}</Text>
              </View>
              <View style={styles.rowActions}>
                <Button
                  title="Edit"
                  onPress={() =>
                    navigation.navigate('EditTransaction', { id: item.id })
                  }
                />
                <Button title="Delete" onPress={() => handleDelete(item.id)} />
              </View>
            </View>
          )}
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
    borderBottomColor: '#ccc',
  },
  rowDetails: {
    flex: 1,
  },
  rowDate: {
    fontWeight: '600',
  },
  rowAmount: {
    marginTop: 2,
  },
  rowActions: {
    flexDirection: 'row',
    gap: 4,
  },
});

export default HistoryListScreen;
