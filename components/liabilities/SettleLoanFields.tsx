import React from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import CollapsiblePicker from '../CollapsiblePicker';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from '../NumericInputAccessory';
import { useTheme } from '../../contexts/ThemeContext';
import { formatAmount } from '../../utils/formatAmount';
import { labelForId } from '../../utils/pickerLabels';
import type { LoanAccountType } from '../../db/queries';
import type { UseSettleLoanResult } from '../../hooks/useSettleLoan';
import type { LoanAccountRow } from '../../hooks/useLoanAccountsData';

type Props = {
  settle: UseSettleLoanResult;
  type: LoanAccountType;
  counterpartAccounts: LoanAccountRow[];
  // Same live totalOwedByAccountId map LoanCard reads from — passed
  // through rather than recomputed, so the settle sheet always shows the
  // exact figure the card itself is showing.
  totalOwedByAccountId: Record<string | number, number>;
};

// Only ever rendered while `settle.target` is set — the screen's
// BottomSheetModal already gates visibility on that.
function SettleLoanFields({
  settle,
  type,
  counterpartAccounts,
  totalOwedByAccountId,
}: Props): React.JSX.Element | null {
  const { colors } = useTheme();
  const { target, values, setPaymentAmount, setCounterpartAccountId, error } = settle;

  if (!target) {
    return null;
  }

  const totalOwed = totalOwedByAccountId[target.accountId] ?? target.principal;

  return (
    <>
      <Text style={[styles.modalCurrent, { color: colors.textSecondary }]}>
        Total owed today: {formatAmount(totalOwed, target.currencyCode)}
      </Text>

      <Text style={[styles.label, { color: colors.text }]}>Payment amount</Text>
      <TextInput
        style={[
          styles.input,
          { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
        ]}
        value={values.paymentAmount}
        onChangeText={setPaymentAmount}
        keyboardType="numeric"
        returnKeyType="done"
        inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
        placeholder="0.00"
        placeholderTextColor={colors.textSecondary}
      />
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        A payment equal to or greater than the total owed pays this loan
        off in full and closes the account.
      </Text>

      {/* target is always drawn from `loans`, i.e. whichever of the two
          active-loan lists matches the current tab — so the tab's type is
          the loan's type too. */}
      <Text style={[styles.label, { color: colors.text }]}>
        {type === 'Receivable' ? 'Deposit into' : 'Pay from'}
      </Text>
      <CollapsiblePicker
        displayLabel={labelForId(counterpartAccounts, values.counterpartAccountId, 'name', 'Select account')}
        selectedValue={values.counterpartAccountId}
        onValueChange={setCounterpartAccountId}
        items={counterpartAccounts.map(a => ({
          label: `${a.name} (${a.type})`,
          value: String(a.id),
        }))}
      />

      {error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}
      <NumericInputAccessory />
    </>
  );
}

const styles = StyleSheet.create({
  modalCurrent: {
    fontSize: 14,
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
  hint: {
    fontSize: 12,
    marginTop: 4,
  },
  error: {
    marginTop: 12,
  },
});

export default SettleLoanFields;
