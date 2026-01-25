import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MonthYearPicker from '../components/MonthYearPicker';
import {
  getAccountBalance,
  getAccounts,
  getAllBudgets,
  getBudgetForMonth,
  getDefaultCurrency,
  settleCreditCardAccount,
  upsertBudget,
} from '../db/queries';
import { getCurrentMonthString, getCurrentYearString } from '../utils/date';
import { useTheme } from '../contexts/ThemeContext';

const CREDIT_CARD_TYPE = 'CreditCard';

type BudgetRow = Awaited<ReturnType<typeof getAllBudgets>>[number];
type CreditCardRow = Awaited<ReturnType<typeof getAccounts>>[number] & {
  debt: number;
};

function BudgetSettingsScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const [month, setMonth] = useState(getCurrentMonthString().slice(5));
  const [year, setYear] = useState(getCurrentYearString());
  const [amount, setAmount] = useState('');
  const [allBudgets, setAllBudgets] = useState<BudgetRow[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCardRow[]>([]);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const selectedMonth = `${year}-${month}`;

  const load = useCallback(async () => {
    const [existing, all, accounts] = await Promise.all([
      getBudgetForMonth(selectedMonth),
      getAllBudgets(),
      getAccounts(),
    ]);
    setAmount(existing ? String(existing.limitAmount) : '');
    setAllBudgets(all);

    const cardAccounts = accounts.filter(
      account => account.type === CREDIT_CARD_TYPE,
    );
    // Card debt is computed in the default currency only for now.
    const defaultCurrency = await getDefaultCurrency();
    const withDebt = await Promise.all(
      cardAccounts.map(async account => ({
        ...account,
        debt: defaultCurrency
          ? -(await getAccountBalance(account.id, defaultCurrency.id))
          : 0,
      })),
    );
    setCreditCards(withDebt);
  }, [selectedMonth]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    setSavedMessage(null);
  }, [selectedMonth]);

  const handleSave = async () => {
    const parsedAmount = Number(amount);
    if (!amount || Number.isNaN(parsedAmount)) {
      return;
    }
    await upsertBudget(selectedMonth, parsedAmount);
    setSavedMessage('Budget saved');
    load();
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
            load();
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>
        Budget Settings
      </Text>
      <MonthYearPicker
        month={month}
        year={year}
        onMonthChange={setMonth}
        onYearChange={setYear}
      />

      <Text style={[styles.label, { color: colors.text }]}>
        Budget amount for {selectedMonth}
      </Text>
      <TextInput
        style={[
          styles.input,
          { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
        ]}
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
        placeholder="0.00"
        placeholderTextColor={colors.textSecondary}
      />
      {savedMessage && (
        <Text style={[styles.success, { color: colors.success }]}>
          {savedMessage}
        </Text>
      )}
      <Button title="Save" color={colors.primary} onPress={handleSave} />

      <Text style={[styles.subtitle, { color: colors.text }]}>
        Past budgets
      </Text>
      <FlatList
        data={allBudgets}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <Text style={{ color: colors.text }}>{item.month ?? '—'}</Text>
            <Text style={{ color: colors.text }}>
              {item.limitAmount.toFixed(2)}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            No budgets set yet.
          </Text>
        }
      />

      <Text style={[styles.subtitle, { color: colors.text }]}>
        Credit Cards
      </Text>
      <FlatList
        data={creditCards}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <View style={[styles.cardRow, { borderBottomColor: colors.border }]}>
            <View style={styles.cardInfo}>
              <Text style={[styles.rowName, { color: colors.text }]}>
                {item.name}
              </Text>
              <Text style={[styles.rowDebt, { color: colors.danger }]}>
                Owed: {item.debt.toFixed(2)}
              </Text>
            </View>
            <Button
              title="Settle"
              color={colors.primary}
              onPress={() => handleSettle(item.id, item.name)}
            />
          </View>
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            No credit cards yet.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
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
    marginBottom: 12,
  },
  success: {
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 8,
  },
  empty: {
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cardInfo: {
    flex: 1,
  },
  rowName: {
    fontWeight: '600',
  },
  rowDebt: {
    marginTop: 2,
  },
});

export default BudgetSettingsScreen;
