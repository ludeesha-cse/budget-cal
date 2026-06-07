import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import DateField from '../common/DateField';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from '../NumericInputAccessory';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';

type Props = {
  amount: string;
  onAmountChange: (value: string) => void;
  date: string;
  onDateChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

// The inline "Add Contribution" mini-form — only ever rendered for one
// goal at a time (see useContributionForm's addingContributionFor).
function AddContributionForm({
  amount,
  onAmountChange,
  date,
  onDateChange,
  note,
  onNoteChange,
  onCancel,
  onSubmit,
}: Props): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <View style={styles.addContributionForm}>
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
      <Text style={[styles.label, { color: colors.text }]}>Date</Text>
      <DateField
        value={date}
        onChange={onDateChange}
        renderTrigger={(label, onPress) => (
          <Pressable style={[styles.smallPillButton, { borderColor: colors.border }]} onPress={onPress}>
            <Text style={[styles.smallPillButtonText, { color: colors.text }]}>{label}</Text>
          </Pressable>
        )}
      />
      <Text style={[styles.label, { color: colors.text }]}>Note (optional)</Text>
      <TextInput
        style={[
          styles.input,
          { borderColor: colors.border, color: colors.text, backgroundColor: colors.background },
        ]}
        value={note}
        onChangeText={onNoteChange}
        placeholder="e.g. Bonus"
        placeholderTextColor={colors.textSecondary}
      />
      <View style={styles.rowActions}>
        <Pressable style={[styles.smallPillButton, { borderColor: colors.border }]} onPress={onCancel}>
          <Text style={[styles.smallPillButtonText, { color: colors.text }]}>Cancel</Text>
        </Pressable>
        <Pressable style={[styles.smallPillButtonSolid, { backgroundColor: colors.primary }]} onPress={onSubmit}>
          <Text style={[styles.smallPillButtonText, { color: colors.primaryText }]}>Add</Text>
        </Pressable>
      </View>
      <NumericInputAccessory />
    </View>
  );
}

const styles = StyleSheet.create({
  addContributionForm: {
    marginTop: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
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

export default AddContributionForm;
