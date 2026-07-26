import React from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import BottomSheetModal from '../BottomSheetModal';
import DateField from '../common/DateField';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from '../NumericInputAccessory';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';
import { fieldErrorStyle } from '../../utils/formFieldStyle';
import type { UseEditContributionModalResult } from '../../hooks/useEditContributionModal';

type Props = {
  modal: UseEditContributionModalResult;
};

// Correcting how much went into a goal. The source and destination
// accounts stay as they were — this edits the transfer's amount and date,
// which is the correction people actually need; moving it to a different
// account is a different event, and removing it and adding it again says
// that more honestly than a form that quietly re-routes money.
function EditContributionModal({ modal }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { target, values, error } = modal;

  return (
    <BottomSheetModal
      visible={target != null}
      onClose={modal.close}
      onSave={modal.submit}
      canSave={modal.canSave}
      title={target ? `Edit contribution — ${target.goal.name}` : undefined}
      saveLabel="Save changes">
      {target && (
        <>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            This moves the transfer behind this entry, so{' '}
            {target.contribution.fromAccountName ?? 'the source account'} and{' '}
            {target.goal.accountName ?? 'the goal account'} both follow the new
            amount.
          </Text>

          <Text style={[styles.label, { color: colors.text }]}>
            Amount ({target.goal.currencyCode})
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: colors.border,
                color: colors.text,
                backgroundColor: colors.surface,
              },
              fieldErrorStyle(colors, modal.isMissing('amount')),
            ]}
            value={values.amount}
            onChangeText={modal.setAmount}
            keyboardType="numeric"
            returnKeyType="done"
            inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
            placeholder="0.00"
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={[styles.label, { color: colors.text }]}>Date</Text>
          <DateField value={values.date} onChange={modal.setDate} />

          {error && (
            <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
          )}
          <NumericInputAccessory />
        </>
      )}
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontSize: scaleFont(12.5),
    lineHeight: scaleFont(18),
    marginBottom: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 4,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
  },
  error: {
    marginTop: 12,
  },
});

export default EditContributionModal;
