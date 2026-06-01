import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRoute, RouteProp } from '@react-navigation/native';
import { Plus } from 'lucide-react-native';
import type { SettingsStackParamList } from '../navigation/types';
import Card from '../components/Card';
import BottomSheetModal from '../components/BottomSheetModal';
import CollapsiblePicker from '../components/CollapsiblePicker';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from '../components/NumericInputAccessory';
import EmptyState from '../components/common/EmptyState';
import SegmentedToggle, {
  type SegmentedToggleOption,
} from '../components/common/SegmentedToggle';
import DateField from '../components/common/DateField';
import { getCurrentDateString } from '../utils/date';
import { avatarColorsFor } from '../utils/avatarColor';
import { formatAmount } from '../utils/formatAmount';
import { defaultCurrencyId } from '../utils/currencyHelpers';
import { totalsByCurrency, formatCurrencyTotals } from '../utils/currencyTotals';
import { formatInterestRatePercent } from '../utils/interestCalculations';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { labelForId } from '../utils/pickerLabels';
import {
  createLoanAccount,
  getAccounts,
  getActiveAccountCountByType,
  getActiveLoanAccounts,
  getCurrencies,
  getInactiveLoanAccounts,
  getLoanTotalOwed,
  reactivateLoanAccount,
  settleLoan,
} from '../db/queries';
import type { LoanAccountType } from '../db/queries';
import { useEntitlement } from '../hooks/useEntitlement';
import { usePaywall } from '../contexts/PaywallContext';
import { canAddAccount } from '../utils/entitlementChecks';
import { useTheme } from '../contexts/ThemeContext';
import { scaleFont, typography } from '../theme/typography';

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

const LOAN_TYPE_OPTIONS: SegmentedToggleOption<LoanAccountType>[] = [
  { key: 'Liability', label: 'Liabilities' },
  { key: 'Receivable', label: 'Receivables' },
];

function LiabilitiesReceivablesScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const runAction = useAsyncAction();
  const { tier } = useEntitlement();
  const { openPaywall } = usePaywall();
  const route =
    useRoute<RouteProp<SettingsStackParamList, 'LiabilitiesReceivables'>>();
  const [type, setType] = useState<LoanAccountType>(
    route.params?.type ?? 'Liability',
  );

  // Reacts to the FAB's "Liability Repayment" / "Receivable Income"
  // shortcuts (App.tsx) navigating here with a fresh `type` param while
  // this screen is already mounted from an earlier visit — a plain
  // useState initializer only runs once, so without this the tab would
  // silently stay on whichever type it last showed instead of jumping to
  // the one the user just tapped.
  useEffect(() => {
    if (route.params?.type) {
      setType(route.params.type);
    }
  }, [route.params?.type]);
  // Both types are loaded regardless of the toggle so the totals header
  // can show each side at once without a refetch when the toggle flips.
  const [activeLiabilities, setActiveLiabilities] = useState<ActiveLoan[]>([]);
  const [activeReceivables, setActiveReceivables] = useState<ActiveLoan[]>([]);
  const [inactiveLoans, setInactiveLoans] = useState<InactiveLoan[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Live total owed (principal + accrued interest, computed fresh — never
  // stored) per active loan account, keyed by accountId. Fetched
  // alongside the loan lists themselves so the two can't visibly go out
  // of sync while loading.
  const [totalOwedByAccountId, setTotalOwedByAccountId] = useState<
    Record<number, number>
  >({});

  const [settleTarget, setSettleTarget] = useState<ActiveLoan | null>(null);
  const [settlePaymentAmount, setSettlePaymentAmount] = useState('');
  const [settleCounterpartAccountId, setSettleCounterpartAccountId] =
    useState('');
  const [settleError, setSettleError] = useState<string | null>(null);

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

    const today = getCurrentDateString();
    const allActiveLoans = [...liabilityRows, ...receivableRows];
    const totalOwedEntries = await Promise.all(
      allActiveLoans.map(
        async loan =>
          [loan.accountId, await getLoanTotalOwed(loan.accountId, today)] as const,
      ),
    );
    setTotalOwedByAccountId(Object.fromEntries(totalOwedEntries));

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

  // Every existing loan of this type — open or closed — whose
  // counterparty matches what's been typed so far. Showing the open ones
  // too (even though they can't be tapped to reuse) is what surfaces an
  // about-to-be-duplicated name before Save creates a second account for
  // the same person, rather than only warning about it after the fact.
  // Suppressed once a closed one is picked, so the list doesn't sit on
  // top of the field after the choice is made.
  const query = counterpartyName.trim().toLowerCase();
  const matchesQuery = (name: string) => name.toLowerCase().includes(query);
  const activeNameMatches =
    reuseAccountId != null || !query
      ? []
      : loans.filter(loan => matchesQuery(loan.counterpartyName));
  const inactiveNameMatches =
    reuseAccountId != null || !query
      ? []
      : inactiveLoans.filter(loan => matchesQuery(loan.counterpartyName));
  const hasNameMatches =
    activeNameMatches.length > 0 || inactiveNameMatches.length > 0;

  const resetForm = () => {
    setReuseAccountId(null);
    setCounterpartyName('');
    setPrincipal('');
    setCurrencyId(defaultCurrencyId(currencies));
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

    // Form is fully valid at this point (every field above already
    // checked out) — the paywall, if it appears, is the last thing
    // standing between the user and Save, never the first thing they
    // see just for opening this screen. Applies to both branches:
    // reactivating a closed loan account brings back an active
    // Liability/Receivable just as much as creating a new one does, so
    // it's gated the same way rather than treated as "editing existing
    // data" (which stays ungated everywhere else in this app).
    const performSubmit = async () => {
      await runAction(async () => {
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
        await load();
      }, 'Could not save');
    };

    const activeCountForType = await getActiveAccountCountByType(type);
    const check = canAddAccount(type, activeCountForType, tier);
    if (!check.allowed) {
      openPaywall({
        reason: check.reason ?? `${type} accounts require Premium.`,
        onPurchaseSuccess: performSubmit,
      });
      return;
    }
    await performSubmit();
  };

  const openSettle = (loan: ActiveLoan) => {
    setSettleTarget(loan);
    setSettlePaymentAmount('');
    setSettleCounterpartAccountId(String(counterpartAccounts[0]?.id ?? ''));
    setSettleError(null);
  };

  const closeSettle = () => {
    setSettleTarget(null);
    setSettleError(null);
  };

  const handleSettleSubmit = async () => {
    if (!settleTarget) {
      return;
    }
    const parsedAmount = Number(settlePaymentAmount);
    if (
      !settlePaymentAmount ||
      Number.isNaN(parsedAmount) ||
      parsedAmount <= 0
    ) {
      setSettleError('Enter a valid payment amount');
      return;
    }
    if (!settleCounterpartAccountId) {
      setSettleError('Select the account this payment moves through');
      return;
    }
    setSettleError(null);
    await runAction(async () => {
      await settleLoan({
        loanAccountId: settleTarget.accountId,
        counterpartAccountId: Number(settleCounterpartAccountId),
        paymentAmount: parsedAmount,
        currencyId: settleTarget.currencyId,
        date: getCurrentDateString(),
      });
      closeSettle();
      await load();
    }, 'Could not settle');
  };

  const currencyLabel = (id: string) =>
    labelForId(
      currencies.map(c => ({ ...c, displayLabel: `${c.code} — ${c.name}` })),
      id,
      'displayLabel',
      'Select currency',
    );

  const counterpartLabel = (id: string) =>
    labelForId(counterpartAccounts, id, 'name', 'Select account');

  // Mirrors handleSubmit's own validation, minus the paywall check (that
  // can only be resolved after tapping Save — it needs a DB round trip —
  // so it isn't part of "is the form fillable" the way the other fields
  // are).
  const formCanSave =
    counterpartyName.trim() !== '' &&
    principal.trim() !== '' &&
    !Number.isNaN(Number(principal)) &&
    Number(principal) > 0 &&
    currencyId !== '' &&
    counterpartAccountId !== '' &&
    (interestRate.trim() === '' ||
      (!Number.isNaN(Number(interestRate)) &&
        Number(interestRate) >= 0 &&
        interestPeriod !== ''));

  const settleCanSave =
    settlePaymentAmount.trim() !== '' &&
    !Number.isNaN(Number(settlePaymentAmount)) &&
    Number(settlePaymentAmount) > 0 &&
    settleCounterpartAccountId !== '';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.containerContent}
      keyboardShouldPersistTaps="handled">
      <Card colors={colors} style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text
            style={[typography.eyebrow, styles.summaryLabel, { color: colors.textSecondary }]}>
            TOTAL LIABILITIES
          </Text>
          <Text style={[typography.amountMono, styles.summaryValue, { color: colors.danger }]}>
            {formatCurrencyTotals(
              totalsByCurrency(activeLiabilities, row => row.currentBalance),
            )}
          </Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryItem}>
          <Text
            style={[typography.eyebrow, styles.summaryLabel, { color: colors.textSecondary }]}>
            TOTAL RECEIVABLES
          </Text>
          <Text style={[typography.amountMono, styles.summaryValue, { color: colors.success }]}>
            {formatCurrencyTotals(
              totalsByCurrency(activeReceivables, row => row.currentBalance),
            )}
          </Text>
        </View>
      </Card>

      <SegmentedToggle
        options={LOAN_TYPE_OPTIONS}
        value={type}
        onChange={option => {
          setType(option);
          setStep(null);
        }}
      />

      <Text style={[typography.cardTitle, styles.heading, { color: colors.text }]}>
        {TYPE_LABELS[type].heading}
      </Text>

      <Pressable
        style={[styles.addButton, { borderColor: colors.primary }]}
        onPress={handleAddPress}>
        <Plus size={16} color={colors.primary} strokeWidth={2.5} />
        <Text style={[styles.addButtonText, { color: colors.primary }]}>
          {TYPE_LABELS[type].add}
        </Text>
      </Pressable>

      {loading ? (
        <EmptyState message="Loading..." />
      ) : loans.length === 0 ? (
        <EmptyState message={type === 'Liability' ? 'Nothing borrowed right now.' : 'Nothing lended out right now.'} />
      ) : (
        loans.map((loan, index) => {
          const { bg, fg } = avatarColorsFor(index, colors.chart);
          return (
            <Card
              key={`${loan.accountId}-${loan.currencyId}`}
              colors={colors}
              style={styles.loanCard}>
              <View style={styles.loanHeader}>
                <View style={[styles.avatar, { backgroundColor: bg }]}>
                  <Text style={[styles.avatarText, { color: fg }]}>
                    {loan.counterpartyName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.loanHeaderText}>
                  <Text style={[styles.loanName, { color: colors.text }]} numberOfLines={1}>
                    {loan.counterpartyName}
                  </Text>
                  <Text style={[styles.loanDetail, { color: colors.textSecondary }]}>
                    Principal: {formatAmount(loan.principal, loan.currencyCode)}
                  </Text>
                </View>
              </View>

              {/* Live figure — principal plus interest accrued since
                  lastAccrualAnchorDate, recomputed on every load rather
                  than trusted from a stored column. */}
              <Text
                style={[
                  typography.amountMono,
                  styles.loanTotalOwed,
                  { color: type === 'Liability' ? colors.danger : colors.success },
                ]}>
                {formatAmount(totalOwedByAccountId[loan.accountId] ?? loan.principal, loan.currencyCode)}
              </Text>
              <Text style={[styles.loanDetail, { color: colors.textSecondary }]}>
                Started {loan.dateCreated}
                {loan.dueDate ? ` · due ${loan.dueDate}` : ''}
              </Text>
              {loan.interestRate != null && (
                <Text style={[styles.loanDetail, { color: colors.textSecondary }]}>
                  Interest: {formatInterestRatePercent(loan.interestRate, 2)}{' '}
                  {loan.interestPeriod ?? ''}
                </Text>
              )}

              <Pressable
                style={[styles.settlePillButton, { backgroundColor: colors.primary }]}
                onPress={() => openSettle(loan)}>
                <Text style={[styles.settlePillButtonText, { color: colors.primaryText }]}>
                  Settle / Pay Off
                </Text>
              </Pressable>
            </Card>
          );
        })
      )}

      <BottomSheetModal
        visible={step === 'form'}
        onClose={handleCancel}
        onSave={handleSubmit}
        canSave={formCanSave}
        title={TYPE_LABELS[type].add}
        saveLabel={reuseAccountId != null ? 'Reopen' : 'Save'}>
        <Text style={[styles.label, { color: colors.text }]}>
          Counterparty name
        </Text>
        <TextInput
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
          ]}
          value={counterpartyName}
          onChangeText={handleNameChange}
          placeholder={
            type === 'Liability' ? 'Borrowed from…' : 'Lended to…'
          }
          placeholderTextColor={colors.textSecondary}
        />
        {hasNameMatches && (
          <View
            style={[
              styles.suggestions,
              { borderColor: colors.primary, backgroundColor: colors.surface },
            ]}>
            <Text style={[styles.suggestionsHint, { color: colors.textSecondary }]}>
              Existing accounts matching this name:
            </Text>
            {activeNameMatches.map(loan => (
              <View
                key={`active-${loan.accountId}`}
                style={[styles.suggestionRowInactive, { borderTopColor: colors.border }]}>
                <Text style={[styles.suggestionName, { color: colors.primary }]}>
                  {loan.counterpartyName}
                </Text>
                <Text style={[styles.loanDetail, { color: colors.textSecondary }]}>
                  Already open · {formatAmount(loan.currentBalance, loan.currencyCode)} outstanding
                </Text>
              </View>
            ))}
            {inactiveNameMatches.map(loan => (
              <Pressable
                key={`inactive-${loan.accountId}`}
                style={[styles.suggestionRow, { borderTopColor: colors.border }]}
                onPress={() => handlePickSuggestion(loan)}>
                <Text style={[styles.suggestionName, { color: colors.primary }]}>
                  {loan.counterpartyName}
                </Text>
                <Text style={[styles.loanDetail, { color: colors.textSecondary }]}>
                  Closed · last opened {loan.dateCreated} · tap to reuse
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        {reuseAccountId != null && (
          <View style={[styles.reuseBanner, { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.primary }]}>
            <Text style={[styles.reuseBannerText, { color: colors.primary }]}>
              Reopening the closed account for this counterparty.
            </Text>
            <Pressable onPress={() => setReuseAccountId(null)}>
              <Text style={[styles.reuseBannerClear, { color: colors.primary }]}>
                Create new instead
              </Text>
            </Pressable>
          </View>
        )}

        <Text style={[styles.label, { color: colors.text }]}>Principal</Text>
        <TextInput
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
          ]}
          value={principal}
          onChangeText={setPrincipal}
          keyboardType="numeric"
          returnKeyType="done"
          inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
          placeholder="0.00"
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={[styles.label, { color: colors.text }]}>Currency</Text>
        <CollapsiblePicker
          displayLabel={currencyLabel(currencyId)}
          selectedValue={currencyId}
          onValueChange={setCurrencyId}
          items={currencies.map(c => ({
            label: `${c.code} — ${c.name}`,
            value: String(c.id),
          }))}
        />

        <Text style={[styles.label, { color: colors.text }]}>
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

        <Text style={[styles.label, { color: colors.text }]}>
          Due date (optional)
        </Text>
        <View style={styles.dueDateRow}>
          <View style={styles.dueDateButton}>
            <DateField value={dueDate} onChange={setDueDate} placeholder="Not set" />
          </View>
          {dueDate && (
            <Button
              title="Clear"
              color={colors.primary}
              onPress={() => setDueDate(null)}
            />
          )}
        </View>

        <Text style={[styles.label, { color: colors.text }]}>
          Interest rate % (optional)
        </Text>
        <TextInput
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
          ]}
          value={interestRate}
          onChangeText={setInterestRate}
          keyboardType="numeric"
          returnKeyType="done"
          inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
          placeholder="e.g. 5.5"
          placeholderTextColor={colors.textSecondary}
        />

        {interestRate.trim().length > 0 && (
          <>
            <Text style={[styles.label, { color: colors.text }]}>
              Interest period
            </Text>
            <CollapsiblePicker
              displayLabel={interestPeriod || 'Select period'}
              selectedValue={interestPeriod}
              onValueChange={setInterestPeriod}
              items={INTEREST_PERIODS.map(p => ({ label: p, value: p }))}
            />
          </>
        )}

        {error && (
          <Text style={[styles.error, { color: colors.danger }]}>
            {error}
          </Text>
        )}

        <NumericInputAccessory />
      </BottomSheetModal>

      <BottomSheetModal
        visible={settleTarget != null}
        onClose={closeSettle}
        onSave={handleSettleSubmit}
        canSave={settleCanSave}
        title={settleTarget ? `Settle — ${settleTarget.counterpartyName}` : undefined}
        saveLabel="Save">
        {settleTarget && (
          <>
            <Text style={[styles.modalCurrent, { color: colors.textSecondary }]}>
              Total owed today: {formatAmount(
                totalOwedByAccountId[settleTarget.accountId] ??
                  settleTarget.principal,
                settleTarget.currencyCode,
              )}
            </Text>

            <Text style={[styles.label, { color: colors.text }]}>
              Payment amount
            </Text>
            <TextInput
              style={[
                styles.input,
                { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
              ]}
              value={settlePaymentAmount}
              onChangeText={setSettlePaymentAmount}
              keyboardType="numeric"
              returnKeyType="done"
              inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
            />
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              A payment equal to or greater than the total owed pays
              this loan off in full and closes the account.
            </Text>

            {/* settleTarget is always drawn from `loans`, i.e. whichever
                of the two active-loan lists matches the current tab —
                so the tab's type is the loan's type too. */}
            <Text style={[styles.label, { color: colors.text }]}>
              {type === 'Receivable' ? 'Deposit into' : 'Pay from'}
            </Text>
            <CollapsiblePicker
              displayLabel={counterpartLabel(settleCounterpartAccountId)}
              selectedValue={settleCounterpartAccountId}
              onValueChange={setSettleCounterpartAccountId}
              items={counterpartAccounts.map(a => ({
                label: `${a.name} (${a.type})`,
                value: String(a.id),
              }))}
            />

            {settleError && (
              <Text style={[styles.error, { color: colors.danger }]}>
                {settleError}
              </Text>
            )}
            <NumericInputAccessory />
          </>
        )}
      </BottomSheetModal>

      <NumericInputAccessory />
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
    alignItems: 'center',
    padding: 14,
    marginBottom: 16,
  },
  summaryItem: {
    flex: 1,
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginHorizontal: 12,
  },
  summaryLabel: {
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: scaleFont(15),
  },
  heading: {
    marginTop: 20,
    marginBottom: 10,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  addButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  loanCard: {
    padding: 14,
    marginBottom: 10,
  },
  loanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  loanHeaderText: {
    flex: 1,
  },
  loanName: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  loanDetail: {
    fontSize: scaleFont(12.5),
    marginTop: 2,
  },
  loanTotalOwed: {
    fontSize: scaleFont(20),
    marginTop: 10,
  },
  settlePillButton: {
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  settlePillButtonText: {
    fontSize: scaleFont(13.5),
    fontWeight: '700',
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
  suggestions: {
    marginTop: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    overflow: 'hidden',
  },
  suggestionsHint: {
    fontSize: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  suggestionRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 6,
  },
  suggestionRowInactive: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 6,
    opacity: 0.6,
  },
  suggestionName: {
    fontSize: 16,
    fontWeight: '600',
  },
  reuseBanner: {
    marginTop: 8,
    padding: 10,
    borderRadius: 6,
  },
  reuseBannerText: {
    fontSize: 13,
  },
  reuseBannerClear: {
    fontSize: 13,
    fontWeight: '600',
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
  error: {
    marginTop: 12,
  },
  modalCurrent: {
    fontSize: 14,
    marginBottom: 4,
  },
  hint: {
    fontSize: 12,
    marginTop: 4,
  },
});

export default LiabilitiesReceivablesScreen;
