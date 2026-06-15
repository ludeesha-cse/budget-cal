import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Check, Info } from 'lucide-react-native';
import Card from '../components/Card';
import MonthYearPicker from '../components/MonthYearPicker';
import { settleCreditCardAccount, upsertBudget } from '../db/queries';
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

function BudgetSettingsScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const [month, setMonth] = useState(getCurrentMonthString().slice(5));
  const [year, setYear] = useState(getCurrentYearString());
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const selectedMonth = `${year}-${month}`;

  const { amount, setAmount, currencyCode, allBudgets, creditCards, reload } =
    useBudgetSettingsData(selectedMonth, () => setSavedMessage(null));

  const parsedAmount = Number(amount);
  const amountValid = amount.trim() !== '' && !Number.isNaN(parsedAmount) && parsedAmount >= 0;
  const [yearNum, monthNum] = selectedMonth.split('-').map(Number);
  const daysInMonth = clampDayToMonth(yearNum, monthNum, 31);
  const perDayRate = amountValid
    ? getFullBudgetPerDay(parsedAmount, daysInMonth)
    : null;

  const handleSave = async () => {
    if (!amountValid) {
      return;
    }
    await upsertBudget(selectedMonth, parsedAmount);
    setSavedMessage('Budget saved');
    reload();
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
            reload();
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[typography.screenTitle, styles.title, { color: colors.text }]}>
        Monthly Budget
      </Text>
      <MonthYearPicker
        month={month}
        year={year}
        onMonthChange={setMonth}
        onYearChange={setYear}
      />

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

      <Pressable
        disabled={!amountValid}
        style={[
          styles.saveButton,
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

      <Text
        style={[typography.eyebrow, styles.sectionLabel, { color: colors.textSecondary }]}>
        PAST BUDGETS
      </Text>
      <FlatList
        data={allBudgets}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <Card colors={colors} style={styles.pastRow}>
            <Text style={{ color: colors.text }}>{item.month ?? '—'}</Text>
            <Text style={[typography.amountMono, { color: colors.text }]}>
              {formatAmount(item.limitAmount, currencyCode)}
            </Text>
          </Card>
        )}
        ListEmptyComponent={
          <EmptyState message="No budgets set yet." />
        }
      />

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
      <FlatList
        data={creditCards}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <Card colors={colors} style={styles.cardRow}>
            <View style={styles.cardInfo}>
              <Text style={[styles.rowName, { color: colors.text }]}>
                {item.name}
              </Text>
              <Text style={[typography.amountMono, styles.rowDebt, { color: colors.danger }]}>
                Owed: {formatAmount(item.debt, currencyCode)}
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
        )}
        ListEmptyComponent={
          <EmptyState message="No credit cards yet." />
        }
      />

      <NumericInputAccessory />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
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
