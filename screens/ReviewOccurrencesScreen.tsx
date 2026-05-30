import React, { useCallback, useState } from 'react';
import {
  Alert,
  Button,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import CollapsiblePicker from '../components/CollapsiblePicker';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from '../components/NumericInputAccessory';
import EmptyState from '../components/common/EmptyState';
import DateField from '../components/common/DateField';
import {
  confirmOccurrence,
  getAccounts,
  getPendingOccurrences,
  skipOccurrence,
} from '../db/queries';
import { useTheme } from '../contexts/ThemeContext';
import { labelForId } from '../utils/pickerLabels';

// Same exclusion as every other posting flow (TransactionForm, IncomeForm,
// InstallmentPlansScreen's pay modal) — a Liability/Receivable account
// only ever moves through the loan flows. Matches payInstallment's own
// account picker: no currency filtering either, since confirmOccurrence
// always posts in the rule's fixed currencyId regardless of which
// account is chosen to pay through.
const NON_TRANSACTABLE_ACCOUNT_TYPES = ['Liability', 'Receivable'];

type PendingRow = Awaited<ReturnType<typeof getPendingOccurrences>>[number];
type AccountRow = Awaited<ReturnType<typeof getAccounts>>[number];

function ReviewOccurrencesScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Keyed by occurrence id — every row is independently editable, so a
  // single flat set of maps (rather than nesting edited values inside
  // `rows` itself) keeps typing in one row from re-deriving anything
  // about the others.
  const [editedAmount, setEditedAmount] = useState<Record<number, string>>({});
  const [editedAccountId, setEditedAccountId] = useState<Record<number, number>>({});
  const [editedDate, setEditedDate] = useState<Record<number, string>>({});

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
    // Seed the edit state with each rule's defaults, but only for
    // occurrences not already being edited — a background reload (e.g.
    // after confirming one row) must never clobber what's still being
    // typed into another.
    setEditedAmount(current => {
      const next = { ...current };
      for (const row of pending) {
        if (!(row.id in next)) {
          next[row.id] = String(row.amount);
        }
      }
      return next;
    });
    setEditedAccountId(current => {
      const next = { ...current };
      for (const row of pending) {
        if (!(row.id in next)) {
          next[row.id] = row.accountId;
        }
      }
      return next;
    });
    setEditedDate(current => {
      const next = { ...current };
      for (const row of pending) {
        if (!(row.id in next)) {
          next[row.id] = row.dueDate;
        }
      }
      return next;
    });
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const buildConfirmParams = (row: PendingRow) => {
    const amountText = editedAmount[row.id] ?? String(row.amount);
    const parsedAmount = Number(amountText);
    if (!amountText || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new Error(`Enter a valid amount for "${row.ruleName}".`);
    }
    const accountId = editedAccountId[row.id] ?? row.accountId;
    const date = editedDate[row.id] ?? row.dueDate;
    return { occurrenceId: row.id, amount: parsedAmount, accountId, date };
  };

  const handleConfirm = async (row: PendingRow) => {
    try {
      const params = buildConfirmParams(row);
      await confirmOccurrence(params);
      load();
    } catch (error) {
      Alert.alert(
        'Could not confirm',
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const handleSkip = (row: PendingRow) => {
    Alert.alert(
      'Skip this occurrence?',
      `No transaction will be created for "${row.ruleName}" (due ${row.dueDate}). This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip',
          style: 'destructive',
          onPress: async () => {
            try {
              await skipOccurrence(row.id);
              load();
            } catch (error) {
              Alert.alert(
                'Could not skip',
                error instanceof Error ? error.message : String(error),
              );
            }
          },
        },
      ],
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
        const params = buildConfirmParams(row);
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

  const accountLabel = (row: PendingRow) => {
    const id = editedAccountId[row.id] ?? row.accountId;
    return labelForId(accounts, id, 'name', 'Select account');
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
              <View
                style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.ruleName, { color: colors.text }]}>
                  {item.ruleName}
                </Text>
                <Text style={{ color: colors.textSecondary }}>
                  Due {item.dueDate} — {item.ruleType}
                  {item.ruleType === 'Expense' && item.categoryName
                    ? ` — ${item.categoryName}`
                    : ''}
                </Text>

                <Text style={[styles.label, { color: colors.text }]}>Amount</Text>
                <TextInput
                  style={[
                    styles.input,
                    { borderColor: colors.border, color: colors.text, backgroundColor: colors.background },
                  ]}
                  value={editedAmount[item.id] ?? String(item.amount)}
                  onChangeText={value =>
                    setEditedAmount(current => ({ ...current, [item.id]: value }))
                  }
                  keyboardType="numeric"
                  returnKeyType="done"
                  inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                />

                <Text style={[styles.label, { color: colors.text }]}>Account</Text>
                <CollapsiblePicker
                  displayLabel={`${accountLabel(item)} (${item.currencyCode})`}
                  selectedValue={String(editedAccountId[item.id] ?? item.accountId)}
                  onValueChange={value =>
                    setEditedAccountId(current => ({
                      ...current,
                      [item.id]: Number(value),
                    }))
                  }
                  items={accounts.map(a => ({
                    label: `${a.name} (${a.type})`,
                    value: String(a.id),
                  }))}
                />

                <Text style={[styles.label, { color: colors.text }]}>Date</Text>
                <DateField
                  value={editedDate[item.id] ?? item.dueDate}
                  onChange={date =>
                    setEditedDate(current => ({ ...current, [item.id]: date }))
                  }
                />

                <View style={styles.rowActions}>
                  <Button
                    title="Skip"
                    color={colors.danger}
                    onPress={() => handleSkip(item)}
                  />
                  <Button
                    title="Confirm"
                    color={colors.primary}
                    onPress={() => handleConfirm(item)}
                  />
                </View>
              </View>
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
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  ruleName: {
    fontSize: 16,
    fontWeight: '600',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
  },
  rowActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
});

export default ReviewOccurrencesScreen;
