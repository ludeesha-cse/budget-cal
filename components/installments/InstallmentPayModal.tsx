import React from 'react';
import { StyleSheet, Text } from 'react-native';
import BottomSheetModal from '../BottomSheetModal';
import CollapsiblePicker from '../CollapsiblePicker';
import DateField from '../common/DateField';
import EmptyState from '../common/EmptyState';
import NumericInputAccessory from '../NumericInputAccessory';
import { useTheme } from '../../contexts/ThemeContext';
import { formatAmount } from '../../utils/formatAmount';
import { labelForId } from '../../utils/pickerLabels';
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

function InstallmentPayModal({
  pay,
  activeAccounts,
  paidCountFor,
  nextAmountDueFor,
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { target, values, setAccountId, setDate, canSave, close, submit } = pay;

  return (
    <BottomSheetModal
      visible={target != null}
      onClose={close}
      onSave={submit}
      canSave={canSave}
      title={
        target
          ? `Pay installment ${paidCountFor(target.id) + 1} of ${target.numberOfMonths} — ${target.name}`
          : undefined
      }
      saveLabel="Pay">
      {target && (
        <>
          <Text style={[styles.modalHint, { color: colors.textSecondary }]}>
            Amount: {formatAmount(nextAmountDueFor(target) ?? 0, target.currencyCode)}
          </Text>

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
            />
          )}

          <Text style={[styles.label, { color: colors.text }]}>Date</Text>
          <DateField value={values.date} onChange={setDate} />

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
});

export default InstallmentPayModal;
