import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import BottomSheetModal from '../BottomSheetModal';
import DateField from '../common/DateField';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from '../NumericInputAccessory';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';
import type { UseEditTransferModalResult } from '../../hooks/useEditTransferModal';

type Props = {
  modal: UseEditTransferModalResult;
};

// Editing a transfer's amount/date in place. Accounts and currency stay
// fixed to the original transfer — see useEditTransferModal's own
// comment for why. Built on the same BottomSheetModal every other "add/
// edit X" popup in the app uses (this was previously its own ad hoc
// <Modal>/backdrop/card, the one leftover spot that hadn't been migrated
// onto it — see BottomSheetModal's own doc comment).
function EditTransferModal({ modal }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { target: transfer, values, error } = modal;

  return (
    <BottomSheetModal
      visible={transfer != null}
      onClose={modal.close}
      onSave={modal.submit}
      title={
        transfer
          ? `Edit transfer — ${transfer.fromAccountName} → ${transfer.toAccountName}`
          : undefined
      }>
      {transfer && (
        <>
          <Text style={[styles.modalHint, { color: colors.textSecondary }]}>
            {transfer.isCrossCurrency
              ? `Accounts and currencies (${transfer.currencyCode} → ${transfer.toCurrencyCode}) stay the same as the original transfer — delete and recreate it to change those.`
              : `Accounts and currency (${transfer.currencyCode}) stay the same as the original transfer — delete and recreate it to change those.`}
          </Text>

          <Text style={[styles.label, { color: colors.text }]}>
            {transfer.isCrossCurrency
              ? `Amount sent (${transfer.currencyCode})`
              : 'Amount'}
          </Text>
          <TextInput
            style={[
              styles.input,
              { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
            ]}
            value={values.amount}
            onChangeText={modal.setAmount}
            keyboardType="numeric"
            returnKeyType="done"
            inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
            placeholder="0.00"
            placeholderTextColor={colors.textSecondary}
          />

          {/* Both halves of a converted transfer are editable together.
              Changing only one would leave the two sides describing
              different amounts of money for the same event. */}
          {transfer.isCrossCurrency && (
            <>
              <Text style={[styles.label, { color: colors.text }]}>
                Amount received ({transfer.toCurrencyCode})
              </Text>
              <TextInput
                style={[
                  styles.input,
                  { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
                ]}
                value={values.convertedAmount}
                onChangeText={modal.setConvertedAmount}
                keyboardType="numeric"
                returnKeyType="done"
                inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
                placeholder="0.00"
                placeholderTextColor={colors.textSecondary}
              />
              {modal.rateHint && (
                <Text style={[styles.modalHint, { color: colors.textSecondary }]}>
                  {modal.rateHint}
                </Text>
              )}
            </>
          )}

          <Text style={[styles.label, { color: colors.text }]}>Date</Text>
          <View style={styles.dateRow}>
            <View style={styles.dateButton}>
              <DateField value={values.date} onChange={modal.setDate} />
            </View>
          </View>

          {error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}

          <NumericInputAccessory />
        </>
      )}
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
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
  error: {
    marginTop: 12,
  },
});

export default EditTransferModal;
