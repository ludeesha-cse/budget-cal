import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HistoryStackParamList } from '../navigation/types';
import TransactionForm, {
  TransactionFormSubmitValues,
} from '../components/TransactionForm';
import { getTransactionById, updateTransaction } from '../db/queries';
import { useTheme } from '../contexts/ThemeContext';

type Props = NativeStackScreenProps<HistoryStackParamList, 'EditTransaction'>;

function EditTransactionScreen({
  route,
  navigation,
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { id } = route.params;
  const [transaction, setTransaction] = useState<
    Awaited<ReturnType<typeof getTransactionById>>
  >(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTransactionById(id).then(row => {
      setTransaction(row);
      setLoading(false);
    });
  }, [id]);

  const handleSubmit = async (values: TransactionFormSubmitValues) => {
    await updateTransaction(id, {
      accountId: values.accountId,
      amount: values.amount,
      categoryId: values.categoryId,
      description: values.description,
      date: values.date,
      currencyId: values.currencyId,
      entryType: values.entryType,
    });
    navigation.navigate('HistoryList');
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!transaction) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Transaction not found.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TransactionForm
        initialValues={{
          date: transaction.date,
          amount: transaction.amount,
          // Only legacy Income rows (created before categoryId became
          // nullable) can actually be null here — TransactionForm still
          // requires picking one before submit either way.
          categoryId: transaction.categoryId ?? undefined,
          description: transaction.description ?? '',
          accountId: transaction.accountId,
          currencyId: transaction.currencyId,
          entryType: transaction.entryType,
        }}
        onSubmit={handleSubmit}
        submitLabel="Update"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default EditTransactionScreen;
