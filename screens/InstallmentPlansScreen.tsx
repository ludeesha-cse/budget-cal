import React, { useCallback, useState } from 'react';
import {
  Alert,
  Button,
  FlatList,
  Modal,
  Platform,
  Pressable,
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
import {
  createInstallmentPlan,
  deleteInstallmentPlan,
  getCategories,
  getCurrencies,
  getInstallmentPlans,
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

type PlanRow = Awaited<ReturnType<typeof getInstallmentPlans>>[number];
type CategoryRow = Awaited<ReturnType<typeof getCategories>>[number];
type CurrencyRow = Awaited<ReturnType<typeof getCurrencies>>[number];

type Mode = 'principal' | 'monthly';

function InstallmentPlansScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const { tier } = useEntitlement();
  const { openPaywall } = usePaywall();

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyRow[]>([]);

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
  const [categoryId, setCategoryId] = useState('');
  const [currencyId, setCurrencyId] = useState('');
  const [startDate, setStartDate] = useState(formatDateString(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [planRows, categoryRows, currencyRows] = await Promise.all([
      getInstallmentPlans(),
      getCategories(),
      getCurrencies(),
    ]);
    setPlans(planRows);
    setCategories(categoryRows);
    setCurrencies(currencyRows);
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

  const resetForm = () => {
    setEditingId(null);
    setMode('principal');
    setName('');
    setPrincipalAmount('');
    setInterestRatePercent('');
    setMonthlyAmountInput('');
    setNumberOfMonths('');
    setCategoryId(categories[0] ? String(categories[0].id) : '');
    setCurrencyId(defaultCurrencyId());
    setStartDate(formatDateString(new Date()));
    setShowDatePicker(false);
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
    setCategoryId(String(plan.categoryId));
    setCurrencyId(String(plan.currencyId));
    setStartDate(plan.startDate);
    setShowDatePicker(false);
    setError(null);
    setFormVisible(true);
  };

  const handleDateChange = (
    _event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (selectedDate) {
      setStartDate(formatDateString(selectedDate));
    }
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
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
      openPaywall({
        reason: 'Installment plans require Premium.',
        onPurchaseSuccess: performCreate,
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {!formVisible && (
        <Button title="Add Plan" color={colors.primary} onPress={handleAddPress} />
      )}

      <FlatList
        data={plans}
        keyExtractor={item => String(item.id)}
        style={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <View style={styles.rowDetails}>
              <Text style={[styles.rowName, { color: colors.text }]}>
                {item.name}
              </Text>
              <Text style={{ color: colors.textSecondary }}>
                {item.categoryName} · {item.currencyCode}
              </Text>
              <Text style={[styles.rowLine, { color: colors.text }]}>
                {item.currencyCode} {item.monthlyAmount.toFixed(0)}/mo · Paid 0
                of {item.numberOfMonths}
              </Text>
              <Text style={{ color: colors.textSecondary }}>
                Total repayable: {item.currencyCode}{' '}
                {item.totalRepayable.toFixed(0)}
              </Text>
            </View>
            <View style={styles.rowActions}>
              <Button
                title="Edit"
                color={colors.primary}
                onPress={() => handleEditPress(item)}
              />
              <Button
                title="Delete"
                color={colors.danger}
                onPress={() => handleDelete(item.id)}
              />
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            No installment plans yet.
          </Text>
        }
      />

      <Modal
        visible={formVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFormVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              styles.formModalCard,
              { backgroundColor: colors.surface },
            ]}>
            <FlatList
              data={[0]}
              keyExtractor={() => 'form'}
              renderItem={() => (
                <View>
                  <Text style={[styles.label, { color: colors.text }]}>
                    {editingId ? 'Edit Plan' : 'New Installment Plan'}
                  </Text>

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
                  <View style={styles.toggleRow}>
                    <Pressable
                      style={[
                        styles.toggleButton,
                        { backgroundColor: colors.surface, borderColor: colors.primary },
                        mode === 'principal' && { backgroundColor: colors.primary },
                      ]}
                      onPress={() => setMode('principal')}>
                      <Text
                        style={[
                          styles.toggleButtonText,
                          { color: colors.primary },
                          mode === 'principal' && { color: colors.primaryText },
                        ]}>
                        Principal + Rate
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.toggleButton,
                        { backgroundColor: colors.surface, borderColor: colors.primary },
                        mode === 'monthly' && { backgroundColor: colors.primary },
                      ]}
                      onPress={() => setMode('monthly')}>
                      <Text
                        style={[
                          styles.toggleButtonText,
                          { color: colors.primary },
                          mode === 'monthly' && { color: colors.primaryText },
                        ]}>
                        Fixed Monthly
                      </Text>
                    </Pressable>
                  </View>

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
                    placeholder="12"
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
                  <Button
                    title={startDate}
                    color={colors.primary}
                    onPress={() => setShowDatePicker(true)}
                  />
                  {Platform.OS === 'android' ? (
                    showDatePicker && (
                      <DateTimePicker
                        value={new Date(startDate)}
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
                        <Pressable
                          style={[styles.modalCard, { backgroundColor: colors.surface }]}
                          onPress={() => {}}>
                          <DateTimePicker
                            value={new Date(startDate)}
                            mode="date"
                            display="spinner"
                            onChange={handleDateChange}
                          />
                          <Button
                            title="Done"
                            color={colors.primary}
                            onPress={() => setShowDatePicker(false)}
                          />
                        </Pressable>
                      </Pressable>
                    </Modal>
                  )}

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
                        Total repayable: {preview.totalRepayable.toFixed(0)}
                      </Text>
                      <Text style={{ color: colors.text }}>
                        Monthly amount: {preview.monthlyAmount.toFixed(0)}
                      </Text>
                      {preview.finalInstallmentAmount !==
                        preview.monthlyAmount && (
                        <Text style={{ color: colors.text }}>
                          Final installment:{' '}
                          {preview.finalInstallmentAmount.toFixed(0)}
                        </Text>
                      )}
                    </View>
                  )}

                  {error && (
                    <Text style={[styles.error, { color: colors.danger }]}>
                      {error}
                    </Text>
                  )}

                  <View style={styles.formActions}>
                    <Button
                      title="Cancel"
                      color={colors.primary}
                      onPress={() => {
                        setFormVisible(false);
                        resetForm();
                      }}
                    />
                    <Button
                      title={editingId ? 'Save' : 'Create'}
                      color={colors.primary}
                      onPress={handleSubmit}
                    />
                  </View>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  list: {
    marginTop: 8,
  },
  empty: {
    fontSize: 14,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowDetails: {
    flex: 1,
  },
  rowName: {
    fontWeight: '600',
  },
  rowLine: {
    marginTop: 2,
  },
  rowActions: {
    flexDirection: 'row',
    gap: 4,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32,
  },
  formModalCard: {
    maxHeight: '90%',
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
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleButton: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  toggleButtonText: {
    fontWeight: '600',
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
  formActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
});

export default InstallmentPlansScreen;
