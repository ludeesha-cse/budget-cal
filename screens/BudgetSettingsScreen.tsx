import React, { useState } from 'react';
import {
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Check, Info } from 'lucide-react-native';
import Card from '../components/Card';
import MonthYearPicker from '../components/MonthYearPicker';
import CurrencyTabs from '../components/common/CurrencyTabs';

import { useBudgetSettingsData } from '../hooks/useBudgetSettingsData';
import { clampDayToMonth, getCurrentMonthString, getCurrentYearString } from '../utils/date';
import { formatAmount } from '../utils/formatAmount';
import { getFullBudgetPerDay } from '../utils/budgetCalculations';
import { useTheme } from '../contexts/ThemeContext';
import { scaleFont, typography } from '../theme/typography';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from '../components/NumericInputAccessory';
import EmptyState from '../components/common/EmptyState';
import {
  useDeleteBudget as useDeleteBudgetMutation,
  useSettleCreditCardAccount as useSettleCreditCardAccountMutation,
  useUpsertBudget as useUpsertBudgetMutation,
} from '../hooks/queries';

function BudgetSettingsScreen(): React.JSX.Element {
  // Write paths go through the caching layer's mutation hooks: each
  // one runs the same db/queries function as before and then
  // invalidates every query its write can affect (see
  // hooks/queries/invalidation.ts). The call sites below are
  // unchanged — these hooks take the wrapped function's own arguments.
  const deleteBudget = useDeleteBudgetMutation();
  const settleCreditCardAccount = useSettleCreditCardAccountMutation();
  const upsertBudget = useUpsertBudgetMutation();
  const { colors } = useTheme();
  const [month, setMonth] = useState(getCurrentMonthString().slice(5));
  const [year, setYear] = useState(getCurrentYearString());
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const selectedMonth = `${year}-${month}`;

  const {
    amount,
    setAmount,
    currencyId,
    setCurrencyId,
    currencyOptions,
    currencyCode,
    defaultCurrencyCode,
    currentBudgetId,
    allBudgets,
    creditCards,
  } = useBudgetSettingsData(selectedMonth, () => setSavedMessage(null));

  const parsedAmount = Number(amount);
  const amountValid = amount.trim() !== '' && !Number.isNaN(parsedAmount) && parsedAmount >= 0;
  const [yearNum, monthNum] = selectedMonth.split('-').map(Number);
  const daysInMonth = clampDayToMonth(yearNum, monthNum, 31);
  const perDayRate = amountValid
    ? getFullBudgetPerDay(parsedAmount, daysInMonth)
    : null;

  const handleSave = async () => {
    if (!amountValid || currencyId == null) {
      return;
    }
    // The amount TextInput's returnKeyType="done" has no onSubmitEditing
    // of its own (it relies on inputAccessoryViewID, an iOS-only "Done"
    // bar) — so without this, tapping Save while that field is focused
    // submits the form but leaves the keyboard open on both platforms.
    Keyboard.dismiss();
    await upsertBudget(selectedMonth, currencyId, parsedAmount);
    setSavedMessage('Budget saved');
    // No reload() here any more: the mutation already invalidated every
    // budget query this write affects, and awaiting it waits for those
    // refetches — a second read would be redundant.
  };

  const handleDelete = () => {
    if (currentBudgetId == null) {
      return;
    }
    Alert.alert(
      'Delete budget',
      `Remove the ${currencyCode} budget for ${selectedMonth}? This only removes the budget limit — none of your ${currencyCode} transactions are affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteBudget(currentBudgetId);
            setAmount('');
          },
        },
      ],
    );
  };

  const handleSettle = (id: number, name: string) => {
    Alert.alert(
      'Settle credit card',
      `Mark ${name} as paid off? This sets its balance back to zero. Past transactions stay in your history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Settle',
          onPress: async () => {
            await settleCreditCardAccount(id);
          },
        },
      ],
    );
  };

  return (
    // A plain View + two unbounded FlatLists used to sit here — with no
    // scroll container at all, the screen's real height depended on
    // however tall PAST BUDGETS/CREDIT CARDS happened to render, so
    // Android's adjustResize (see AndroidManifest.xml) shrinking the
    // window for the keyboard had nowhere sensible to put that overflow:
    // the Save button and the currency tabs above it would get squeezed
    // or shoved off-screen instead of the screen simply scrolling. A
    // single ScrollView fixes that — everything below is now reachable
    // by scrolling regardless of keyboard state, and PAST BUDGETS/CREDIT
    // CARDS are now plain `.map()`s rather than nested FlatLists (a
    // VirtualizedList inside a ScrollView with the same scroll direction
    // is an RN anti-pattern that itself causes layout glitches) — both
    // lists are small enough (a personal tracker's handful of currencies/
    // cards) that virtualization was never buying anything here anyway.
    // keyboardShouldPersistTaps="handled" so Save/Delete are tappable in
    // one tap while the amount field's keyboard is still up, instead of
    // needing a first tap to dismiss it.
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      <Text style={[typography.screenTitle, styles.title, { color: colors.text }]}>
        Monthly Budget
      </Text>
      <MonthYearPicker
        month={month}
        year={year}
        onMonthChange={setMonth}
        onYearChange={setYear}
      />

      {currencyOptions.length > 1 && (
        <CurrencyTabs
          currencies={currencyOptions}
          value={currencyId}
          onChange={setCurrencyId}
          style={styles.currencyTabs}
        />
      )}

      <Card colors={colors} style={styles.amountCard}>
        <Text
          style={[typography.eyebrow, styles.amountLabel, { color: colors.textSecondary }]}>
          BUDGET FOR {selectedMonth}
          {currencyCode ? ` · ${currencyCode}` : ''}
        </Text>
        <TextInput
          style={[typography.amountLarge, styles.amountInput, { color: colors.text }]}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          returnKeyType="done"
          inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
          placeholder="0"
          placeholderTextColor={colors.textSecondary}
        />
        {perDayRate !== null && (
          <Text style={[typography.amountMono, styles.perDayText, { color: colors.textSecondary }]}>
            ≈ {formatAmount(perDayRate, currencyCode)} / day across {daysInMonth} days
          </Text>
        )}
      </Card>

      {savedMessage && (
        <View style={[styles.successBanner, { backgroundColor: colors.successSoft }]}>
          <Check size={14} color={colors.success} />
          <Text style={[styles.successText, { color: colors.success }]}>
            {savedMessage}
          </Text>
        </View>
      )}

      <View style={styles.actionRow}>
        <Pressable
          disabled={!amountValid}
          style={[
            styles.saveButton,
            styles.actionButtonGrow,
            { backgroundColor: !amountValid ? colors.neutralSoft : colors.primary },
          ]}
          onPress={handleSave}>
          <Text
            style={[
              styles.saveButtonText,
              { color: !amountValid ? colors.textSecondary : colors.primaryText },
            ]}>
            Save Budget
          </Text>
        </Pressable>
        {currentBudgetId != null && (
          <Pressable
            style={[styles.deleteBudgetButton, { borderColor: colors.dangerSoft }]}
            onPress={handleDelete}>
            <Text style={[styles.deleteBudgetButtonText, { color: colors.danger }]}>
              Delete
            </Text>
          </Pressable>
        )}
      </View>

      <Text
        style={[typography.eyebrow, styles.sectionLabel, { color: colors.textSecondary }]}>
        PAST BUDGETS
      </Text>
      {allBudgets.length === 0 ? (
        <EmptyState message="No budgets set yet." />
      ) : (
        allBudgets.map(item => (
          <Card key={item.id} colors={colors} style={styles.pastRow}>
            <Text style={{ color: colors.text }}>{item.month ?? '—'}</Text>
            <Text style={[typography.amountMono, { color: colors.text }]}>
              {formatAmount(item.limitAmount, currencyCode)}
            </Text>
          </Card>
        ))
      )}

      <Text
        style={[typography.eyebrow, styles.sectionLabel, { color: colors.textSecondary }]}>
        CREDIT CARDS
      </Text>
      <View style={[styles.noteRow, { backgroundColor: colors.primarySoft }]}>
        <Info size={14} color={colors.primary} />
        <Text style={[styles.noteText, { color: colors.text }]}>
          Credit card debt isn't counted against your monthly budget. Settle
          a card here once it's paid off — it won't affect past budget
          history.
        </Text>
      </View>
      {creditCards.length === 0 ? (
        <EmptyState message="No credit cards yet." />
      ) : (
        creditCards.map(item => (
          <Card key={item.id} colors={colors} style={styles.cardRow}>
            <View style={styles.cardInfo}>
              <Text style={[styles.rowName, { color: colors.text }]}>
                {item.name}
              </Text>
              <Text style={[typography.amountMono, styles.rowDebt, { color: colors.danger }]}>
                Owed: {formatAmount(item.debt, defaultCurrencyCode)}
              </Text>
            </View>
            <Pressable
              style={[styles.settleButton, { borderColor: colors.primary }]}
              onPress={() => handleSettle(item.id, item.name)}>
              <Text style={[styles.settleButtonText, { color: colors.primary }]}>
                Settle
              </Text>
            </Pressable>
          </Card>
        ))
      )}

      <NumericInputAccessory />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    padding: 16,
    // Clears the floating tab bar pill + FAB (see App.tsx) the same way
    // every other scrollable top-level screen in this app already does
    // (ReportsScreen, TransactionForm, ...) — this screen just didn't
    // need it before since it had no ScrollView of its own yet.
    paddingBottom: 120,
  },
  title: {
    marginBottom: 12,
  },
  amountCard: {
    padding: 16,
    marginTop: 12,
    alignItems: 'center',
  },
  amountLabel: {
    marginBottom: 8,
  },
  amountInput: {
    textAlign: 'center',
    minWidth: 140,
    padding: 0,
  },
  perDayText: {
    marginTop: 8,
    fontSize: scaleFont(13),
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
  },
  successText: {
    fontSize: scaleFont(13),
    fontWeight: '600',
  },
  currencyTabs: {
    marginTop: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  actionButtonGrow: {
    flex: 1,
    marginTop: 0,
  },
  saveButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  saveButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  deleteBudgetButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBudgetButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  sectionLabel: {
    marginTop: 24,
    marginBottom: 8,
  },
  pastRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  noteText: {
    flex: 1,
    fontSize: scaleFont(12.5),
    lineHeight: scaleFont(18),
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
  },
  cardInfo: {
    flex: 1,
  },
  rowName: {
    fontSize: scaleFont(15),
    fontWeight: '600',
  },
  rowDebt: {
    marginTop: 2,
    fontSize: scaleFont(13),
  },
  settleButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  settleButtonText: {
    fontSize: scaleFont(13),
    fontWeight: '700',
  },
});

export default BudgetSettingsScreen;
