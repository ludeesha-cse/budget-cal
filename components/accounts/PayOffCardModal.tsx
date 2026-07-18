import React from 'react';
import { Text, TextInput, View } from 'react-native';
import BottomSheetModal from '../BottomSheetModal';
import CollapsiblePicker from '../CollapsiblePicker';
import DateField from '../common/DateField';
import EmptyState from '../common/EmptyState';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from '../NumericInputAccessory';
import { useTheme } from '../../contexts/ThemeContext';
import { fieldErrorStyle } from '../../utils/formFieldStyle';
import { formatAmount } from '../../utils/formatAmount';
import { labelForId } from '../../utils/pickerLabels';
import type { UsePayOffCardResult } from '../../hooks/usePayOffCard';
import { sharedFormStyles as styles } from './sharedFormStyles';

type Props = {
  state: UsePayOffCardResult;
};

// Separate from UpdateBalanceModal — a payoff moves real money out of a
// paying account via payOffCreditCard(), it doesn't just overwrite a
// stored number the way an audit correction does.
function PayOffCardModal({ state }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const {
    target,
    values,
    setAmount,
    setPayingAccountId,
    setDate,
    payOffPayingAccountOptions,
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
        target ? `Pay off ${target.accountName} (${target.currencyCode})` : undefined
      }
      saveLabel="Pay Off">
      {target && (
        <>
          <Text style={[styles.modalCurrent, { color: colors.danger }]}>
            Current debt: {formatAmount(target.currentDebt, target.currencyCode)}
          </Text>

          <Text style={[styles.label, { color: colors.text }]}>Pay from</Text>
          {payOffPayingAccountOptions.length === 0 ? (
            <EmptyState
              message={`No eligible Bank, Cash, or Crypto Wallet account with a balance in ${target.currencyCode} was found.`}
            />
          ) : (
            <CollapsiblePicker
              displayLabel={labelForId(
                payOffPayingAccountOptions,
                values.payingAccountId,
                'name',
                'Select account',
              )}
              selectedValue={values.payingAccountId}
              onValueChange={setPayingAccountId}
              items={payOffPayingAccountOptions.map(a => ({
                label: `${a.name} (${a.type})`,
                value: String(a.id),
              }))}
              label="Pay from"
              invalid={state.isMissing('payingAccountId')}
            />
          )}

          <Text style={[styles.label, { color: colors.text }]}>Amount</Text>
          <TextInput
            style={[
              styles.input,
              { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
              fieldErrorStyle(colors, state.isMissing('amount')),
            ]}
            value={values.amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            returnKeyType="done"
            inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
            placeholder="0.00"
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={[styles.label, { color: colors.text }]}>Date</Text>
          <View style={styles.payOffDateRow}>
            <View style={styles.dueDateButton}>
              <DateField value={values.date} onChange={setDate} />
            </View>
          </View>

          {error && (
            <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
          )}

          <NumericInputAccessory />
        </>
      )}
    </BottomSheetModal>
  );
}

export default PayOffCardModal;
