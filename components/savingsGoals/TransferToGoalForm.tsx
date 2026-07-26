import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import CollapsiblePicker from '../CollapsiblePicker';
import DateField from '../common/DateField';
import EmptyState from '../common/EmptyState';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from '../NumericInputAccessory';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';
import { labelForId } from '../../utils/pickerLabels';
import { fieldErrorStyle } from '../../utils/formFieldStyle';
import type { UseSavingsTransferFormResult } from '../../hooks/useSavingsTransferForm';
import type { SavingsGoalRow } from '../../hooks/useSavingsGoalsData';

type Props = {
  goal: SavingsGoalRow;
  form: UseSavingsTransferFormResult;
};

// The body of the "Add money" bottom sheet. Moves real money from
// another account into the goal's own account and records the earmark in
// the same write — see createSavingsTransfer.
//
// NO BUTTONS OF ITS OWN. This used to be a mini-form expanded inside a
// goal card, so it carried its own Cancel / Transfer & Save pair. It now
// has exactly one host — the sheet on SavingsGoalsScreen — whose footer
// already calls form.close and form.submit, and two rows of buttons
// saying the same thing is worse than one.
//
// There is no currency picker: a goal's funding is always in the goal's
// own currency, and the source list is already filtered to accounts that
// hold it.
function TransferToGoalForm({ goal, form }: Props): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <View style={styles.form}>
      <Text style={[styles.label, { color: colors.text }]}>
        Transfer from
      </Text>
      {form.sourceOptions.length === 0 ? (
        <EmptyState
          message={`No other open account holds ${goal.currencyCode}. Add ${goal.currencyCode} to another account first, or convert some money into it.`}
        />
      ) : (
        <CollapsiblePicker
          displayLabel={labelForId(
            form.sourceOptions,
            form.fromAccountId,
            'name',
            'Select account',
          )}
          selectedValue={form.fromAccountId}
          onValueChange={form.setFromAccountId}
          items={form.sourceOptions.map(a => ({
            label: `${a.name} (${a.type})`,
            value: String(a.id),
          }))}
          label="Transfer from"
          invalid={form.isMissing('fromAccountId')}
        />
      )}

      {form.sourceBalanceText && (
        <Text style={[styles.balance, { color: colors.textSecondary }]}>
          {form.sourceBalanceText}
        </Text>
      )}

      <Text style={[styles.label, { color: colors.text }]}>
        Amount ({goal.currencyCode})
      </Text>
      <TextInput
        style={[
          styles.input,
          {
            borderColor: colors.border,
            color: colors.text,
            backgroundColor: colors.background,
          },
          fieldErrorStyle(colors, form.isMissing('amount')),
        ]}
        value={form.amount}
        onChangeText={form.setAmount}
        keyboardType="numeric"
        returnKeyType="done"
        inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
        placeholder="0.00"
        placeholderTextColor={colors.textSecondary}
      />

      <Text style={[styles.label, { color: colors.text }]}>Date</Text>
      <DateField
        value={form.date}
        onChange={form.setDate}
        renderTrigger={(label, onPress) => (
          <Pressable
            style={[styles.smallPillButton, { borderColor: colors.border }]}
            onPress={onPress}>
            <Text style={[styles.smallPillButtonText, { color: colors.text }]}>
              {label}
            </Text>
          </Pressable>
        )}
      />

      <Text style={[styles.note, { color: colors.textSecondary }]}>
        This moves the money into {goal.accountName ?? 'the goal account'} and
        records it in History as "{goal.name}".
      </Text>

      <NumericInputAccessory />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    gap: 2,
  },
  label: {
    fontSize: scaleFont(13),
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: scaleFont(16),
  },
  balance: {
    fontSize: scaleFont(12),
    marginTop: 4,
  },
  note: {
    fontSize: scaleFont(12),
    marginTop: 10,
    lineHeight: scaleFont(17),
  },
  smallPillButton: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  smallPillButtonText: {
    fontSize: scaleFont(12.5),
    fontWeight: '600',
  },
});

export default TransferToGoalForm;
