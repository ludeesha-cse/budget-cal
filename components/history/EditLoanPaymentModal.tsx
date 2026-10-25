import React from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import BottomSheetModal from '../BottomSheetModal';
import CollapsiblePicker from '../CollapsiblePicker';
import FieldErrorText from '../common/FieldErrorText';
import DateField from '../common/DateField';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from '../NumericInputAccessory';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';
import { fieldErrorStyle } from '../../utils/formFieldStyle';
import { labelForId } from '../../utils/pickerLabels';
import { formatAmount } from '../../utils/formatAmount';
import type { UseEditLoanPaymentModalResult } from '../../hooks/useEditLoanPaymentModal';

type Props = {
  modal: UseEditLoanPaymentModalResult;
};

// Correcting a repayment or a collection. Amount, date and the real
// account the money moved through are all editable; which loan it was
// against is not — see useEditLoanPaymentModal for why.
function EditLoanPaymentModal({ modal }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { target: payment, values, error, counterpartAccounts } = modal;
  const isLiability = payment?.loanAccountType === 'Liability';

  return (
    <BottomSheetModal
      visible={payment != null}
      onClose={modal.close}
      onSave={modal.submit}
      canSave={modal.canSave}
      title={
        payment
          ? isLiability
            ? `Edit repayment — ${payment.counterpartyName ?? payment.loanAccountName}`
            : `Edit collection — ${payment.counterpartyName ?? payment.loanAccountName}`
          : undefined
      }
      saveLabel="Save changes">
      {payment && (
        <>
          {/* Says what a change here will actually do, because the
              consequence reaches further than the row being edited: the
              loan's outstanding balance moves by the difference, and a
              loan this payment had closed comes back open if the new
              amount no longer covers it. */}
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            {isLiability
              ? `Was ${formatAmount(payment.amount, payment.currencyCode)}. Lowering this puts the difference back into the account and adds it to what you still owe.`
              : `Was ${formatAmount(payment.amount, payment.currencyCode)}. Lowering this takes the difference back out of the account and adds it to what is still owed to you.`}
          </Text>

          <Text style={[styles.label, { color: colors.text }]}>
            Amount ({payment.currencyCode})
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

          <Text style={[styles.label, { color: colors.text }]}>
            {isLiability ? 'Paid from' : 'Received into'}
          </Text>
          <CollapsiblePicker
            displayLabel={labelForId(
              counterpartAccounts,
              values.counterpartAccountId,
              'name',
              'Select account',
            )}
            selectedValue={values.counterpartAccountId}
            onValueChange={modal.setCounterpartAccountId}
            items={counterpartAccounts.map(account => ({
              label: `${account.name} (${account.type})`,
              value: String(account.id),
            }))}
            label={isLiability ? 'Paid from' : 'Received into'}
            invalid={modal.isMissing('counterpartAccountId')}
          />
          <FieldErrorText message={modal.fieldMessage('account')} />

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

export default EditLoanPaymentModal;
