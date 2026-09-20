import React from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import BottomSheetModal from '../BottomSheetModal';
import CollapsiblePicker from '../CollapsiblePicker';
import DateField from '../common/DateField';
import EmptyState from '../common/EmptyState';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from '../NumericInputAccessory';
import { useTheme } from '../../contexts/ThemeContext';
import { getCurrentDateString } from '../../utils/date';
import { formatAmount } from '../../utils/formatAmount';
import { labelForId } from '../../utils/pickerLabels';
import { fieldErrorStyle } from '../../utils/formFieldStyle';
import type { UseInstallmentPayResult } from '../../hooks/useInstallmentPay';
import type {
  InstallmentAccountRow,
  InstallmentPlanRow,
} from '../../hooks/useInstallmentPlansData';

type Props = {
  pay: UseInstallmentPayResult;
  activeAccounts: InstallmentAccountRow[];
  paidCountFor: (planId: number) => number;
  nextAmountDueFor: (plan: InstallmentPlanRow) => number | null;
};

// One sheet for both "Pay Next" and "Pay custom" — everything except the
// amount is the same question, so splitting them into two components
// would be two copies of the account picker and the date field kept in
// step by hand. `pay.isCustom` is the only branch.
function InstallmentPayModal({
  pay,
  activeAccounts,
  paidCountFor,
  nextAmountDueFor,
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  const {
    target,
    values,
    setAccountId,
    setDate,
    setAmount,
    isCustom,
    canSave,
    isMissing,
    close,
    submit,
  } = pay;

  return (
    <BottomSheetModal
      visible={target != null}
      onClose={close}
      onSave={submit}
      canSave={canSave}
      title={
        target
          ? `${isCustom ? 'Pay custom' : 'Pay'} installment ${
              paidCountFor(target.id) + 1
            } of ${target.numberOfMonths} — ${target.name}`
          : undefined
      }
      saveLabel="Pay">
      {target && (
        <>
          {isCustom ? (
            <>
              {/* Names the scheduled figure rather than hiding it: the
                  point of a custom payment is almost always that it
                  differs from this number, so it is the reference the
                  user is typing against. */}
              <Text style={[styles.modalHint, { color: colors.textSecondary }]}>
                Scheduled amount is{' '}
                {formatAmount(
                  nextAmountDueFor(target) ?? 0,
                  target.currencyCode,
                )}
                . Paying more clears the plan sooner; this still ticks off
                installment {paidCountFor(target.id) + 1}.
              </Text>
              <Text style={[styles.label, { color: colors.text }]}>
                Amount ({target.currencyCode})
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.surface,
                  },
                  fieldErrorStyle(colors, isMissing('amount')),
                ]}
                value={values.amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                returnKeyType="done"
                inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
                placeholder="0.00"
                placeholderTextColor={colors.textSecondary}
              />
            </>
          ) : (
            <Text style={[styles.modalHint, { color: colors.textSecondary }]}>
              Amount: {formatAmount(nextAmountDueFor(target) ?? 0, target.currencyCode)}
            </Text>
          )}

          <Text style={[styles.label, { color: colors.text }]}>Pay from</Text>
          {activeAccounts.length === 0 ? (
            <EmptyState message="No active accounts available." />
          ) : (
            <CollapsiblePicker
              displayLabel={labelForId(activeAccounts, values.accountId, 'name', 'Select account')}
              selectedValue={values.accountId}
              onValueChange={setAccountId}
              items={activeAccounts.map(a => ({
                label: `${a.name} (${a.type})`,
                value: String(a.id),
              }))}
              label="Pay from"
              invalid={isMissing('accountId')}
            />
          )}

          <Text style={[styles.label, { color: colors.text }]}>Date</Text>
          {/* Capped at today: this records money that has already left
              the account, so a future date would post a transaction the
              balance and budget figures cannot honestly reflect yet. */}
          <DateField
            value={values.date}
            onChange={setDate}
            maxDate={getCurrentDateString()}
          />

          <NumericInputAccessory />
        </>
      )}
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  modalHint: {
    fontSize: 14,
    marginBottom: 8,
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
});

export default InstallmentPayModal;
