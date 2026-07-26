import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Button, FlatList, StyleSheet, View } from 'react-native';
import NumericInputAccessory from '../components/NumericInputAccessory';
import EmptyState from '../components/common/EmptyState';
import PendingOccurrenceCard from '../components/reviewOccurrences/PendingOccurrenceCard';
import PendingInstallmentCard from '../components/reviewOccurrences/PendingInstallmentCard';
import {
  getAccounts,
  type PendingInstallmentOccurrenceRow,
  type PendingRecurringOccurrenceRow,
  type PendingScheduledPayment,
} from '../db/queries';
import { useTheme } from '../contexts/ThemeContext';
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useRowEditState } from '../hooks/useRowEditState';
import { isPayableAccount } from '../utils/accountTypes';
import {
  useAccountList,
  useAdvanceInstallmentSchedule as useAdvanceInstallmentScheduleMutation,
  useConfirmOccurrence as useConfirmOccurrenceMutation,
  usePayInstallment as usePayInstallmentMutation,
  usePendingScheduledPayments,
  useSkipInstallmentOccurrence as useSkipInstallmentOccurrenceMutation,
  useSkipOccurrence as useSkipOccurrenceMutation,
} from '../hooks/queries';

// See utils/accountTypes.ts.

type AccountRow = Awaited<ReturnType<typeof getAccounts>>[number];

function ReviewOccurrencesScreen(): React.JSX.Element {
  // Write paths go through the caching layer's mutation hooks: each
  // one runs the same db/queries function as before and then
  // invalidates every query its write can affect (see
  // hooks/queries/invalidation.ts). The call sites below are
  // unchanged — these hooks take the wrapped function's own arguments.
  const confirmOccurrence = useConfirmOccurrenceMutation();
  const skipOccurrence = useSkipOccurrenceMutation();
  // An installment row's "Pay" goes through the SAME payInstallment
  // flow the Installment Plans screen uses — this screen only ever
  // decides WHICH item is being acted on, it does not get a second way
  // of paying an installment. Skipping is the one action that is this
  // screen's own, and it is two steps: dismiss this month, then open the
  // door to next month, exactly as a skipped recurring entry does not
  // leave its rule stuck.
  const payInstallment = usePayInstallmentMutation();
  const skipInstallmentOccurrence = useSkipInstallmentOccurrenceMutation();
  const advanceInstallmentSchedule = useAdvanceInstallmentScheduleMutation();

  const { colors } = useTheme();
  const confirmDelete = useConfirmDelete();
  const runAction = useAsyncAction();

  // ONE read for both kinds of pending item, already merged and sorted by
  // due date (see getPendingScheduledPayments) — the same cache entry the
  // Dashboard banner counts, so the banner's number and this list can
  // never disagree.
  const { data: pending, isPending: pendingLoading } =
    usePendingScheduledPayments();
  const { data: accountRows, isPending: accountsLoading } = useAccountList();

  const rows = useMemo<PendingScheduledPayment[]>(() => pending ?? [], [pending]);
  const accounts = useMemo<AccountRow[]>(
    () =>
      (accountRows ?? []).filter(
        isPayableAccount,
      ),
    [accountRows],
  );
  const loading = pendingLoading || accountsLoading;

  // useRowEditState is keyed by recurring-occurrence id and seeds itself
  // from a rule's amount/account/date, so it is fed only the recurring
  // half. Installment rows keep their own, much smaller state below:
  // there is no amount to edit (payInstallment computes it from the
  // plan's schedule), only which account pays and on what date.
  const recurringRows = useMemo<PendingRecurringOccurrenceRow[]>(
    () => rows.filter(row => row.kind === 'recurring').map(row => row.recurring),
    [rows],
  );
  const {
    editedAmount,
    editedAccountId,
    editedDate,
    setAmount,
    setAccountId,
    setDate,
    buildParams,
  } = useRowEditState(recurringRows);

  // Keyed by installment-occurrence id. Deliberately unseeded — a missing
  // entry falls back to the first usable account and the occurrence's own
  // due date at read time, so there is no effect that could clobber what
  // the user is part-way through changing on another row when the list
  // refreshes behind them.
  const [installmentAccountId, setInstallmentAccountId] = useState<
    Record<number, number>
  >({});
  const [installmentDate, setInstallmentDate] = useState<Record<number, string>>(
    {},
  );
  const defaultAccountId = accounts[0]?.id ?? null;
  const accountIdFor = useCallback(
    (row: PendingInstallmentOccurrenceRow) =>
      installmentAccountId[row.id] ?? defaultAccountId,
    [installmentAccountId, defaultAccountId],
  );
  const dateFor = useCallback(
    (row: PendingInstallmentOccurrenceRow) =>
      installmentDate[row.id] ?? row.dueDate,
    [installmentDate],
  );

  const handleConfirm = async (row: PendingRecurringOccurrenceRow) => {
    await runAction(async () => {
      const params = buildParams(row);
      await confirmOccurrence(params);
      // No load() here: the mutation above already invalidated every
      // query this write affects, and awaiting it waits for those
      // refetches — a second read would be redundant.
    }, 'Could not confirm');
  };

  const handleSkip = (row: PendingRecurringOccurrenceRow) => {
    confirmDelete(
      'Skip this occurrence?',
      `No transaction will be created for "${row.ruleName}" (due ${row.dueDate}). This cannot be undone.`,
      'Skip',
      () =>
        runAction(async () => {
          await skipOccurrence(row.id);
        }, 'Could not skip'),
    );
  };

  const handlePayInstallment = async (row: PendingInstallmentOccurrenceRow) => {
    await runAction(async () => {
      const accountId = accountIdFor(row);
      if (accountId == null) {
        throw new Error(
          `Choose which account is paying "${row.planName}".`,
        );
      }
      // payInstallment resolves this occurrence and schedules the next
      // one itself, so there is nothing to advance here.
      await payInstallment({
        planId: row.installmentPlanId,
        accountId,
        date: dateFor(row),
      });
    }, 'Could not pay installment');
  };

  const handleSkipInstallment = (row: PendingInstallmentOccurrenceRow) => {
    confirmDelete(
      'Skip this installment?',
      `No payment will be recorded for "${row.planName}" (installment ${row.installmentNumber}, due ${row.dueDate}), and no balance will move. The installment itself stays unpaid. This cannot be undone.`,
      'Skip',
      () =>
        runAction(async () => {
          await skipInstallmentOccurrence(row.id);
          // A skip still has to open the door to next month, or this
          // plan would be left with no pending occurrence at all and no
          // way to ever get one again.
          await advanceInstallmentSchedule(row.installmentPlanId);
        }, 'Could not skip installment'),
    );
  };

  // Accepts every currently-listed row at whatever values are presently
  // shown (edited or default) — useful after a long absence surfaces
  // several months at once, but deliberately still just a convenience
  // wrapper around the exact same per-row action, never a separate
  // "bulk" code path with its own rules. Each kind goes down its own
  // path, the same one its own button uses.
  const handleConfirmAll = async () => {
    const failures: string[] = [];
    for (const row of rows) {
      try {
        if (row.kind === 'recurring') {
          await confirmOccurrence(buildParams(row.recurring));
        } else {
          const accountId = accountIdFor(row.installment);
          if (accountId == null) {
            throw new Error('No account available to pay from.');
          }
          await payInstallment({
            planId: row.installment.installmentPlanId,
            accountId,
            date: dateFor(row.installment),
          });
        }
      } catch (error) {
        failures.push(
          `${row.name} (${row.dueDate}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    if (failures.length > 0) {
      Alert.alert('Some entries could not be confirmed', failures.join('\n'));
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {loading ? (
        <EmptyState message="Loading..." />
      ) : rows.length === 0 ? (
        <EmptyState message="Nothing to review — every recurring rule and installment plan is up to date." />
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
            // Ids are only unique within each occurrence table, so the
            // merged list keys on the kind-qualified key the query built.
            keyExtractor={item => item.key}
            style={styles.list}
            renderItem={({ item }) =>
              item.kind === 'recurring' ? (
                <PendingOccurrenceCard
                  row={item.recurring}
                  accounts={accounts}
                  amount={
                    editedAmount[item.recurring.id] ??
                    String(item.recurring.amount)
                  }
                  accountId={
                    editedAccountId[item.recurring.id] ?? item.recurring.accountId
                  }
                  date={editedDate[item.recurring.id] ?? item.recurring.dueDate}
                  onAmountChange={value => setAmount(item.recurring.id, value)}
                  onAccountIdChange={value =>
                    setAccountId(item.recurring.id, value)
                  }
                  onDateChange={value => setDate(item.recurring.id, value)}
                  onSkip={() => handleSkip(item.recurring)}
                  onConfirm={() => handleConfirm(item.recurring)}
                />
              ) : (
                <PendingInstallmentCard
                  row={item.installment}
                  accounts={accounts}
                  accountId={accountIdFor(item.installment)}
                  date={dateFor(item.installment)}
                  onAccountIdChange={value =>
                    setInstallmentAccountId(current => ({
                      ...current,
                      [item.installment.id]: value,
                    }))
                  }
                  onDateChange={value =>
                    setInstallmentDate(current => ({
                      ...current,
                      [item.installment.id]: value,
                    }))
                  }
                  onSkip={() => handleSkipInstallment(item.installment)}
                  onPay={() => handlePayInstallment(item.installment)}
                />
              )
            }
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
