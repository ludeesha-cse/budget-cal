import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Check, ChevronRight, Scale } from 'lucide-react-native';
import TransactionForm, {
  TransactionFormSubmitValues,
} from '../components/TransactionForm';
import IncomeForm, { IncomeFormSubmitValues } from '../components/IncomeForm';
import Card from '../components/Card';
import { addIncome, addTransaction, setTransactionTags } from '../db/queries';
import { useTheme } from '../contexts/ThemeContext';
import { scaleFont } from '../theme/typography';
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
      <View style={styles.tabRow}>
        {TABS.map(tab => (
          <Pressable
            key={tab.key}
            style={[
              styles.tabButton,
              { backgroundColor: colors.surface, borderColor: colors.border },
              activeTab === tab.key && { backgroundColor: colors.primary, borderColor: colors.primary },
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
      </View>

      {successMessage && (
        <View style={[styles.successBanner, { backgroundColor: colors.successSoft }]}>
          <Check size={14} color={colors.success} />
          <Text style={[styles.successText, { color: colors.success }]}>
            {successMessage}
          </Text>
        </View>
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

      <Pressable
        onPress={() =>
          navigation.navigate('Settings', {
            screen: 'LiabilitiesReceivables',
          })
        }>
        <Card colors={colors} style={styles.shortcut} borderColor={colors.border}>
          <View style={[styles.shortcutIcon, { backgroundColor: colors.primarySoft }]}>
            <Scale size={16} color={colors.primary} />
          </View>
          <Text style={[styles.shortcutText, { color: colors.text }]}>
            Liabilities & Receivables
          </Text>
          <ChevronRight size={18} color={colors.chevron} />
        </Card>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  tabButton: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabButtonText: {
    fontSize: scaleFont(14.5),
    fontWeight: '700',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  successText: {
    fontSize: scaleFont(13),
    fontWeight: '600',
  },
  formArea: {
    flex: 1,
  },
  shortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  shortcutIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  shortcutText: {
    flex: 1,
    fontSize: scaleFont(14.5),
    fontWeight: '600',
  },
});

export default AddScreen;
