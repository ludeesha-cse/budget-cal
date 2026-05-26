import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Search, Trash2, Wallet } from 'lucide-react-native';
import ScreenBackground from '../components/ScreenBackground';
import type { HistoryStackParamList } from '../navigation/types';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from '../components/NumericInputAccessory';
import {
  deleteTransaction,
  deleteTransfer,
  getLoanPaymentsByMonth,
  getLoanPaymentsByYear,
  getTags,
  getTagsForTransaction,
  getTransactionsByMonth,
  getTransactionsByYear,
  getTransfers,
  getTransfersByYear,
  searchTransactions,
  updateTransfer,
} from '../db/queries';
import {
  getCurrentMonthString,
  getCurrentYearString,
} from '../utils/date';
import MonthYearPicker, { MONTH_OPTIONS } from '../components/MonthYearPicker';
import EmptyState from '../components/common/EmptyState';
import DateField from '../components/common/DateField';
import { useTheme } from '../contexts/ThemeContext';
import { typography, scaleFont } from '../theme/typography';

type TransactionRow = Awaited<ReturnType<typeof getTransactionsByMonth>>[number];
type LoanPaymentRow = Awaited<ReturnType<typeof getLoanPaymentsByMonth>>[number];
type TransferRow = Awaited<ReturnType<typeof getTransfers>>[number];
type TagRow = Awaited<ReturnType<typeof getTags>>[number];

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
// list ordered by date, most recent first — matches the mockup's
// "RECENT" list reading top-to-bottom from today backwards. None of the
// source queries sort on their own, so this is the only place ordering
// is ever decided.
function mergeHistoryRows(...sources: HistoryRow[][]): HistoryRow[] {
  const merged = sources.flat();
  merged.sort((a, b) => b.date.localeCompare(a.date));
  return merged;
}

const MONTH_ABBR: Record<string, string> = Object.fromEntries(
  MONTH_OPTIONS.map(m => [m.value, m.label.slice(0, 3).toUpperCase()]),
);

// Splits a 'YYYY-MM-DD' date into the day/month block the mockup's row
// layout uses ("07" / "AUG") — pure string slicing, no Date parsing
// needed since the stored format is already zero-padded.
function splitDateForRow(date: string): { day: string; month: string } {
  const [, month, day] = date.split('-');
  return { day, month: MONTH_ABBR[month] ?? month };
}

// Module-scope, not inline in the FlatList below — react/no-unstable-nested-components
// would otherwise flag a JSX-returning function declared during
// HistoryListScreen's render as a fresh component type on every render.
// Reads its own color from useTheme() rather than taking a prop, since
// ItemSeparatorComponent's own signature has no room to pass one through.
function RowSeparator(): React.JSX.Element {
  const { colors } = useTheme();
  return <View style={[styles.separator, { backgroundColor: colors.border }]} />;
}

type Props = NativeStackScreenProps<HistoryStackParamList, 'HistoryList'>;

function HistoryListScreen({ navigation }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const [month, setMonth] = useState(getCurrentMonthString().slice(5));
  const [year, setYear] = useState(getCurrentYearString());
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Stage 15: search + tags. searchQuery is what the TextInput shows;
  // debouncedQuery is what actually drives the query, updated ~300ms
  // after typing stops so a search doesn't refire on every keystroke.
  // Neither one, nor activeTagFilterIds, ever resets `month`/`year` —
  // that's what makes "clear the search" restore the previous month/year
  // selection for free, with no special-case code needed here.
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [availableTags, setAvailableTags] = useState<TagRow[]>([]);
  const [activeTagFilterIds, setActiveTagFilterIds] = useState<number[]>([]);
  // Populated for whichever transaction rows are currently on screen
  // (either the month/year view or search results) so each row can show
  // its own tags — loan payments and transfers never have an entry here,
  // since only real `transactions` rows can carry tags.
  const [tagsByTransactionId, setTagsByTransactionId] = useState<
    Record<number, TagRow[]>
  >({});

  // Search mode kicks in the moment there's something to search or
  // filter by — a non-empty query OR at least one active tag chip —
  // regardless of which one triggered it.
  const isSearchMode =
    debouncedQuery.trim().length > 0 || activeTagFilterIds.length > 0;

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  useFocusEffect(
    useCallback(() => {
      getTags().then(setAvailableTags);
    }, []),
  );

  // Editing a transfer's amount/date in place — from/to/currency stay
  // fixed to what the transfer was originally created with (changing
  // those would need the same cascading account/currency pickers
  // AccountsScreen's transfer modal already has; delete and recreate
  // covers that rarer case instead of duplicating that UI here).
  const [editTransferTarget, setEditTransferTarget] =
    useState<TransferRow | null>(null);
  const [editTransferAmount, setEditTransferAmount] = useState('');
  const [editTransferDate, setEditTransferDate] = useState('');

  // Loads each currently-displayed transaction's own tags in one batch —
  // small dataset (a personal tracker's month or search-result page), so
  // one query per transaction is simpler and plenty fast, matching the
  // "small table, don't over-engineer" convention used elsewhere in this
  // app (e.g. Stage 15's own tag-AND filtering in searchTransactions).
  const loadTagsForRows = async (historyRows: HistoryRow[]) => {
    const transactionRows = historyRows.filter(
      (row): row is Extract<HistoryRow, { kind: 'transaction' }> =>
        row.kind === 'transaction',
    );
    const entries = await Promise.all(
      transactionRows.map(
        async row =>
          [row.data.id, await getTagsForTransaction(row.data.id)] as const,
      ),
    );
    setTagsByTransactionId(Object.fromEntries(entries));
  };

  const load = useCallback(async () => {
    setLoading(true);

    if (isSearchMode) {
      // Search ignores month/year entirely, on purpose — see the Stage 15
      // spec: searchTransactions() always looks across every date. Loan
      // payments and transfers never appear here, since search only ever
      // queries `transactions`.
      const results = await searchTransactions({
        query: debouncedQuery.trim() || undefined,
        tagIds: activeTagFilterIds.length > 0 ? activeTagFilterIds : undefined,
      });
      const merged = results.map(
        (data): HistoryRow => ({ kind: 'transaction', date: data.date, data }),
      );
      setRows(merged);
      await loadTagsForRows(merged);
      setLoading(false);
      return;
    }

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
    await loadTagsForRows(merged);
    setLoading(false);
  }, [month, year, isSearchMode, debouncedQuery, activeTagFilterIds]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const toggleTagFilter = (tagId: number) => {
    setActiveTagFilterIds(current =>
      current.includes(tagId)
        ? current.filter(id => id !== tagId)
        : [...current, tagId],
    );
  };

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
    // HistoryList's native-stack header is hidden (see App.tsx) — top-only
    // safe area edge, same reasoning as DashboardScreen's own
    // ScreenBackground (used here too, instead of a plain SafeAreaView,
    // so a gradient palette like Platinum paints its sweep behind this
    // screen's content).
    <ScreenBackground colors={colors} edges={['top']}>
      <View style={styles.container}>
      <View style={styles.header}>
        <Text
          style={[typography.eyebrow, styles.eyebrow, { color: colors.primary }]}>
          {isSearchMode
            ? 'Search'
            : month
              ? `${MONTH_OPTIONS.find(m => m.value === month)?.label ?? ''} ${year}`.toUpperCase()
              : `All ${year}`}
        </Text>
        <Text style={[typography.screenTitle, { color: colors.text }]}>
          History
        </Text>
      </View>

      <View style={styles.searchArea}>
        <View
          style={[
            styles.searchInputRow,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}>
          <Search size={16} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search description, category, account..."
            placeholderTextColor={colors.textSecondary}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')}>
              <Text style={[styles.clearSearchText, { color: colors.primary }]}>
                Clear
              </Text>
            </Pressable>
          )}
        </View>

        <View style={styles.filterRow}>
          {!isSearchMode || activeTagFilterIds.length === 0 ? (
            <MonthYearPicker
              month={month}
              year={year}
              onMonthChange={setMonth}
              onYearChange={setYear}
              includeAllMonths
            />
          ) : null}
          {availableTags.map(tag => {
            const active = activeTagFilterIds.includes(tag.id);
            return (
              <Pressable
                key={tag.id}
                style={[
                  styles.tagChip,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  active && {
                    backgroundColor: colors.primary,
                    borderColor: colors.primary,
                  },
                ]}
                onPress={() => toggleTagFilter(tag.id)}>
                <Text
                  style={[
                    styles.tagChipText,
                    { color: colors.text },
                    active && { color: colors.primaryText },
                  ]}>
                  {tag.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text
        style={[
          typography.eyebrow,
          styles.recentLabel,
          { color: colors.textSecondary },
        ]}>
        {isSearchMode ? 'Results' : 'Recent'}
      </Text>

      {loading ? (
        <EmptyState message="Loading..." />
      ) : rows.length === 0 ? (
        <EmptyState message={isSearchMode ? 'No matches for your search.' : 'No transactions found.'} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={item => `${item.kind}-${item.data.id}`}
          style={styles.listCard}
          contentContainerStyle={[
            styles.listCardContent,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
          ItemSeparatorComponent={RowSeparator}
          renderItem={({ item }) => {
            const { day, month: monthAbbr } = splitDateForRow(item.data.date);

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
                <View style={styles.row}>
                  <View style={styles.dateBlock}>
                    <Text style={[styles.dateDay, { color: colors.text }]}>
                      {day}
                    </Text>
                    <Text
                      style={[
                        typography.eyebrow,
                        styles.dateMonth,
                        { color: colors.textSecondary },
                      ]}>
                      {monthAbbr}
                    </Text>
                  </View>
                  <View style={styles.rowDetails}>
                    <Text style={[styles.rowTitle, { color: colors.text }]}>
                      {isLiability ? 'Loan repayment' : 'Loan collection'}
                    </Text>
                    <View style={styles.badgeRow}>
                      <View
                        style={[styles.badge, { borderColor: colors.border }]}>
                        <Text
                          style={[
                            typography.eyebrow,
                            styles.badgeText,
                            { color: colors.textSecondary },
                          ]}>
                          {isLiability ? 'LIABILITY' : 'RECEIVABLE'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.accountRow}>
                      <Wallet size={11} color={colors.textSecondary} />
                      <Text
                        style={[
                          styles.accountRowText,
                          { color: colors.textSecondary },
                        ]}>
                        {fromName} → {toName}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[
                      typography.amountMono,
                      styles.amount,
                      { color: colors.primary },
                    ]}>
                    {loan.currencyCode} {loan.amount.toFixed(2)}
                  </Text>
                </View>
              );
            }

            if (item.kind === 'transfer') {
              const transfer = item.data;
              return (
                <Pressable
                  style={styles.row}
                  onPress={() => openEditTransfer(transfer)}>
                  <View style={styles.dateBlock}>
                    <Text style={[styles.dateDay, { color: colors.text }]}>
                      {day}
                    </Text>
                    <Text
                      style={[
                        typography.eyebrow,
                        styles.dateMonth,
                        { color: colors.textSecondary },
                      ]}>
                      {monthAbbr}
                    </Text>
                  </View>
                  <View style={styles.rowDetails}>
                    <Text style={[styles.rowTitle, { color: colors.text }]}>
                      Transfer — {transfer.fromAccountName} →{' '}
                      {transfer.toAccountName}
                    </Text>
                    <View style={styles.badgeRow}>
                      <View
                        style={[styles.badge, { borderColor: colors.border }]}>
                        <Text
                          style={[
                            typography.eyebrow,
                            styles.badgeText,
                            { color: colors.textSecondary },
                          ]}>
                          TRANSFER
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.rowActions}>
                    <Text
                      style={[
                        typography.amountMono,
                        styles.amount,
                        { color: colors.text },
                      ]}>
                      {transfer.currencyCode} {transfer.amount.toFixed(2)}
                    </Text>
                    <Pressable
                      hitSlop={8}
                      style={styles.deleteButton}
                      onPress={() => handleDeleteTransfer(transfer.id)}>
                      <Trash2 size={15} color={colors.danger} />
                    </Pressable>
                  </View>
                </Pressable>
              );
            }

            const item_ = item.data;
            const itemTags = tagsByTransactionId[item_.id] ?? [];
            const isIncome = item_.entryType === 'Income';
            return (
              <Pressable
                style={styles.row}
                onPress={() =>
                  navigation.navigate('EditTransaction', { id: item_.id })
                }>
                <View style={styles.dateBlock}>
                  <Text style={[styles.dateDay, { color: colors.text }]}>
                    {day}
                  </Text>
                  <Text
                    style={[
                      typography.eyebrow,
                      styles.dateMonth,
                      { color: colors.textSecondary },
                    ]}>
                    {monthAbbr}
                  </Text>
                </View>
                <View style={styles.rowDetails}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>
                    {item_.description ||
                      item_.categoryName ||
                      (isIncome ? 'Income' : 'Expense')}
                  </Text>
                  {(item_.categoryName || itemTags.length > 0) && (
                    <View style={styles.badgeRow}>
                      {item_.categoryName && (
                        <View
                          style={[styles.badge, { borderColor: colors.border }]}>
                          <Text
                            style={[
                              typography.eyebrow,
                              styles.badgeText,
                              { color: colors.textSecondary },
                            ]}>
                            {item_.categoryName}
                          </Text>
                        </View>
                      )}
                      {itemTags.map(tag => (
                        <View
                          key={tag.id}
                          style={[styles.badge, { borderColor: colors.border }]}>
                          <Text
                            style={[
                              typography.eyebrow,
                              styles.badgeText,
                              { color: colors.textSecondary },
                            ]}>
                            {tag.name}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {item_.accountName && (
                    <View style={styles.accountRow}>
                      <Wallet size={11} color={colors.textSecondary} />
                      <Text
                        style={[
                          styles.accountRowText,
                          { color: colors.textSecondary },
                        ]}>
                        {item_.accountName}
                      </Text>
                    </View>
                  )}
                  {item_.excludeFromBudget && (
                    <Text
                      style={[
                        styles.excludedText,
                        { color: colors.textSecondary },
                      ]}>
                      excluded from budget
                    </Text>
                  )}
                </View>
                <View style={styles.rowActions}>
                  <Text
                    style={[
                      typography.amountMono,
                      styles.amount,
                      { color: isIncome ? colors.success : colors.danger },
                    ]}>
                    {isIncome ? '+' : '-'}
                    {item_.amount.toFixed(2)}
                  </Text>
                  <Pressable
                    hitSlop={8}
                    style={styles.deleteButton}
                    onPress={() => handleDelete(item_.id)}>
                    <Trash2 size={15} color={colors.danger} />
                  </Pressable>
                </View>
              </Pressable>
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
                    <DateField value={editTransferDate} onChange={setEditTransferDate} />
                  </View>
                </View>

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
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    marginTop: 12,
    marginBottom: 16,
  },
  eyebrow: {
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
  },
  dateBlock: {
    width: 40,
    alignItems: 'flex-start',
    marginRight: 12,
  },
  dateDay: {
    fontSize: scaleFont(20),
    fontWeight: '700',
  },
  dateMonth: {
    marginTop: 1,
  },
  rowDetails: {
    flex: 1,
    paddingRight: 8,
  },
  rowTitle: {
    fontSize: scaleFont(15),
    fontWeight: '600',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  accountRowText: {
    fontSize: scaleFont(12),
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  badge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: scaleFont(9.5),
  },
  excludedText: {
    fontSize: scaleFont(11),
    fontStyle: 'italic',
    marginTop: 4,
  },
  rowActions: {
    alignItems: 'flex-end',
    gap: 6,
  },
  amount: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  deleteButton: {
    padding: 2,
  },
  listCard: {
    flex: 1,
  },
  listCardContent: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 14,
    // Well past the floating tab bar pill's own footprint (see App.tsx),
    // not just a card-to-card gap — otherwise the last few rows end up
    // scrollable-but-hidden behind the pill instead of clearing it.
    marginBottom: 116,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  searchArea: {
    gap: 10,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: scaleFont(15),
    padding: 0,
  },
  clearSearchText: {
    fontWeight: '600',
    fontSize: scaleFont(13),
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  tagChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tagChipText: {
    fontSize: scaleFont(14),
    fontWeight: '600',
  },
  recentLabel: {
    marginTop: 18,
    marginBottom: 8,
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
    fontSize: scaleFont(14),
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
  },
  modalHint: {
    fontSize: scaleFont(12),
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: scaleFont(16),
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
