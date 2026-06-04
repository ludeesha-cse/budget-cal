import React from 'react';
import { Text, TextInput } from 'react-native';
import BottomSheetModal from '../BottomSheetModal';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from '../NumericInputAccessory';
import { useTheme } from '../../contexts/ThemeContext';
import { formatAmount } from '../../utils/formatAmount';
import type { UseUpdateBalanceResult } from '../../hooks/useUpdateBalance';
import { sharedFormStyles as styles } from './sharedFormStyles';

type Props = {
  state: UseUpdateBalanceResult;
};

// Same modal/handler pair regardless of what triggers it (month-start
// prompt or an anytime tap on a balance chip) — one code path calling
// updateAccountBalanceWithAudit, per the Stage 8 build order.
function UpdateBalanceModal({ state }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const {
    target,
    values,
    setNewValue,
    setDescription,
    error,
    canSave,
    close,
    submit,
  } = state;

  return (
    <BottomSheetModal
      visible={target != null}
      onClose={close}
      onSave={submit}
      canSave={canSave}
      title={
        target
          ? `Update balance — ${target.accountName} (${target.currencyCode})`
          : undefined
      }
      saveLabel="Save">
      {target && (
        <>
          <Text style={[styles.modalCurrent, { color: colors.textSecondary }]}>
            Current: {formatAmount(target.currentBalance, target.currencyCode)}
          </Text>

          <Text style={[styles.label, { color: colors.text }]}>
            New balance
          </Text>
          <TextInput
            style={[
              styles.input,
              { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
            ]}
            value={values.newValue}
            onChangeText={setNewValue}
            keyboardType="numeric"
            returnKeyType="done"
            inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
            placeholder="0.00"
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={[styles.label, { color: colors.text }]}>
            Description (required)
          </Text>
          <TextInput
            style={[
              styles.input,
              { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
            ]}
            value={values.description}
            onChangeText={setDescription}
            placeholder="Why is this balance being corrected?"
            placeholderTextColor={colors.textSecondary}
          />

          {error && (
            <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
          )}

          <NumericInputAccessory />
        </>
      )}
    </BottomSheetModal>
  );
}

export default UpdateBalanceModal;
