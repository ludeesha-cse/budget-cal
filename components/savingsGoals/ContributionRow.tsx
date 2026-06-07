import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import DateField from '../common/DateField';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from '../NumericInputAccessory';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';
import { formatAmount } from '../../utils/formatAmount';
import type { SavingsContributionRow } from '../../hooks/useContributionForm';

type Props = {
  contribution: SavingsContributionRow;
  currencyCode: string;
  isEditing: boolean;
  editAmount: string;
  onEditAmountChange: (value: string) => void;
  editDate: string;
  onEditDateChange: (value: string) => void;
  editNote: string;
  onEditNoteChange: (value: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onStartEdit: () => void;
  onDelete: () => void;
};

// One contribution row, either its plain display form or its inline edit
// form — only one row is ever being edited at a time (see
// useContributionForm's editingContributionId).
function ContributionRow({
  contribution,
  currencyCode,
  isEditing,
  editAmount,
  onEditAmountChange,
  editDate,
  onEditDateChange,
  editNote,
  onEditNoteChange,
  onCancelEdit,
  onSaveEdit,
  onStartEdit,
  onDelete,
}: Props): React.JSX.Element {
  const { colors } = useTheme();

  if (isEditing) {
    return (
      <View style={[styles.contributionRow, { borderTopColor: colors.border }]}>
        <TextInput
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.text, backgroundColor: colors.background },
          ]}
          value={editAmount}
          onChangeText={onEditAmountChange}
          keyboardType="numeric"
          returnKeyType="done"
          inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
          placeholder="Amount"
          placeholderTextColor={colors.textSecondary}
        />
        <DateField
          value={editDate}
          onChange={onEditDateChange}
          renderTrigger={(label, onPress) => (
            <Pressable style={[styles.smallPillButton, { borderColor: colors.border }]} onPress={onPress}>
              <Text style={[styles.smallPillButtonText, { color: colors.text }]}>{label}</Text>
            </Pressable>
          )}
        />
        <TextInput
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.text, backgroundColor: colors.background },
          ]}
          value={editNote}
          onChangeText={onEditNoteChange}
          placeholder="Note (optional)"
          placeholderTextColor={colors.textSecondary}
        />
        <View style={styles.rowActions}>
          <Pressable style={[styles.smallPillButton, { borderColor: colors.border }]} onPress={onCancelEdit}>
            <Text style={[styles.smallPillButtonText, { color: colors.text }]}>Cancel</Text>
          </Pressable>
          <Pressable style={[styles.smallPillButtonSolid, { backgroundColor: colors.primary }]} onPress={onSaveEdit}>
            <Text style={[styles.smallPillButtonText, { color: colors.primaryText }]}>Save</Text>
          </Pressable>
        </View>
        <NumericInputAccessory />
      </View>
    );
  }

  return (
    <View style={[styles.contributionRow, { borderTopColor: colors.border }]}>
      <Text style={{ color: colors.text }}>
        {contribution.date} — {formatAmount(contribution.amount, currencyCode)}
        {contribution.note ? ` — ${contribution.note}` : ''}
      </Text>
      <View style={styles.rowActions}>
        <Pressable style={[styles.smallPillButton, { borderColor: colors.border }]} onPress={onStartEdit}>
          <Text style={[styles.smallPillButtonText, { color: colors.text }]}>Edit</Text>
        </Pressable>
        <Pressable style={[styles.smallPillButton, { borderColor: colors.dangerSoft }]} onPress={onDelete}>
          <Text style={[styles.smallPillButtonText, { color: colors.danger }]}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contributionRow: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
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
    justifyContent: 'flex-start',
    gap: 8,
    marginTop: 4,
  },
  smallPillButton: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  smallPillButtonSolid: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  smallPillButtonText: {
    fontSize: scaleFont(12.5),
    fontWeight: '600',
  },
});

export default ContributionRow;
