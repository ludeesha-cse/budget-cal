import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HistoryStackParamList } from '../navigation/types';
import TransactionForm, {
  TransactionFormSubmitValues,
} from '../components/TransactionForm';
import {
  getTagsForTransaction,
  getTransactionById,
} from '../db/queries';
import { useTheme } from '../contexts/ThemeContext';
import { useUpdateTransaction as useUpdateTransactionMutation } from '../hooks/queries';
import LoadErrorState from '../components/common/LoadErrorState';

type Props = NativeStackScreenProps<HistoryStackParamList, 'EditTransaction'>;

function EditTransactionScreen({
  route,
  navigation,
}: Props): React.JSX.Element {
  // Write paths go through the caching layer's mutation hooks: each
  // one runs the same db/queries function as before and then
  // invalidates every query its write can affect (see
  // hooks/queries/invalidation.ts). The call sites below are
  // unchanged — these hooks take the wrapped function's own arguments.
  const updateTransaction = useUpdateTransactionMutation();
  const { colors } = useTheme();
  const { id } = route.params;
  const [transaction, setTransaction] = useState<
    Awaited<ReturnType<typeof getTransactionById>>
  >(null);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setLoading(true);
    setLoadFailed(false);
    Promise.all([getTransactionById(id), getTagsForTransaction(id)])
      .then(([row, currentTags]) => {
        setTransaction(row);
        setTagIds(currentTags.map(tag => tag.id));
        setLoading(false);
      })
      .catch(error => {
        // Was an unhandled rejection that left the spinner up forever.
        console.error(
          `EditTransactionScreen: failed to load transaction id=${id}`,
          error,
        );
        setLoadFailed(true);
        setLoading(false);
      });
  }, [id, attempt]);

  const handleSubmit = async (values: TransactionFormSubmitValues) => {
    // One write for the row and its tags (see updateTransaction). A
    // failure is thrown back to TransactionForm, which shows it and keeps
    // the edit on screen.
    await updateTransaction(id, {
      accountId: values.accountId,
      amount: values.amount,
      categoryId: values.categoryId,
      description: values.description,
      date: values.date,
      currencyId: values.currencyId,
      entryType: values.entryType,
      excludeFromBudget: values.excludeFromBudget,
      tagIds: values.tagIds,
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

  if (loadFailed) {
    return (
      <View style={[styles.padded, { backgroundColor: colors.background }]}>
        <LoadErrorState
          what="this transaction"
          onRetry={() => setAttempt(current => current + 1)}
        />
      </View>
    );
  }

  if (!transaction) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>
          This transaction no longer exists — it may have been deleted.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TransactionForm
        initialValues={{
          date: transaction.date,
          amount: transaction.amount,
          categoryId: transaction.categoryId ?? undefined,
          description: transaction.description ?? '',
          accountId: transaction.accountId,
          currencyId: transaction.currencyId,
          entryType: transaction.entryType,
          tagIds,
          excludeFromBudget: transaction.excludeFromBudget,
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
  padded: {
    flex: 1,
    padding: 16,
  },
});

export default EditTransactionScreen;
