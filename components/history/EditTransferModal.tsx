import React from 'react';
import {
  Button,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
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
// comment for why.
function EditTransferModal({ modal }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { target: transfer, values, error } = modal;

  return (
    <Modal visible={transfer != null} transparent animationType="fade" onRequestClose={modal.close}>
      <Pressable style={styles.modalBackdrop} onPress={() => Keyboard.dismiss()}>
        <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
          {transfer && (
            <>
              <Text style={[styles.label, { color: colors.text }]}>
                Edit transfer — {transfer.fromAccountName} → {transfer.toAccountName}
              </Text>
              <Text style={[styles.modalHint, { color: colors.textSecondary }]}>
                Accounts and currency ({transfer.currencyCode}) stay the same as the
                original transfer — delete and recreate it to change those.
              </Text>

              <Text style={[styles.label, { color: colors.text }]}>Amount</Text>
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

              <Text style={[styles.label, { color: colors.text }]}>Date</Text>
              <View style={styles.dateRow}>
                <View style={styles.dateButton}>
                  <DateField value={values.date} onChange={modal.setDate} />
                </View>
              </View>

              {error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}

              <View style={styles.formActions}>
                <Button title="Cancel" color={colors.primary} onPress={modal.close} />
                <Button title="Save" color={colors.primary} onPress={modal.submit} />
              </View>
              <NumericInputAccessory />
            </>
          )}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  error: {
    marginTop: 12,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
});

export default EditTransferModal;
