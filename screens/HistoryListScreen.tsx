import React, { useCallback, useState } from 'react';
import { Alert, Button, FlatList, StyleSheet, Text, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HistoryStackParamList } from '../navigation/types';
import {
  deleteTransaction,
  getTransactionsByMonth,
  getTransactionsByYear,
} from '../db/queries';
import { getCurrentMonthString, getCurrentYearString } from '../utils/date';

type TransactionRow = Awaited<ReturnType<typeof getTransactionsByMonth>>[number];

const MONTHS = [
  { label: 'All', value: '' },
  { label: 'January', value: '01' },
  { label: 'February', value: '02' },
  { label: 'March', value: '03' },
  { label: 'April', value: '04' },
  { label: 'May', value: '05' },
  { label: 'June', value: '06' },
  { label: 'July', value: '07' },
  { label: 'August', value: '08' },
  { label: 'September', value: '09' },
  { label: 'October', value: '10' },
  { label: 'November', value: '11' },
  { label: 'December', value: '12' },
];

const currentYear = Number(getCurrentYearString());
const YEARS = [currentYear, currentYear - 1, currentYear - 2].map(String);

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
      <View style={styles.filters}>
        <View style={styles.pickerWrapper}>
          <Picker selectedValue={month} onValueChange={setMonth}>
            {MONTHS.map(m => (
              <Picker.Item key={m.value} label={m.label} value={m.value} />
            ))}
          </Picker>
        </View>
        <View style={styles.pickerWrapper}>
          <Picker selectedValue={year} onValueChange={setYear}>
            {YEARS.map(y => (
              <Picker.Item key={y} label={y} value={y} />
            ))}
          </Picker>
        </View>
      </View>

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
                  {item.category} · {item.description || '—'}
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
  filters: {
    flexDirection: 'row',
  },
  pickerWrapper: {
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
