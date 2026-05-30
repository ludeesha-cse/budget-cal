import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CircleDollarSign, Pencil, Plus, Trash2 } from 'lucide-react-native';
import Card from '../components/Card';
import CollapsiblePicker from '../components/CollapsiblePicker';
import BottomSheetModal from '../components/BottomSheetModal';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from '../components/NumericInputAccessory';
import EmptyState from '../components/common/EmptyState';
import SegmentedToggle, {
  type SegmentedToggleOption,
} from '../components/common/SegmentedToggle';
import DateField from '../components/common/DateField';
import ProgressRing from '../components/common/ProgressRing';
import ProgressBar from '../components/common/ProgressBar';
import ActionButtons, {
  type ActionButtonItem,
} from '../components/common/ActionButtons';
import { scaleFont, typography } from '../theme/typography';
import {
  createInstallmentPlan,
  deleteInstallmentPlan,
  getAccounts,
  getCategories,
  getCurrencies,
  getInstallmentPayments,
  getInstallmentPlans,
  payInstallment,
  unpayInstallment,
  updateInstallmentPlan,
  type NewInstallmentPlanParams,
} from '../db/queries';
import {
  calculateFromMonthly,
  calculateFromPrincipal,
  type InstallmentSchedule,
} from '../utils/installmentMath';
import { useEntitlement } from '../hooks/useEntitlement';
import { usePaywall } from '../contexts/PaywallContext';
import { useTheme } from '../contexts/ThemeContext';
import { formatDateString } from '../utils/date';
import { ordinalSuffix } from '../utils/dateUtils';
import { formatAmount } from '../utils/formatAmount';
import type { SettingsStackParamList } from '../navigation/types';

type PlanRow = Awaited<ReturnType<typeof getInstallmentPlans>>[number];
type CategoryRow = Awaited<ReturnType<typeof getCategories>>[number];
type CurrencyRow = Awaited<ReturnType<typeof getCurrencies>>[number];
type PaymentRow = Awaited<ReturnType<typeof getInstallmentPayments>>[number];
type AccountRow = Awaited<ReturnType<typeof getAccounts>>[number];

type Mode = 'principal' | 'monthly';

const MODE_OPTIONS: SegmentedToggleOption<Mode>[] = [
  { key: 'principal', label: 'Principal + Rate' },
  { key: 'monthly', label: 'Fixed Monthly' },
];

type Props = NativeStackScreenProps<SettingsStackParamList, 'InstallmentPlans'>;

function InstallmentPlansScreen({ route, navigation }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { tier } = useEntitlement();
  const { openPaywall } = usePaywall();

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  // Keyed by plan id — fetched for every plan up front (plan counts are
  // small in a personal tracker) so "paid X of N", the next amount due,
  // and the remaining total can all be computed without a per-row async
  // call every render.
  const [paymentsByPlan, setPaymentsByPlan] = useState<
    Record<number, PaymentRow[]>
  >({});
  const [expandedPlanId, setExpandedPlanId] = useState<number | null>(null);

  const [payTarget, setPayTarget] = useState<PlanRow | null>(null);
  const [payAccountId, setPayAccountId] = useState('');
  const [payDate, setPayDate] = useState(formatDateString(new Date()));

  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>('principal');
  const [name, setName] = useState('');
  const [principalAmount, setPrincipalAmount] = useState('');
  // Entered as a plain percentage (e.g. "10" for 10%) — converted to the
  // stored ×100 integer convention only at submit time, same as
  // loan_details.interestRate elsewhere in the app.
  const [interestRatePercent, setInterestRatePercent] = useState('');
  const [monthlyAmountInput, setMonthlyAmountInput] = useState('');
  const [numberOfMonths, setNumberOfMonths] = useState('');
  // Plain text input, 1-31 — kept as a string (like every other numeric
  // field in this form) so an in-progress/empty entry never fights the
  // user's typing; parsed and range-checked only at submit time in
  // buildParams. Left blank means "no reminder" (dueDayOfMonth stays
  // null), same optional convention buildParams already uses for it.
  const [dueDayOfMonth, setDueDayOfMonth] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [currencyId, setCurrencyId] = useState('');
  const [startDate, setStartDate] = useState(formatDateString(new Date()));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [planRows, categoryRows, currencyRows, accountRows] =
      await Promise.all([
        getInstallmentPlans(),
        getCategories(),
        getCurrencies(),
        getAccounts(),
      ]);
    setPlans(planRows);
    setCategories(categoryRows);
    setCurrencies(currencyRows);
    setAccounts(accountRows);
    const paymentEntries = await Promise.all(
      planRows.map(
        async plan => [plan.id, await getInstallmentPayments(plan.id)] as const,
      ),
    );
    setPaymentsByPlan(Object.fromEntries(paymentEntries));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const defaultCurrencyId = () => {
    const defaultCurrency = currencies.find(c => c.isDefault);
    return String((defaultCurrency ?? currencies[0])?.id ?? '');
  };

  const categoryLabel = (id: string) =>
    categories.find(c => String(c.id) === id)?.name ?? 'Select category';
  const currencyLabel = (id: string) => {
    const currency = currencies.find(c => String(c.id) === id);
    return currency ? `${currency.code} — ${currency.name}` : 'Select currency';
  };
  const currencyCodeFor = (id: string) =>
    currencies.find(c => String(c.id) === id)?.code ?? '';

  const resetForm = () => {
    setEditingId(null);
    setMode('principal');
    setName('');
    setPrincipalAmount('');
    setInterestRatePercent('');
    setMonthlyAmountInput('');
    setNumberOfMonths('');
    setDueDayOfMonth('');
    setCategoryId(categories[0] ? String(categories[0].id) : '');
    setCurrencyId(defaultCurrencyId());
    setStartDate(formatDateString(new Date()));
    setError(null);
  };

  const handleAddPress = () => {
    resetForm();
    setFormVisible(true);
  };

  const handleEditPress = (plan: PlanRow) => {
    setEditingId(plan.id);
    setMode(plan.principalAmount != null ? 'principal' : 'monthly');
    setName(plan.name);
    setPrincipalAmount(
      plan.principalAmount != null ? String(plan.principalAmount) : '',
    );
    setInterestRatePercent(
      plan.interestRate != null ? String(plan.interestRate / 100) : '',
    );
    setMonthlyAmountInput(
      plan.principalAmount == null ? String(plan.monthlyAmount) : '',
    );
    setNumberOfMonths(String(plan.numberOfMonths));
    setDueDayOfMonth(
      plan.dueDayOfMonth != null ? String(plan.dueDayOfMonth) : '',
    );
    setCategoryId(String(plan.categoryId));
    setCurrencyId(String(plan.currencyId));
    setStartDate(plan.startDate);
    setError(null);
    setFormVisible(true);
  };

  // Live preview only — same math the DB layer runs, computed here purely
  // client-side so the user sees the schedule before committing to
  // anything. Returns null (rather than throwing) for any incomplete or
  // invalid input, since this runs on every keystroke.
  const parsedMonths = Number(numberOfMonths);
  const monthsValid =
    numberOfMonths !== '' && Number.isInteger(parsedMonths) && parsedMonths > 0;
  let preview: InstallmentSchedule | null = null;
  if (monthsValid) {
    if (mode === 'principal') {
      const parsedPrincipal = Number(principalAmount);
      const parsedRatePercent = Number(interestRatePercent);
      if (
        principalAmount !== '' &&
        !Number.isNaN(parsedPrincipal) &&
        parsedPrincipal > 0 &&
        interestRatePercent !== '' &&
        !Number.isNaN(parsedRatePercent) &&
        parsedRatePercent >= 0
      ) {
        preview = calculateFromPrincipal(
          parsedPrincipal,
          Math.round(parsedRatePercent * 100),
          parsedMonths,
        );
      }
    } else {
      const parsedMonthly = Number(monthlyAmountInput);
      if (
        monthlyAmountInput !== '' &&
        !Number.isNaN(parsedMonthly) &&
        parsedMonthly > 0
      ) {
        preview = calculateFromMonthly(parsedMonthly, parsedMonths);
      }
    }
  }

  // Validates the whole form and builds the exact params the DB layer
  // expects, or returns null after setting a user-facing error — this is
  // the single gate both Create and Update funnel through, so the two
  // can never validate differently.
  const buildParams = (): NewInstallmentPlanParams | null => {
    if (!name.trim()) {
      setError('Enter a plan name');
      return null;
    }
    if (!monthsValid) {
      setError('Enter a whole number of months greater than zero');
      return null;
    }
    if (!categoryId) {
      setError('Select a category');
      return null;
    }
    if (!currencyId) {
      setError('Select a currency');
      return null;
    }
    let parsedDueDay: number | null = null;
    if (dueDayOfMonth !== '') {
      const candidate = Number(dueDayOfMonth);
      if (!Number.isInteger(candidate) || candidate < 1 || candidate > 31) {
        setError('Due date must be a day between 1 and 31, or left blank');
        return null;
      }
      parsedDueDay = candidate;
    }
    if (mode === 'principal') {
      const parsedPrincipal = Number(principalAmount);
      const parsedRatePercent = Number(interestRatePercent);
      if (
        !principalAmount ||
        Number.isNaN(parsedPrincipal) ||
        parsedPrincipal <= 0
      ) {
        setError('Enter a valid principal amount');
        return null;
      }
      if (
        interestRatePercent === '' ||
        Number.isNaN(parsedRatePercent) ||
        parsedRatePercent < 0
      ) {
        setError('Enter a valid interest rate');
        return null;
      }
      setError(null);
      return {
        mode: 'principal',
        name: name.trim(),
        principalAmount: parsedPrincipal,
        interestRate: Math.round(parsedRatePercent * 100),
        numberOfMonths: parsedMonths,
        categoryId: Number(categoryId),
        currencyId: Number(currencyId),
        startDate,
        dueDayOfMonth: parsedDueDay,
      };
    }
    const parsedMonthly = Number(monthlyAmountInput);
    if (!monthlyAmountInput || Number.isNaN(parsedMonthly) || parsedMonthly <= 0) {
      setError('Enter a valid monthly amount');
      return null;
    }
    setError(null);
    return {
      mode: 'monthly',
      name: name.trim(),
      monthlyAmount: parsedMonthly,
      numberOfMonths: parsedMonths,
      categoryId: Number(categoryId),
      currencyId: Number(currencyId),
      startDate,
      dueDayOfMonth: parsedDueDay,
    };
  };

  const handleSubmit = async () => {
    const params = buildParams();
    if (!params) {
      return;
    }

    if (editingId) {
      // Editing an existing plan is never gated — same standing rule as
      // AccountsScreen/CategoriesScreen/LiabilitiesReceivablesScreen:
      // entitlement only ever governs creating new items, not continuing
      // to use ones that already exist.
      try {
        await updateInstallmentPlan(editingId, params);
        setFormVisible(false);
        resetForm();
        load();
      } catch (err) {
        Alert.alert(
          'Cannot update plan',
          err instanceof Error ? err.message : String(err),
        );
      }
      return;
    }

    // Form is fully valid at this point — the paywall is the very last
    // thing standing between the user and Create, not the first thing
    // they see, per the Stage 12a end-of-flow gating rule.
    const performCreate = async () => {
      try {
        await createInstallmentPlan(params);
        setFormVisible(false);
        resetForm();
        load();
      } catch (err) {
        Alert.alert(
          'Cannot create plan',
          err instanceof Error ? err.message : String(err),
        );
      }
    };

    if (tier === 'free') {
      // Hide this screen's own form Modal before showing the paywall's —
      // on iOS, two native <Modal>s both visible at once (this form's and
      // PaywallModal's) never finishes presenting and the whole app
      // freezes solid, needing a force-quit to recover. Android tolerates
      // it, which is why this only ever showed up on iOS. onDismiss
      // brings the form back with everything still filled in if the user
      // backs out without buying — the fields themselves live in this
      // component's own state, untouched by the Modal being hidden.
      setFormVisible(false);
      openPaywall({
        reason: 'Installment plans require Premium.',
        onPurchaseSuccess: performCreate,
        onDismiss: () => setFormVisible(true),
      });
      return;
    }
    await performCreate();
  };

  const handleDelete = (id: number) => {
    Alert.alert(
      'Delete plan',
      'Delete this installment plan? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteInstallmentPlan(id);
              load();
            } catch (err) {
              Alert.alert(
                'Cannot delete plan',
                err instanceof Error ? err.message : String(err),
              );
            }
          },
        },
      ],
    );
  };

  // paidCount + 1 is always the next unpaid installment number: payInstallment
  // only ever pays getNextUnpaidInstallmentNumber's answer, and
  // unpayInstallment only ever removes the highest-numbered payment, so the
  // paid set is always exactly {1..paidCount} — a contiguous prefix, never
  // a gap. That invariant is what makes this safe to compute from the
  // payments array's length alone, without a second round trip to the
  // query layer just to display it.
  const paidCountFor = (planId: number) => (paymentsByPlan[planId] ?? []).length;

  const paidAmountFor = (planId: number) =>
    (paymentsByPlan[planId] ?? []).reduce((sum, payment) => sum + payment.amount, 0);

  const remainingFor = (plan: PlanRow) =>
    plan.totalRepayable - paidAmountFor(plan.id);

  const nextAmountDueFor = (plan: PlanRow): number | null => {
    const paidCount = paidCountFor(plan.id);
    if (paidCount >= plan.numberOfMonths) {
      return null;
    }
    const nextNumber = paidCount + 1;
    return nextNumber === plan.numberOfMonths
      ? plan.finalInstallmentAmount
      : plan.monthlyAmount;
  };

  const activeAccounts = accounts.filter(a => a.active);

  const openPayModal = (plan: PlanRow) => {
    setPayTarget(plan);
    setPayAccountId(activeAccounts[0] ? String(activeAccounts[0].id) : '');
    setPayDate(formatDateString(new Date()));
  };

  // Arriving here via Dashboard's installment reminder "Pay" button —
  // route.params.payPlanId is only ever set for that one navigation.
  // Waits for `plans` to actually contain the target (the list is still
  // loading on first render) before opening, and clears the param
  // immediately after so navigating back to this screen later — from the
  // tab bar, from "Add" — never reopens the same pay modal unexpectedly.
  useEffect(() => {
    const targetId = route.params?.payPlanId;
    if (targetId == null) {
      return;
    }
    const plan = plans.find(p => p.id === targetId);
    if (plan) {
      openPayModal(plan);
      navigation.setParams({ payPlanId: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, route.params?.payPlanId]);

  const handlePaySubmit = async () => {
    if (!payTarget) {
      return;
    }
    if (!payAccountId) {
      Alert.alert(
        'Select an account',
        'Choose which account is paying this installment.',
      );
      return;
    }
    try {
      await payInstallment({
        planId: payTarget.id,
        accountId: Number(payAccountId),
        date: payDate,
      });
      setPayTarget(null);
      load();
    } catch (err) {
      Alert.alert(
        'Cannot pay installment',
        err instanceof Error ? err.message : String(err),
      );
    }
  };

  const handleUndo = (payment: PaymentRow) => {
    Alert.alert(
      'Undo payment',
      `Undo installment ${payment.installmentNumber}? This deletes its transaction and restores the account balance.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Undo',
          style: 'destructive',
          onPress: async () => {
            try {
              await unpayInstallment(payment.id);
              load();
            } catch (err) {
              Alert.alert(
                'Cannot undo payment',
                err instanceof Error ? err.message : String(err),
              );
            }
          },
        },
      ],
    );
  };

  // Mirrors buildParams' own checks exactly (minus the actual number
  // parsing/rounding it does at submit time) so the Save button disables
  // the instant a required field goes empty or out of range, rather than
  // only failing after a tap — buildParams stays the single source of
  // truth for what "valid" means, this just previews its verdict.
  const dueDayValid =
    dueDayOfMonth === '' ||
    (Number.isInteger(Number(dueDayOfMonth)) &&
      Number(dueDayOfMonth) >= 1 &&
      Number(dueDayOfMonth) <= 31);
  const modeFieldsValid =
    mode === 'principal'
      ? principalAmount !== '' &&
        !Number.isNaN(Number(principalAmount)) &&
        Number(principalAmount) > 0 &&
        interestRatePercent !== '' &&
        !Number.isNaN(Number(interestRatePercent)) &&
        Number(interestRatePercent) >= 0
      : monthlyAmountInput !== '' &&
        !Number.isNaN(Number(monthlyAmountInput)) &&
        Number(monthlyAmountInput) > 0;
  const formCanSave =
    name.trim() !== '' &&
    monthsValid &&
    categoryId !== '' &&
    currencyId !== '' &&
    dueDayValid &&
    modeFieldsValid;
  const payCanSave = payAccountId !== '';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Pressable
        style={[styles.addButton, { borderColor: colors.primary }]}
        onPress={handleAddPress}>
        <Plus size={16} color={colors.primary} strokeWidth={2.5} />
        <Text style={[styles.addButtonText, { color: colors.primary }]}>
          Add Plan
        </Text>
      </Pressable>

      <FlatList
        data={plans}
        keyExtractor={item => String(item.id)}
        style={styles.list}
        renderItem={({ item }) => {
          const paidCount = paidCountFor(item.id);
          const isFullyPaid = paidCount >= item.numberOfMonths;
          const nextAmountDue = nextAmountDueFor(item);
          const remaining = remainingFor(item);
          const payments = paymentsByPlan[item.id] ?? [];
          const isExpanded = expandedPlanId === item.id;
          const percent = (paidCount / item.numberOfMonths) * 100;
          const ringColor = isFullyPaid ? colors.success : colors.primary;
          return (
            <Card colors={colors} style={styles.planCard}>
              <View style={styles.planHeader}>
                <ProgressRing
                  percent={percent}
                  size={52}
                  strokeWidth={5}
                  trackColor={colors.border}
                  fillColor={ringColor}
                  label={`${Math.round(percent)}%`}
                  labelColor={colors.text}
                />
                <View style={styles.planHeaderText}>
                  <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                    {item.categoryName} · {item.currencyCode}
                    {item.dueDayOfMonth != null &&
                      ` · Due ${item.dueDayOfMonth}${ordinalSuffix(item.dueDayOfMonth)}`}
                  </Text>
                  {isFullyPaid ? (
                    <Text style={[styles.fullyPaidText, { color: colors.success }]}>
                      ✓ Fully paid
                    </Text>
                  ) : (
                    <Text style={[typography.amountMono, styles.rowLine, { color: colors.text }]}>
                      Paid {paidCount} of {item.numberOfMonths} · Next{' '}
                      {formatAmount(nextAmountDue ?? 0, item.currencyCode)}
                    </Text>
                  )}
                </View>
              </View>

              <ProgressBar percent={percent} color={ringColor} style={styles.progressTrack} />
              <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                Remaining: {formatAmount(remaining, item.currencyCode)} of{' '}
                {formatAmount(item.totalRepayable, item.currencyCode, {
                  hideCode: true,
                })}
              </Text>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <ActionButtons
                style={styles.planActionsRow}
                items={(() => {
                  const buttons: ActionButtonItem[] = [];
                  if (!isFullyPaid) {
                    buttons.push({
                      key: 'pay',
                      icon: CircleDollarSign,
                      label: 'Pay Next',
                      solid: true,
                      grow: true,
                      onPress: () => openPayModal(item),
                    });
                  }
                  buttons.push(
                    { key: 'edit', icon: Pencil, label: 'Edit', onPress: () => handleEditPress(item) },
                    { key: 'delete', icon: Trash2, label: 'Delete', tone: 'danger', onPress: () => handleDelete(item.id) },
                  );
                  return buttons;
                })()}
              />

              <Pressable
                onPress={() => setExpandedPlanId(isExpanded ? null : item.id)}>
                <Text style={[styles.historyLink, { color: colors.primary }]}>
                  {isExpanded ? 'Hide history' : `History (${payments.length})`}
                </Text>
              </Pressable>

              {isExpanded && (
                <View style={styles.historyList}>
                  {payments.length === 0 ? (
                    <Text style={{ color: colors.textSecondary }}>
                      No payments yet.
                    </Text>
                  ) : (
                    payments.map((payment, index) => {
                      const isLatest = index === payments.length - 1;
                      return (
                        <View
                          key={payment.id}
                          style={[
                            styles.historyRow,
                            { borderBottomColor: colors.border },
                          ]}>
                          <Text style={[styles.historyRowText, { color: colors.text }]}>
                            #{payment.installmentNumber} — {payment.paidDate}{' '}
                            — {formatAmount(payment.amount, item.currencyCode)}{' '}
                            ({payment.accountName})
                          </Text>
                          {isLatest && (
                            <Pressable
                              style={[styles.undoButton, { borderColor: colors.danger }]}
                              onPress={() => handleUndo(payment)}>
                              <Text style={[styles.undoButtonText, { color: colors.danger }]}>
                                Undo
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      );
                    })
                  )}
                </View>
              )}
            </Card>
          );
        }}
        ListEmptyComponent={
          <EmptyState message="No installment plans yet." />
        }
      />

      <BottomSheetModal
        visible={formVisible}
        onClose={() => {
          setFormVisible(false);
          resetForm();
        }}
        onSave={handleSubmit}
        canSave={formCanSave}
        title={editingId ? 'Edit Plan' : 'New Installment Plan'}
        saveLabel={editingId ? 'Save' : 'Create'}>
                  <Text style={[styles.label, { color: colors.text }]}>
                    Name
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
                    ]}
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g. New Phone"
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={[styles.label, { color: colors.text }]}>
                    Mode
                  </Text>
                  <SegmentedToggle
                    options={MODE_OPTIONS}
                    value={mode}
                    onChange={setMode}
                  />

                  {mode === 'principal' ? (
                    <>
                      <Text style={[styles.label, { color: colors.text }]}>
                        Principal amount
                      </Text>
                      <TextInput
                        style={[
                          styles.input,
                          { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
                        ]}
                        value={principalAmount}
                        onChangeText={setPrincipalAmount}
                        keyboardType="numeric"
                        returnKeyType="done"
                        inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
                        placeholder="100000"
                        placeholderTextColor={colors.textSecondary}
                      />

                      <Text style={[styles.label, { color: colors.text }]}>
                        Interest rate (%)
                      </Text>
                      <TextInput
                        style={[
                          styles.input,
                          { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
                        ]}
                        value={interestRatePercent}
                        onChangeText={setInterestRatePercent}
                        keyboardType="numeric"
                        returnKeyType="done"
                        inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
                        placeholder="10"
                        placeholderTextColor={colors.textSecondary}
                      />
                    </>
                  ) : (
                    <>
                      <Text style={[styles.label, { color: colors.text }]}>
                        Monthly amount
                      </Text>
                      <TextInput
                        style={[
                          styles.input,
                          { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
                        ]}
                        value={monthlyAmountInput}
                        onChangeText={setMonthlyAmountInput}
                        keyboardType="numeric"
                        returnKeyType="done"
                        inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
                        placeholder="5000"
                        placeholderTextColor={colors.textSecondary}
                      />
                    </>
                  )}

                  <Text style={[styles.label, { color: colors.text }]}>
                    Number of months
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
                    ]}
                    value={numberOfMonths}
                    onChangeText={setNumberOfMonths}
                    keyboardType="numeric"
                    returnKeyType="done"
                    inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
                    placeholder="12"
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={[styles.label, { color: colors.text }]}>
                    Due date (day of month)
                  </Text>
                  <Text
                    style={[styles.fieldHint, { color: colors.textSecondary }]}>
                    Optional — e.g. 25 for the 25th of every month. When an
                    installment is due within a few days, it'll show as a
                    reminder on the Dashboard.
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
                    ]}
                    value={dueDayOfMonth}
                    onChangeText={setDueDayOfMonth}
                    keyboardType="numeric"
                    returnKeyType="done"
                    inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
                    placeholder="e.g. 25"
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={[styles.label, { color: colors.text }]}>
                    Category
                  </Text>
                  <CollapsiblePicker
                    displayLabel={
                      categoryId ? categoryLabel(categoryId) : 'Select category'
                    }
                    selectedValue={categoryId}
                    onValueChange={setCategoryId}
                    items={categories.map(c => ({
                      label: c.name,
                      value: String(c.id),
                    }))}
                  />

                  <Text style={[styles.label, { color: colors.text }]}>
                    Currency
                  </Text>
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
                    Start date
                  </Text>
                  <DateField value={startDate} onChange={setStartDate} />

                  {/* Live preview — the whole point of showing this is
                      letting the user see the real numbers before they
                      ever commit to anything, so it renders directly from
                      the same pure math the DB layer will run, not from
                      a stored/fetched value. */}
                  {preview && (
                    <View
                      style={[
                        styles.previewBox,
                        { backgroundColor: colors.background, borderColor: colors.primary },
                      ]}>
                      <Text style={[styles.previewTitle, { color: colors.primary }]}>
                        Preview
                      </Text>
                      <Text style={{ color: colors.text }}>
                        Total repayable:{' '}
                        {formatAmount(
                          preview.totalRepayable,
                          currencyCodeFor(currencyId),
                        )}
                      </Text>
                      <Text style={{ color: colors.text }}>
                        Monthly amount:{' '}
                        {formatAmount(
                          preview.monthlyAmount,
                          currencyCodeFor(currencyId),
                        )}
                      </Text>
                      {preview.finalInstallmentAmount !==
                        preview.monthlyAmount && (
                        <Text style={{ color: colors.text }}>
                          Final installment:{' '}
                          {formatAmount(
                            preview.finalInstallmentAmount,
                            currencyCodeFor(currencyId),
                          )}
                        </Text>
                      )}
                    </View>
                  )}

                  {error && (
                    <Text style={[styles.error, { color: colors.danger }]}>
                      {error}
                    </Text>
                  )}

                  <NumericInputAccessory />
      </BottomSheetModal>

      <BottomSheetModal
        visible={payTarget != null}
        onClose={() => setPayTarget(null)}
        onSave={handlePaySubmit}
        canSave={payCanSave}
        title={
          payTarget
            ? `Pay installment ${paidCountFor(payTarget.id) + 1} of ${payTarget.numberOfMonths} — ${payTarget.name}`
            : undefined
        }
        saveLabel="Pay">
            {payTarget && (
              <>
                <Text style={[styles.modalHint, { color: colors.textSecondary }]}>
                  Amount: {formatAmount(nextAmountDueFor(payTarget) ?? 0, payTarget.currencyCode)}
                </Text>

                <Text style={[styles.label, { color: colors.text }]}>
                  Pay from
                </Text>
                {activeAccounts.length === 0 ? (
                  <EmptyState message="No active accounts available." />
                ) : (
                  <CollapsiblePicker
                    displayLabel={
                      activeAccounts.find(a => String(a.id) === payAccountId)
                        ?.name ?? 'Select account'
                    }
                    selectedValue={payAccountId}
                    onValueChange={setPayAccountId}
                    items={activeAccounts.map(a => ({
                      label: `${a.name} (${a.type})`,
                      value: String(a.id),
                    }))}
                  />
                )}

                <Text style={[styles.label, { color: colors.text }]}>
                  Date
                </Text>
                <DateField value={payDate} onChange={setPayDate} />

              </>
            )}
      </BottomSheetModal>

      <NumericInputAccessory />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  list: {
    marginTop: 4,
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
  },
  addButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  planCard: {
    padding: 14,
    marginBottom: 10,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  planHeaderText: {
    flex: 1,
    marginLeft: 12,
  },
  rowName: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  rowMeta: {
    fontSize: scaleFont(12.5),
    marginTop: 2,
  },
  rowLine: {
    fontSize: scaleFont(13),
    marginTop: 4,
  },
  progressTrack: {
    marginTop: 12,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
  },
  planActionsRow: {
    marginBottom: 10,
  },
  historyLink: {
    fontWeight: '600',
    fontSize: scaleFont(13),
  },
  historyList: {
    marginTop: 8,
    gap: 4,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyRowText: {
    flex: 1,
  },
  undoButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  undoButtonText: {
    fontSize: scaleFont(12),
    fontWeight: '700',
  },
  modalHint: {
    fontSize: 14,
    marginBottom: 8,
  },
  fullyPaidText: {
    fontWeight: '700',
    marginTop: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
  },
  fieldHint: {
    fontSize: 12,
    marginBottom: 6,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
  },
  previewBox: {
    marginTop: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    padding: 10,
  },
  previewTitle: {
    fontWeight: '700',
    marginBottom: 4,
  },
  error: {
    marginTop: 12,
  },
});

export default InstallmentPlansScreen;
