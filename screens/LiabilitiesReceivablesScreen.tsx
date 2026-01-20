import React, { useCallback, useState } from 'react';
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
import CollapsiblePicker from '../components/CollapsiblePicker';
import { formatDateString } from '../utils/date';
import {
  createLoanAccount,
  getAccounts,
  getActiveLoanAccounts,
  getCurrencies,
  getInactiveLoanAccounts,
  reactivateLoanAccount,
} from '../db/queries';
import type { LoanAccountType } from '../db/queries';

// Only these can fund a loan — you can't borrow into a Liability or lend
// out of another Receivable.
const COUNTERPART_ACCOUNT_TYPES = ['Bank', 'Cash', 'CryptoWallet'];

const INTEREST_PERIODS = ['monthly', 'annual'] as const;

type ActiveLoan = Awaited<ReturnType<typeof getActiveLoanAccounts>>[number];
type InactiveLoan = Awaited<ReturnType<typeof getInactiveLoanAccounts>>[number];
type CurrencyRow = Awaited<ReturnType<typeof getCurrencies>>[number];
type AccountRow = Awaited<ReturnType<typeof getAccounts>>[number];

// null = just the list; 'form' = the entry form.
type Step = null | 'form';

const TYPE_LABELS: Record<LoanAccountType, { heading: string; add: string }> = {
  Liability: { heading: 'Liabilities (borrowed)', add: 'Add Liability' },
  Receivable: { heading: 'Receivables (lended)', add: 'Add Lend' },
};

// Outstanding totals keyed by currency code. Deliberately a map rather
// than one number — currency amounts are never summed together anywhere
// in this app, so there's no such thing as a single "total liabilities".
function totalsByCurrency(rows: ActiveLoan[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    totals[row.currencyCode] = (totals[row.currencyCode] ?? 0) + row.currentBalance;
  }
  return totals;
}

function formatTotals(totals: Record<string, number>): string {
  const entries = Object.entries(totals).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    return 'None';
  }
  return entries
    .map(([code, amount]) => `${code} ${amount.toFixed(2)}`)
    .join(' · ');
}

function LiabilitiesReceivablesScreen(): React.JSX.Element {
  const [type, setType] = useState<LoanAccountType>('Liability');
  // Both types are loaded regardless of the toggle so the totals header
  // can show each side at once without a refetch when the toggle flips.
  const [activeLiabilities, setActiveLiabilities] = useState<ActiveLoan[]>([]);
  const [activeReceivables, setActiveReceivables] = useState<ActiveLoan[]>([]);
  const [inactiveLoans, setInactiveLoans] = useState<InactiveLoan[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState<Step>(null);
  // Set only by picking a closed account from the name suggestions, which
  // is also what routes submit to reactivateLoanAccount instead of
  // createLoanAccount.
  const [reuseAccountId, setReuseAccountId] = useState<number | null>(null);
  const [counterpartyName, setCounterpartyName] = useState('');
  const [principal, setPrincipal] = useState('');
  const [currencyId, setCurrencyId] = useState('');
  const [counterpartAccountId, setCounterpartAccountId] = useState('');
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [interestRate, setInterestRate] = useState('');
  const [interestPeriod, setInterestPeriod] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [liabilityRows, receivableRows, inactiveRows, currencyRows, accountRows] =
      await Promise.all([
        getActiveLoanAccounts('Liability'),
        getActiveLoanAccounts('Receivable'),
        getInactiveLoanAccounts(type),
        getCurrencies(),
        getAccounts(),
      ]);
    setActiveLiabilities(liabilityRows);
    setActiveReceivables(receivableRows);
    setInactiveLoans(inactiveRows);
    setCurrencies(currencyRows);
    setAccounts(accountRows);
    setLoading(false);
  }, [type]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const loans = type === 'Liability' ? activeLiabilities : activeReceivables;

  const counterpartAccounts = accounts.filter(
    a => a.active && COUNTERPART_ACCOUNT_TYPES.includes(a.type),
  );

  // Closed accounts of this type whose counterparty matches what's been
  // typed so far. Suppressed once one is picked, so the list doesn't sit
  // on top of the field after the choice is made.
  const nameSuggestions =
    reuseAccountId != null || !counterpartyName.trim()
      ? []
      : inactiveLoans.filter(loan =>
          loan.counterpartyName
            .toLowerCase()
            .includes(counterpartyName.trim().toLowerCase()),
        );

  const defaultCurrencyId = () => {
    const fallback = currencies.find(c => c.isDefault) ?? currencies[0];
    return String(fallback?.id ?? '');
  };

  const resetForm = () => {
    setReuseAccountId(null);
    setCounterpartyName('');
    setPrincipal('');
    setCurrencyId(defaultCurrencyId());
    setCounterpartAccountId(String(counterpartAccounts[0]?.id ?? ''));
    setDueDate(null);
    setInterestRate('');
    setInterestPeriod('');
    setError(null);
  };

  const handleAddPress = () => {
    resetForm();
    setStep('form');
  };

  // Editing the name away from a picked account drops back to "create
  // new" — otherwise the typed name and the reused account could silently
  // disagree about who this loan is with.
  const handleNameChange = (text: string) => {
    setCounterpartyName(text);
    if (reuseAccountId != null) {
      setReuseAccountId(null);
    }
  };

  const handlePickSuggestion = (loan: InactiveLoan) => {
    setCounterpartyName(loan.counterpartyName);
    setReuseAccountId(loan.accountId);
  };

  const handleCancel = () => {
    setStep(null);
    resetForm();
  };

  const handleDueDateChange = (
    _event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (selectedDate) {
      setDueDate(formatDateString(selectedDate));
    }
    if (Platform.OS === 'android') {
      setShowDueDatePicker(false);
    }
  };

  const handleSubmit = async () => {
    if (!counterpartyName.trim()) {
      setError('Enter a counterparty name');
      return;
    }
    const parsedPrincipal = Number(principal);
    if (!principal || Number.isNaN(parsedPrincipal) || parsedPrincipal <= 0) {
      setError('Enter a valid principal amount');
      return;
    }
    if (!currencyId) {
      setError('Select a currency');
      return;
    }
    if (!counterpartAccountId) {
      setError('Select the account this money moves through');
      return;
    }
    // Stored as rate × 100 so it stays an integer all the way down.
    let parsedRate: number | undefined;
    if (interestRate.trim()) {
      const rate = Number(interestRate);
      if (Number.isNaN(rate) || rate < 0) {
        setError('Enter a valid interest rate');
        return;
      }
      parsedRate = Math.round(rate * 100);
      if (!interestPeriod) {
        setError('Select an interest period');
        return;
      }
    }
    setError(null);

    const terms = {
      principal: parsedPrincipal,
      currencyId: Number(currencyId),
      counterpartAccountId: Number(counterpartAccountId),
      dueDate: dueDate ?? undefined,
      interestRate: parsedRate,
      interestPeriod: parsedRate
        ? (interestPeriod as 'monthly' | 'annual')
        : undefined,
    };

    try {
      if (reuseAccountId != null) {
        await reactivateLoanAccount({ accountId: reuseAccountId, ...terms });
      } else {
        await createLoanAccount({
          type,
          counterpartyName: counterpartyName.trim(),
          ...terms,
        });
      }
      setStep(null);
      resetForm();
      load();
    } catch (submitError) {
      Alert.alert(
        'Could not save',
        submitError instanceof Error
          ? submitError.message
          : String(submitError),
      );
    }
  };

  const currencyLabel = (id: string) => {
    const currency = currencies.find(c => String(c.id) === id);
    return currency ? `${currency.code} — ${currency.name}` : 'Select currency';
  };

  const counterpartLabel = (id: string) =>
    counterpartAccounts.find(a => String(a.id) === id)?.name ??
    'Select account';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.containerContent}
      keyboardShouldPersistTaps="handled">
      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Total liabilities</Text>
          <Text style={[styles.summaryValue, styles.owed]}>
            {formatTotals(totalsByCurrency(activeLiabilities))}
          </Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Total receivables</Text>
          <Text style={[styles.summaryValue, styles.owedToYou]}>
            {formatTotals(totalsByCurrency(activeReceivables))}
          </Text>
        </View>
      </View>

      <View style={styles.toggleRow}>
        {(['Liability', 'Receivable'] as const).map(option => (
          <Pressable
            key={option}
            style={[
              styles.toggleButton,
              type === option && styles.toggleButtonActive,
            ]}
            onPress={() => {
              setType(option);
              setStep(null);
            }}>
            <Text
              style={[
                styles.toggleButtonText,
                type === option && styles.toggleButtonTextActive,
              ]}>
              {option === 'Liability' ? 'Liabilities' : 'Receivables'}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.heading}>{TYPE_LABELS[type].heading}</Text>

      {step === null && (
        <>
          {loading ? (
            <Text style={styles.empty}>Loading...</Text>
          ) : loans.length === 0 ? (
            <Text style={styles.empty}>
              {type === 'Liability'
                ? 'Nothing borrowed right now.'
                : 'Nothing lended out right now.'}
            </Text>
          ) : (
            loans.map(loan => (
              <View
                key={`${loan.accountId}-${loan.currencyId}`}
                style={styles.loanRow}>
                <Text style={styles.loanName}>{loan.counterpartyName}</Text>
                <Text style={styles.loanDetail}>
                  Principal: {loan.currencyCode} {loan.principal.toFixed(2)}
                </Text>
                <Text style={styles.loanDetail}>
                  Outstanding: {loan.currencyCode}{' '}
                  {loan.currentBalance.toFixed(2)}
                </Text>
                <Text style={styles.loanDetail}>
                  Started {loan.dateCreated}
                  {loan.dueDate ? ` · due ${loan.dueDate}` : ''}
                </Text>
                {loan.interestRate != null && (
                  <Text style={styles.loanDetail}>
                    Interest: {(loan.interestRate / 100).toFixed(2)}%{' '}
                    {loan.interestPeriod ?? ''}
                  </Text>
                )}
              </View>
            ))
          )}
          <View style={styles.addButton}>
            <Button title={TYPE_LABELS[type].add} onPress={handleAddPress} />
          </View>
        </>
      )}

      {step === 'form' && (
        <View style={styles.form}>
          <Text style={styles.label}>Counterparty name</Text>
          <TextInput
            style={styles.input}
            value={counterpartyName}
            onChangeText={handleNameChange}
            placeholder={
              type === 'Liability' ? 'Borrowed from…' : 'Lended to…'
            }
          />
          {nameSuggestions.length > 0 && (
            <View style={styles.suggestions}>
              <Text style={styles.suggestionsHint}>
                Closed accounts matching this name — tap to reuse one:
              </Text>
              {nameSuggestions.map(loan => (
                <Pressable
                  key={loan.accountId}
                  style={styles.suggestionRow}
                  onPress={() => handlePickSuggestion(loan)}>
                  <Text style={styles.suggestionName}>
                    {loan.counterpartyName}
                  </Text>
                  <Text style={styles.loanDetail}>
                    Last opened {loan.dateCreated}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          {reuseAccountId != null && (
            <View style={styles.reuseBanner}>
              <Text style={styles.reuseBannerText}>
                Reopening the closed account for this counterparty.
              </Text>
              <Pressable onPress={() => setReuseAccountId(null)}>
                <Text style={styles.reuseBannerClear}>Create new instead</Text>
              </Pressable>
            </View>
          )}

          <Text style={styles.label}>Principal</Text>
          <TextInput
            style={styles.input}
            value={principal}
            onChangeText={setPrincipal}
            keyboardType="numeric"
            placeholder="0.00"
          />

          <Text style={styles.label}>Currency</Text>
          <CollapsiblePicker
            displayLabel={currencyLabel(currencyId)}
            selectedValue={currencyId}
            onValueChange={setCurrencyId}
            items={currencies.map(c => ({
              label: `${c.code} — ${c.name}`,
              value: String(c.id),
            }))}
          />

          <Text style={styles.label}>
            {type === 'Liability' ? 'Deposit into' : 'Paid from'}
          </Text>
          <CollapsiblePicker
            displayLabel={counterpartLabel(counterpartAccountId)}
            selectedValue={counterpartAccountId}
            onValueChange={setCounterpartAccountId}
            items={counterpartAccounts.map(a => ({
              label: `${a.name} (${a.type})`,
              value: String(a.id),
            }))}
          />

          <Text style={styles.label}>Due date (optional)</Text>
          <View style={styles.dueDateRow}>
            <View style={styles.dueDateButton}>
              <Button
                title={dueDate ?? 'Not set'}
                onPress={() => setShowDueDatePicker(true)}
              />
            </View>
            {dueDate && <Button title="Clear" onPress={() => setDueDate(null)} />}
          </View>
          {Platform.OS === 'android' ? (
            showDueDatePicker && (
              <DateTimePicker
                value={dueDate ? new Date(dueDate) : new Date()}
                mode="date"
                display="default"
                onChange={handleDueDateChange}
              />
            )
          ) : (
            <Modal
              visible={showDueDatePicker}
              transparent
              animationType="slide"
              onRequestClose={() => setShowDueDatePicker(false)}>
              <Pressable
                style={styles.modalBackdrop}
                onPress={() => setShowDueDatePicker(false)}>
                <Pressable style={styles.modalCard} onPress={() => {}}>
                  <DateTimePicker
                    value={dueDate ? new Date(dueDate) : new Date()}
                    mode="date"
                    display="spinner"
                    onChange={handleDueDateChange}
                  />
                  <Button
                    title="Done"
                    onPress={() => setShowDueDatePicker(false)}
                  />
                </Pressable>
              </Pressable>
            </Modal>
          )}

          <Text style={styles.label}>Interest rate % (optional)</Text>
          <TextInput
            style={styles.input}
            value={interestRate}
            onChangeText={setInterestRate}
            keyboardType="numeric"
            placeholder="e.g. 5.5"
          />

          {interestRate.trim().length > 0 && (
            <>
              <Text style={styles.label}>Interest period</Text>
              <CollapsiblePicker
                displayLabel={interestPeriod || 'Select period'}
                selectedValue={interestPeriod}
                onValueChange={setInterestPeriod}
                items={INTEREST_PERIODS.map(p => ({ label: p, value: p }))}
              />
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.formActions}>
            <Button title="Cancel" onPress={handleCancel} />
            <Button
              title={reuseAccountId != null ? 'Reopen' : 'Save'}
              onPress={handleSubmit}
            />
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  containerContent: {
    padding: 16,
  },
  summaryCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
    borderRadius: 8,
    backgroundColor: '#fafafa',
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 4,
  },
  owed: {
    color: '#c62828',
  },
  owedToYou: {
    color: '#2e7d32',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleButton: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#999',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  toggleButtonActive: {
    backgroundColor: '#1565c0',
    borderColor: '#1565c0',
  },
  toggleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1565c0',
  },
  toggleButtonTextActive: {
    color: '#fff',
  },
  heading: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  empty: {
    fontSize: 14,
    marginTop: 8,
  },
  addButton: {
    marginTop: 16,
  },
  loanRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  loanName: {
    fontSize: 16,
    fontWeight: '600',
  },
  loanDetail: {
    fontSize: 14,
    marginTop: 2,
    color: '#444',
  },
  form: {
    marginTop: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 4,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#999',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
  },
  suggestions: {
    marginTop: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#1565c0',
    borderRadius: 6,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  suggestionsHint: {
    fontSize: 12,
    color: '#666',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  suggestionRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
    marginTop: 6,
  },
  suggestionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1565c0',
  },
  reuseBanner: {
    marginTop: 8,
    padding: 10,
    borderRadius: 6,
    backgroundColor: '#e3f2fd',
  },
  reuseBannerText: {
    fontSize: 13,
    color: '#0d47a1',
  },
  reuseBannerClear: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1565c0',
    marginTop: 6,
  },
  dueDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dueDateButton: {
    flex: 1,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  error: {
    color: '#c0392b',
    marginTop: 12,
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

export default LiabilitiesReceivablesScreen;
