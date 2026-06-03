import React from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';
import CollapsiblePicker from '../CollapsiblePicker';
import DateField from '../common/DateField';
import { NUMERIC_KEYBOARD_ACCESSORY_ID } from '../NumericInputAccessory';
import { getAccounts, getPendingOccurrences } from '../../db/queries';
import { useTheme } from '../../contexts/ThemeContext';
import { labelForId } from '../../utils/pickerLabels';

type PendingOccurrenceRow = Awaited<
  ReturnType<typeof getPendingOccurrences>
>[number];
type AccountRow = Awaited<ReturnType<typeof getAccounts>>[number];

export interface PendingOccurrenceCardProps {
  row: PendingOccurrenceRow;
  accounts: AccountRow[];
  amount: string;
  accountId: number;
  date: string;
  onAmountChange: (value: string) => void;
  onAccountIdChange: (value: number) => void;
  onDateChange: (value: string) => void;
  onSkip: () => void;
  onConfirm: () => void;
}

// One row's editable card in ReviewOccurrencesScreen's list — pulled out
// of that screen's renderItem so the screen itself only has to wire up
// per-row state and handlers, not lay out the card markup inline inside
// a FlatList prop.
function PendingOccurrenceCard({
  row,
  accounts,
  amount,
  accountId,
  date,
  onAmountChange,
  onAccountIdChange,
  onDateChange,
  onSkip,
  onConfirm,
}: PendingOccurrenceCardProps): React.JSX.Element {
  const { colors } = useTheme();
  const accountLabel = labelForId(accounts, accountId, 'name', 'Select account');

  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.ruleName, { color: colors.text }]}>
        {row.ruleName}
      </Text>
      <Text style={{ color: colors.textSecondary }}>
        Due {row.dueDate} — {row.ruleType}
        {row.ruleType === 'Expense' && row.categoryName
          ? ` — ${row.categoryName}`
          : ''}
      </Text>

      <Text style={[styles.label, { color: colors.text }]}>Amount</Text>
      <TextInput
        style={[
          styles.input,
          { borderColor: colors.border, color: colors.text, backgroundColor: colors.background },
        ]}
        value={amount}
        onChangeText={onAmountChange}
        keyboardType="numeric"
        returnKeyType="done"
        inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
        placeholder="0.00"
        placeholderTextColor={colors.textSecondary}
      />

      <Text style={[styles.label, { color: colors.text }]}>Account</Text>
      <CollapsiblePicker
        displayLabel={`${accountLabel} (${row.currencyCode})`}
        selectedValue={String(accountId)}
        onValueChange={value => onAccountIdChange(Number(value))}
        items={accounts.map(a => ({
          label: `${a.name} (${a.type})`,
          value: String(a.id),
        }))}
      />

      <Text style={[styles.label, { color: colors.text }]}>Date</Text>
      <DateField value={date} onChange={onDateChange} />

      <View style={styles.rowActions}>
        <Button title="Skip" color={colors.danger} onPress={onSkip} />
        <Button title="Confirm" color={colors.primary} onPress={onConfirm} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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

export default PendingOccurrenceCard;
