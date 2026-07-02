import React, { useCallback, useState } from 'react';
import { Alert, Button, FlatList, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import NumericInputAccessory from '../components/NumericInputAccessory';
import EmptyState from '../components/common/EmptyState';
import PendingOccurrenceCard from '../components/reviewOccurrences/PendingOccurrenceCard';
import {
  confirmOccurrence,
  getAccounts,
  getPendingOccurrences,
  skipOccurrence,
} from '../db/queries';
import { useTheme } from '../contexts/ThemeContext';
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useRowEditState } from '../hooks/useRowEditState';

const NON_TRANSACTABLE_ACCOUNT_TYPES = ['Liability', 'Receivable'];

type PendingRow = Awaited<ReturnType<typeof getPendingOccurrences>>[number];
type AccountRow = Awaited<ReturnType<typeof getAccounts>>[number];

function ReviewOccurrencesScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const confirmDelete = useConfirmDelete();
  const runAction = useAsyncAction();
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);

  const {
    editedAmount,
    editedAccountId,
    editedDate,
    setAmount,
    setAccountId,
    setDate,
    buildParams,
  } = useRowEditState(rows);

  const load = useCallback(async () => {
    setLoading(true);
    const [pending, accountRows] = await Promise.all([
      getPendingOccurrences(),
      getAccounts(),
    ]);
    setRows(pending);
    setAccounts(
      accountRows.filter(
        a => a.active && !NON_TRANSACTABLE_ACCOUNT_TYPES.includes(a.type),
      ),
    );
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleConfirm = async (row: PendingRow) => {
    await runAction(async () => {
      const params = buildParams(row);
      await confirmOccurrence(params);
      await load();
    }, 'Could not confirm');
  };

  const handleSkip = (row: PendingRow) => {
    confirmDelete(
      'Skip this occurrence?',
      `No transaction will be created for "${row.ruleName}" (due ${row.dueDate}). This cannot be undone.`,
      'Skip',
      () =>
        runAction(async () => {
          await skipOccurrence(row.id);
          await load();
        }, 'Could not skip'),
    );
  };

  // Accepts every currently-listed row at whatever values are presently
  // shown (edited or default) — useful after a long absence surfaces
  // several months at once, but deliberately still just a convenience
  // wrapper around the exact same per-row confirm, never a separate
  // "bulk" code path with its own rules.
  const handleConfirmAll = async () => {
    const failures: string[] = [];
    for (const row of rows) {
      try {
        const params = buildParams(row);
        await confirmOccurrence(params);
      } catch (error) {
        failures.push(
          `${row.ruleName} (${row.dueDate}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    await load();
    if (failures.length > 0) {
      Alert.alert(
        'Some occurrences could not be confirmed',
        failures.join('\n'),
      );
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {loading ? (
        <EmptyState message="Loading..." />
      ) : rows.length === 0 ? (
        <EmptyState message="Nothing to review — every recurring rule is up to date." />
      ) : (
        <>
          <View style={styles.confirmAllRow}>
            <Button
              title={`Confirm All (${rows.length})`}
              color={colors.primary}
              onPress={handleConfirmAll}
            />
          </View>
          <FlatList
            data={rows}
            keyExtractor={item => String(item.id)}
            style={styles.list}
            renderItem={({ item }) => (
              <PendingOccurrenceCard
                row={item}
                accounts={accounts}
                amount={editedAmount[item.id] ?? String(item.amount)}
                accountId={editedAccountId[item.id] ?? item.accountId}
                date={editedDate[item.id] ?? item.dueDate}
                onAmountChange={value => setAmount(item.id, value)}
                onAccountIdChange={value => setAccountId(item.id, value)}
                onDateChange={value => setDate(item.id, value)}
                onSkip={() => handleSkip(item)}
                onConfirm={() => handleConfirm(item)}
              />
            )}
          />
        </>
      )}
      <NumericInputAccessory />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  confirmAllRow: {
    marginBottom: 12,
  },
  list: {
    flex: 1,
  },
});

export default ReviewOccurrencesScreen;
