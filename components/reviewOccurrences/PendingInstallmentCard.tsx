import React from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import CollapsiblePicker from '../CollapsiblePicker';
import DateField from '../common/DateField';
import type {
  getAccounts,
  PendingInstallmentOccurrenceRow,
} from '../../db/queries';
import { useTheme } from '../../contexts/ThemeContext';
import { getCurrentDateString } from '../../utils/date';
import { formatAmount } from '../../utils/formatAmount';
import { labelForId } from '../../utils/pickerLabels';

type AccountRow = Awaited<ReturnType<typeof getAccounts>>[number];

export interface PendingInstallmentCardProps {
  row: PendingInstallmentOccurrenceRow;
  accounts: AccountRow[];
  accountId: number | null;
  date: string;
  onAccountIdChange: (value: number) => void;
  onDateChange: (value: string) => void;
  onSkip: () => void;
  onPay: () => void;
}

// The installment half of the review list, deliberately shaped like
// PendingOccurrenceCard beside it — same card, same account picker, same
// date field, same Skip/act pair — so one list of two different kinds of
// thing still reads as one list.
//
// The one deliberate difference is that the amount is TEXT, not an input.
// A recurring rule's amount is a suggestion the user is meant to correct
// each month; an installment's is fixed by the plan's own schedule
// (monthlyAmount, or finalInstallmentAmount on the last one) and is
// computed by payInstallment itself. Offering an editable amount here
// would imply a choice that paying an installment does not actually
// have.
function PendingInstallmentCard({
  row,
  accounts,
  accountId,
  date,
  onAccountIdChange,
  onDateChange,
  onSkip,
  onPay,
}: PendingInstallmentCardProps): React.JSX.Element {
  const { colors } = useTheme();
  // labelForId already treats null as "nothing selected", so a plan on a
  // device with no usable account yet shows the placeholder rather than a
  // stray id.
  const accountLabel = labelForId(accounts, accountId, 'name', 'Select account');

  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.planName, { color: colors.text }]}>{row.planName}</Text>
      <Text style={{ color: colors.textSecondary }}>
        {/* payableInstallmentNumber, not the occurrence's own slot
            number: this is the installment payInstallment will actually
            record, and the two only differ on a plan that has had an
            occurrence skipped. See PendingInstallmentOccurrenceRow. */}
        Due {row.dueDate} — Installment {row.payableInstallmentNumber} of{' '}
        {row.numberOfMonths} — {row.categoryName}
      </Text>

      <Text style={[styles.label, { color: colors.text }]}>Amount</Text>
      <Text style={[styles.amountText, { color: colors.text }]}>
        {formatAmount(row.amount, row.currencyCode)}
      </Text>

      <Text style={[styles.label, { color: colors.text }]}>Account</Text>
      <CollapsiblePicker
        displayLabel={`${accountLabel} (${row.currencyCode})`}
        selectedValue={accountId == null ? '' : String(accountId)}
        onValueChange={value => onAccountIdChange(Number(value))}
        items={accounts.map(a => ({
          label: `${a.name} (${a.type})`,
          value: String(a.id),
        }))}
        label="Account"
      />

      <Text style={[styles.label, { color: colors.text }]}>Date</Text>
      {/* Capped at today — same reason as the pay sheet: this is the date
          the money actually moved, not the date it was scheduled for. */}
      <DateField
        value={date}
        onChange={onDateChange}
        maxDate={getCurrentDateString()}
      />

      <View style={styles.rowActions}>
        <Button title="Skip" color={colors.danger} onPress={onSkip} />
        <Button title="Pay" color={colors.primary} onPress={onPay} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  planName: {
    fontSize: 16,
    fontWeight: '600',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 4,
  },
  amountText: {
    fontSize: 16,
    fontWeight: '700',
  },
  rowActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
});

export default PendingInstallmentCard;
