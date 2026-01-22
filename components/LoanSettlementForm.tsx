import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { formatDateString } from '../utils/date';
import {
  getAccounts,
  getActiveLoanAccounts,
  getLoanTotalOwed,
  settleLoan,
} from '../db/queries';
import type { LoanAccountType } from '../db/queries';
import CollapsiblePicker from './CollapsiblePicker';

// Explicit per this stage's spec for the two new Add-tab settlement
// forms — deliberately narrower than (and inconsistent with) the
// ['Bank','Cash','CryptoWallet'] used by LiabilitiesReceivablesScreen's
// own Settle modal, which predates this stage and wasn't asked to change.
const REAL_ACCOUNT_TYPES = ['Bank', 'Cash', 'CreditCard'];

type ActiveLoan = Awaited<ReturnType<typeof getActiveLoanAccounts>>[number];

type LoanSettlementFormProps = {
  type: LoanAccountType;
  // Called after a successful settleLoan() so the parent tab can show a
  // success message and this form can reset itself via a key change.
  onSettled: () => void;
};

// Shared by both the Liability Repayment and Receivable Income tabs —
// structurally identical (pick a loan account, pick a real account, pick
// an amount) with only the labels and which side is "the loan" swapped,
// so one parameterized form covers both rather than duplicating it twice.
function LoanSettlementForm({
  type,
  onSettled,
}: LoanSettlementFormProps): React.JSX.Element {
  const [loans, setLoans] = useState<ActiveLoan[]>([]);
  const [realAccounts, setRealAccounts] = useState<
    Awaited<ReturnType<typeof getAccounts>>
  >([]);
  const [loading, setLoading] = useState(true);
  const [loanAccountId, setLoanAccountId] = useState<number | null>(null);
  const [realAccountId, setRealAccountId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(formatDateString(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [description, setDescription] = useState('');
  const [totalOwed, setTotalOwed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [loanRows, accountRows] = await Promise.all([
      getActiveLoanAccounts(type),
      getAccounts(),
    ]);
    const eligibleRealAccounts = accountRows.filter(
      a => a.active && REAL_ACCOUNT_TYPES.includes(a.type),
    );
    setLoans(loanRows);
    setRealAccounts(eligibleRealAccounts);
    setLoanAccountId(current =>
      current != null && loanRows.some(l => l.accountId === current)
        ? current
        : (loanRows[0]?.accountId ?? null),
    );
    setRealAccountId(current =>
      current != null && eligibleRealAccounts.some(a => a.id === current)
        ? current
        : (eligibleRealAccounts[0]?.id ?? null),
    );
    setLoading(false);
  }, [type]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const selectedLoan = loans.find(l => l.accountId === loanAccountId) ?? null;

  // Live "total owed" for whichever loan is currently selected — same
  // getLoanTotalOwed call LiabilitiesReceivablesScreen uses, so the
  // payment amount can be judged against the real figure, not just the
  // stale principal.
  useEffect(() => {
    if (loanAccountId == null) {
      setTotalOwed(null);
      return;
    }
    let cancelled = false;
    getLoanTotalOwed(loanAccountId, formatDateString(new Date())).then(
      value => {
        if (!cancelled) {
          setTotalOwed(value);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [loanAccountId]);

  const handleDateChange = (
    _event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (selectedDate) {
      setDate(formatDateString(selectedDate));
    }
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
  };

  const handleSubmit = async () => {
    if (loanAccountId == null || !selectedLoan) {
      setError(
        type === 'Liability' ? 'Select a liability' : 'Select a receivable',
      );
      return;
    }
    const parsedAmount = Number(amount);
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a valid payment amount');
      return;
    }
    if (realAccountId == null) {
      setError('Select the account this payment moves through');
      return;
    }
    setError(null);
    try {
      // do-not-write-new-settlement-logic: this only assembles the
      // arguments and calls the existing Stage 9b function.
      await settleLoan({
        loanAccountId,
        counterpartAccountId: realAccountId,
        paymentAmount: parsedAmount,
        currencyId: selectedLoan.currencyId,
        date,
      });
      setAmount('');
      setDescription('');
      onSettled();
      load();
    } catch (submitError) {
      Alert.alert(
        'Could not settle',
        submitError instanceof Error
          ? submitError.message
          : String(submitError),
      );
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>Loading...</Text>
      </View>
    );
  }

  if (loans.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>
          {type === 'Liability'
            ? 'No active liabilities to repay.'
            : 'No active receivables collecting income.'}
        </Text>
      </View>
    );
  }

  const loanLabel = type === 'Liability' ? 'To (Liability)' : 'From (Receivable)';
  const realAccountLabel = type === 'Liability' ? 'Pay from' : 'Deposit into';

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>{loanLabel}</Text>
      <CollapsiblePicker
        displayLabel={selectedLoan?.counterpartyName ?? 'Select'}
        selectedValue={loanAccountId != null ? String(loanAccountId) : ''}
        onValueChange={value => setLoanAccountId(Number(value))}
        items={loans.map(l => ({
          label: l.counterpartyName,
          value: String(l.accountId),
        }))}
      />
      {selectedLoan && (
        <Text style={styles.hint}>
          Total owed today: {selectedLoan.currencyCode}{' '}
          {(totalOwed ?? selectedLoan.principal).toFixed(2)}
        </Text>
      )}

      <Text style={styles.label}>{realAccountLabel}</Text>
      <CollapsiblePicker
        displayLabel={
          realAccounts.find(a => a.id === realAccountId)?.name ??
          'Select account'
        }
        selectedValue={realAccountId != null ? String(realAccountId) : ''}
        onValueChange={value => setRealAccountId(Number(value))}
        items={realAccounts.map(a => ({
          label: `${a.name} (${a.type})`,
          value: String(a.id),
        }))}
      />

      <Text style={styles.label}>Amount</Text>
      <TextInput
        style={styles.input}
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
        placeholder="0.00"
      />

      <Text style={styles.label}>Date</Text>
      <Button title={date} onPress={() => setShowDatePicker(true)} />
      {Platform.OS === 'android' ? (
        showDatePicker && (
          <DateTimePicker
            value={new Date(date)}
            mode="date"
            display="default"
            onChange={handleDateChange}
          />
        )
      ) : (
        <Modal
          visible={showDatePicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowDatePicker(false)}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowDatePicker(false)}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <DateTimePicker
                value={new Date(date)}
                mode="date"
                display="spinner"
                onChange={handleDateChange}
              />
              <Button title="Done" onPress={() => setShowDatePicker(false)} />
            </Pressable>
          </Pressable>
        </Modal>
      )}

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={styles.input}
        value={description}
        onChangeText={setDescription}
        placeholder="Optional"
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Button title="Save" onPress={handleSubmit} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    padding: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 4,
  },
  hint: {
    fontSize: 13,
    color: '#555',
    marginTop: 4,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#999',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
  },
  error: {
    color: '#c0392b',
    marginTop: 12,
  },
  empty: {
    fontSize: 14,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32,
  },
});

export default LoanSettlementForm;
