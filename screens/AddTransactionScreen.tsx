import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import TransactionForm, {
  TransactionFormSubmitValues,
} from '../components/TransactionForm';
import IncomeForm, { IncomeFormSubmitValues } from '../components/IncomeForm';
import { addIncome, addTransaction, setTransactionTags } from '../db/queries';
import { useTheme } from '../contexts/ThemeContext';
import type { RootTabParamList } from '../navigation/types';

type AddScreenNavigationProp = BottomTabNavigationProp<RootTabParamList, 'Add'>;

type AddTab = 'Expense' | 'Income';

const TABS: { key: AddTab; label: string }[] = [
  { key: 'Expense', label: 'Expense' },
  { key: 'Income', label: 'Income' },
];

// This is the Add tab's screen — it lives at screens/AddTransactionScreen.tsx
// (the filename predates this restructure and can't be renamed in the
// connected project folder) but the component itself is a 2-way hub
// (Expense/Income), not a single transaction form, hence the internal
// rename to AddScreen and the removal of the old "Add Transaction" header:
// the tab navigator's own header already shows "Add".
//
// Liability Repayment / Receivable Income used to live here as two more
// tabs, but were removed: settling a loan is already fully reachable from
// the Liabilities & Receivables screen's own "Settle / Pay Off" action
// (see LiabilitiesReceivablesScreen.tsx), so this was a duplicate entry
// point, not a distinct capability.
function AddScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const navigation = useNavigation<AddScreenNavigationProp>();
  const route = useRoute<RouteProp<RootTabParamList, 'Add'>>();
  const [activeTab, setActiveTab] = useState<AddTab>(
    route.params?.initialTab ?? 'Expense',
  );
  const [formKey, setFormKey] = useState(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const switchTab = (tab: AddTab) => {
    setActiveTab(tab);
    setSuccessMessage(null);
  };

  // Same reasoning as LiabilitiesReceivablesScreen's identical effect —
  // the FAB (App.tsx) navigates here with a fresh `initialTab` while this
  // tab may already be mounted from an earlier visit, so the useState
  // initializer above alone won't react to a second navigation.
  useEffect(() => {
    if (route.params?.initialTab) {
      switchTab(route.params.initialTab);
    }
  }, [route.params?.initialTab]);

  const handleExpenseSubmit = async (values: TransactionFormSubmitValues) => {
    const [inserted] = await addTransaction({
      accountId: values.accountId,
      amount: values.amount,
      categoryId: values.categoryId,
      description: values.description,
      date: values.date,
      currencyId: values.currencyId,
      entryType: 'Expense',
      excludeFromBudget: values.excludeFromBudget,
    });
    // Tags apply to the real transaction row that was just created — a
    // brand-new transaction always starts with an empty tag set, so this
    // is really just "add" rather than "replace", but setTransactionTags
    // is the one function that does both correctly either way.
    await setTransactionTags(inserted.id, values.tagIds);
    setSuccessMessage('Expense added');
    setFormKey(key => key + 1);
  };

  const handleIncomeSubmit = async (values: IncomeFormSubmitValues) => {
    const [inserted] = await addIncome({
      accountId: values.accountId,
      amount: values.amount,
      description: values.description,
      date: values.date,
      currencyId: values.currencyId,
      excludeFromBudget: values.excludeFromBudget,
    });
    await setTransactionTags(inserted.id, values.tagIds);
    setSuccessMessage('Income added');
    setFormKey(key => key + 1);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabRow, { borderBottomColor: colors.border }]}
        contentContainerStyle={styles.tabRowContent}>
        {TABS.map(tab => (
          <Pressable
            key={tab.key}
            style={[
              styles.tabButton,
              { backgroundColor: colors.surface },
              activeTab === tab.key && { backgroundColor: colors.primary },
            ]}
            onPress={() => switchTab(tab.key)}>
            <Text
              style={[
                styles.tabButtonText,
                { color: colors.text },
                activeTab === tab.key && { color: colors.primaryText },
              ]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {successMessage && (
        <Text style={[styles.success, { color: colors.success }]}>
          {successMessage}
        </Text>
      )}

      <View style={styles.formArea}>
        {activeTab === 'Expense' && (
          <TransactionForm
            key={`expense-${formKey}`}
            lockToExpense
            onSubmit={handleExpenseSubmit}
            submitLabel="Add"
          />
        )}
        {activeTab === 'Income' && (
          <IncomeForm
            key={`income-${formKey}`}
            onSubmit={handleIncomeSubmit}
            submitLabel="Add"
          />
        )}
      </View>

      {/* Common to both tabs, not tied to activeTab — sits below whichever
          form is showing. Settling a loan repayment/receivable used to be
          two separate tabs right here; now it's one tap through to the
          screen that actually owns that flow (see
          LiabilitiesReceivablesScreen's Settle / Pay Off action). */}
      <Pressable
        style={[
          styles.shortcut,
          { backgroundColor: colors.surface, borderTopColor: colors.border },
        ]}
        onPress={() =>
          navigation.navigate('Settings', {
            screen: 'LiabilitiesReceivables',
          })
        }>
        <Text style={[styles.shortcutText, { color: colors.primary }]}>
          Liabilities & Receivables
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabRow: {
    flexGrow: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabRowContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  tabButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  success: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  formArea: {
    flex: 1,
  },
  shortcut: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    alignItems: 'center',
  },
  shortcutText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

export default AddScreen;
