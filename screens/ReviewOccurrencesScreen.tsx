import React, { useMemo } from 'react';
import { Alert, Button, FlatList, StyleSheet, View } from 'react-native';
import NumericInputAccessory from '../components/NumericInputAccessory';
import EmptyState from '../components/common/EmptyState';
import PendingOccurrenceCard from '../components/reviewOccurrences/PendingOccurrenceCard';
import {
  getAccounts,
  getPendingOccurrences,
} from '../db/queries';
import { useTheme } from '../contexts/ThemeContext';
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useRowEditState } from '../hooks/useRowEditState';
import {
  useAccountList,
  usePendingOccurrences,
  useConfirmOccurrence as useConfirmOccurrenceMutation,
  useSkipOccurrence as useSkipOccurrenceMutation,
} from '../hooks/queries';

const NON_TRANSACTABLE_ACCOUNT_TYPES = ['Liability', 'Receivable'];

type PendingRow = Awaited<ReturnType<typeof getPendingOccurrences>>[number];
type AccountRow = Awaited<ReturnType<typeof getAccounts>>[number];

function ReviewOccurrencesScreen(): React.JSX.Element {
  // Write paths go through the caching layer's mutation hooks: each
  // one runs the same db/queries function as before and then
  // invalidates every query its write can affect (see
  // hooks/queries/invalidation.ts). The call sites below are
  // unchanged — these hooks take the wrapped function's own arguments.
  const confirmOccurrence = useConfirmOccurrenceMutation();
  const skipOccurrence = useSkipOccurrenceMutation();
  const { colors } = useTheme();
  const confirmDelete = useConfirmDelete();
  const runAction = useAsyncAction();
  // Both reads are cached now. Pending occurrences are transactional
  // (the list grows as due dates pass, with no write involved — see
  // usePendingOccurrences); the account roster is reference. Confirming
  // or skipping invalidates the recurring prefix, which is what refreshes
  // this list without a manual reload.
  const { data: pending, isPending: pendingLoading } = usePendingOccurrences();
  const { data: accountRows, isPending: accountsLoading } = useAccountList();
  const rows = useMemo<PendingRow[]>(() => pending ?? [], [pending]);
  const accounts = useMemo<AccountRow[]>(
    () =>
      (accountRows ?? []).filter(
        a => a.active && !NON_TRANSACTABLE_ACCOUNT_TYPES.includes(a.type),
      ),
    [accountRows],
  );
  const loading = pendingLoading || accountsLoading;

  const {
    editedAmount,
    editedAccountId,
    editedDate,
    setAmount,
    setAccountId,
    setDate,
    buildParams,
  } = useRowEditState(rows);

  const handleConfirm = async (row: PendingRow) => {
    await runAction(async () => {
      const params = buildParams(row);
      await confirmOccurrence(params);
      // No load() here any more: the mutation above already invalidated
      // every query this write affects, and awaiting it waits for those
      // refetches — a second read would be redundant.
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
          // No load() here any more: the mutation above already invalidated
          // every query this write affects, and awaiting it waits for those
          // refetches — a second read would be redundant.
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
