import React, { useCallback, useState } from 'react';
import {
  Alert,
  Button,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import type { HistoryStackParamList } from '../navigation/types';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from '../components/NumericInputAccessory';
import {
  deleteTransaction,
  deleteTransfer,
  getLoanPaymentsByMonth,
  getLoanPaymentsByYear,
  getTransactionsByMonth,
  getTransactionsByYear,
  getTransfers,
  getTransfersByYear,
  updateTransfer,
} from '../db/queries';
import {
  formatDateString,
  getCurrentMonthString,
  getCurrentYearString,
} from '../utils/date';
import MonthYearPicker from '../components/MonthYearPicker';
import { useTheme } from '../contexts/ThemeContext';

type TransactionRow = Awaited<ReturnType<typeof getTransactionsByMonth>>[number];
type LoanPaymentRow = Awaited<ReturnType<typeof getLoanPaymentsByMonth>>[number];
type TransferRow = Awaited<ReturnType<typeof getTransfers>>[number];

// A tagged union so one FlatList can render every kind of money-movement
// event side by side without any of their shapes leaking into each
// other. This is the general "merge non-transaction events into
// History" pattern: adding a future kind (credit_card_payoffs is the
// next candidate — the table exists as of Stage 10b but isn't merged in
// here yet) means adding its fetch call to load() below, mapping its
// rows to a new `{ kind: 'creditCardPayoff'; ... }` variant here, passing
// the mapped array into mergeHistoryRows alongside the others, and
// adding one render branch. mergeHistoryRows itself never needs to
// change — see its own comment.
type HistoryRow =
  | { kind: 'transaction'; date: string; data: TransactionRow }
  | { kind: 'loanPayment'; date: string; data: LoanPaymentRow }
  | { kind: 'transfer'; date: string; data: TransferRow };

// The one thing every money-movement kind needs from the merge: a flat
// list ordered by date. None of the source queries sort on their own, so
// this is the only place ordering is ever decided — accepts any number
// of already-mapped HistoryRow arrays, so a new kind never requires
// touching this function's logic, only adding another argument at the
// call site.
function mergeHistoryRows(...sources: HistoryRow[][]): HistoryRow[] {
  const merged = sources.flat();
  merged.sort((a, b) => a.date.localeCompare(b.date));
  return merged;
}

type Props = NativeStackScreenProps<HistoryStackParamList, 'HistoryList'>;

function HistoryListScreen({ navigation }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const [month, setMonth] = useState(getCurrentMonthString().slice(5));
  const [year, setYear] = useState(getCurrentYearString());
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Editing a transfer's amount/date in place — from/to/currency stay
  // fixed to what the transfer was originally created with (changing
  // those would need the same cascading account/currency pickers
  // AccountsScreen's transfer modal already has; delete and recreate
  // covers that rarer case instead of duplicating that UI here).
  const [editTransferTarget, setEditTransferTarget] =
    useState<TransferRow | null>(null);
  const [editTransferAmount, setEditTransferAmount] = useState('');
  const [editTransferDate, setEditTransferDate] = useState('');
  const [showEditTransferDatePicker, setShowEditTransferDatePicker] =
    useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [transactionRows, loanPaymentRows, transferRows] = month
      ? await Promise.all([
          getTransactionsByMonth(`${year}-${month}`),
          getLoanPaymentsByMonth(`${year}-${month}`),
          getTransfers(`${year}-${month}`),
        ])
      : await Promise.all([
          getTransactionsByYear(year),
          getLoanPaymentsByYear(year),
          getTransfersByYear(year),
        ]);
    const merged = mergeHistoryRows(
      transactionRows.map(
        (data): HistoryRow => ({ kind: 'transaction', date: data.date, data }),
      ),
      loanPaymentRows.map(
        (data): HistoryRow => ({ kind: 'loanPayment', date: data.date, data }),
      ),
      transferRows.map(
        (data): HistoryRow => ({ kind: 'transfer', date: data.date, data }),
      ),
    );
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

  const handleDeleteTransfer = (id: number) => {
    Alert.alert(
      'Delete transfer',
      'Delete this transfer? Both account balances will be reversed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTransfer(id);
              load();
            } catch (error) {
              Alert.alert(
                'Cannot delete transfer',
                error instanceof Error ? error.message : String(error),
              );
            }
          },
        },
      ],
    );
  };

  const openEditTransfer = (transfer: TransferRow) => {
    setEditTransferTarget(transfer);
    setEditTransferAmount(String(transfer.amount));
    setEditTransferDate(transfer.date);
    setShowEditTransferDatePicker(false);
  };

  const handleEditTransferDateChange = (
    _event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (selectedDate) {
      setEditTransferDate(formatDateString(selectedDate));
    }
    if (Platform.OS === 'android') {
      setShowEditTransferDatePicker(false);
    }
  };

  const handleEditTransferSubmit = async () => {
    if (!editTransferTarget) {
      return;
    }
    const parsedAmount = Number(editTransferAmount);
    if (!editTransferAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert(
        'Invalid amount',
        'Enter a transfer amount greater than zero.',
      );
      return;
    }
    try {
      // fromAccountId/toAccountId/currencyId are carried over unchanged
      // from the original transfer — updateTransfer still needs them to
      // reverse that exact original effect before applying the new one.
      await updateTransfer(editTransferTarget.id, {
        fromAccountId: editTransferTarget.fromAccountId,
        toAccountId: editTransferTarget.toAccountId,
        amount: parsedAmount,
        currencyId: editTransferTarget.currencyId,
        date: editTransferDate,
      });
      setEditTransferTarget(null);
      load();
    } catch (error) {
      Alert.alert(
        'Cannot update transfer',
        error instanceof Error ? error.message : String(error),
      );
    }
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

            if (item.kind === 'transfer') {
              const transfer = item.data;
              return (
                <View style={[styles.row, { borderBottomColor: colors.border }]}>
                  <View style={styles.rowDetails}>
                    <Text style={[styles.rowDate, { color: colors.text }]}>
                      {transfer.date}
                    </Text>
                    {/* "⇄" plus a plain-text label, deliberately distinct
                        from both the ± transaction amounts and the loan
                        payment row above — a transfer is neither spending
                        nor income, so it must not look like either one. */}
                    <Text style={{ color: colors.textSecondary }}>
                      ⇄ Transfer: {transfer.fromAccountName} →{' '}
                      {transfer.toAccountName}
                    </Text>
                    <Text style={[styles.rowAmount, { color: colors.text }]}>
                      {transfer.currencyCode} {transfer.amount.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.rowActions}>
                    <Button
                      title="Edit"
                      color={colors.primary}
                      onPress={() => openEditTransfer(transfer)}
                    />
                    <Button
                      title="Delete"
                      color={colors.danger}
                      onPress={() => handleDeleteTransfer(transfer.id)}
                    />
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

      <Modal
        visible={editTransferTarget != null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditTransferTarget(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => Keyboard.dismiss()}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            {editTransferTarget && (
              <>
                <Text style={[styles.label, { color: colors.text }]}>
                  Edit transfer — {editTransferTarget.fromAccountName} →{' '}
                  {editTransferTarget.toAccountName}
                </Text>
                <Text style={[styles.modalHint, { color: colors.textSecondary }]}>
                  Accounts and currency ({editTransferTarget.currencyCode}) stay
                  the same as the original transfer — delete and recreate it
                  to change those.
                </Text>

                <Text style={[styles.label, { color: colors.text }]}>
                  Amount
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
                  ]}
                  value={editTransferAmount}
                  onChangeText={setEditTransferAmount}
                  keyboardType="numeric"
                  returnKeyType="done"
                  inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                />

                <Text style={[styles.label, { color: colors.text }]}>Date</Text>
                <View style={styles.dateRow}>
                  <View style={styles.dateButton}>
                    <Button
                      title={editTransferDate}
                      color={colors.primary}
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowEditTransferDatePicker(true);
                      }}
                    />
                  </View>
                </View>
                {Platform.OS === 'android' ? (
                  showEditTransferDatePicker && (
                    <DateTimePicker
                      value={new Date(editTransferDate)}
                      mode="date"
                      display="default"
                      onChange={handleEditTransferDateChange}
                    />
                  )
                ) : (
                  <Modal
                    visible={showEditTransferDatePicker}
                    transparent
                    animationType="slide"
                    onRequestClose={() => setShowEditTransferDatePicker(false)}>
                    <Pressable
                      style={styles.modalBackdrop}
                      onPress={() => setShowEditTransferDatePicker(false)}>
                      <Pressable
                        style={[styles.modalCard, { backgroundColor: colors.surface }]}
                        onPress={() => {}}>
                        <DateTimePicker
                          value={new Date(editTransferDate)}
                          mode="date"
                          display="spinner"
                          onChange={handleEditTransferDateChange}
                        />
                        <Button
                          title="Done"
                          color={colors.primary}
                          onPress={() => setShowEditTransferDatePicker(false)}
                        />
                      </Pressable>
                    </Pressable>
                  </Modal>
                )}

                <View style={styles.formActions}>
                  <Button
                    title="Cancel"
                    color={colors.primary}
                    onPress={() => setEditTransferTarget(null)}
                  />
                  <Button
                    title="Save"
                    color={colors.primary}
                    onPress={handleEditTransferSubmit}
                  />
                </View>
                <NumericInputAccessory />
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      <NumericInputAccessory />
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
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
  },
  modalHint: {
    fontSize: 12,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
  },
  dateRow: {
    flexDirection: 'row',
    marginTop: 2,
  },
  dateButton: {
    flex: 1,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
});

export default HistoryListScreen;
