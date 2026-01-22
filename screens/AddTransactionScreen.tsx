import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import TransactionForm, {
  TransactionFormSubmitValues,
} from '../components/TransactionForm';
import IncomeForm, { IncomeFormSubmitValues } from '../components/IncomeForm';
import LoanSettlementForm from '../components/LoanSettlementForm';
import { addIncome, addTransaction } from '../db/queries';

type AddTab = 'Expense' | 'Income' | 'LiabilityRepayment' | 'ReceivableIncome';

const TABS: { key: AddTab; label: string }[] = [
  { key: 'Expense', label: 'Expense' },
  { key: 'Income', label: 'Income' },
  { key: 'LiabilityRepayment', label: 'Liability Repayment' },
  { key: 'ReceivableIncome', label: 'Receivable Income' },
];

// This is the Add tab's screen — it lives at screens/AddTransactionScreen.tsx
// (the filename predates this restructure and can't be renamed in the
// connected project folder) but the component itself is now a 4-way
// hub, not a single transaction form, hence the internal rename to
// AddScreen and the removal of the old "Add Transaction" header: the tab
// navigator's own header already shows "Add".
function AddScreen(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<AddTab>('Expense');
  const [formKey, setFormKey] = useState(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const switchTab = (tab: AddTab) => {
    setActiveTab(tab);
    setSuccessMessage(null);
  };

  const handleExpenseSubmit = async (values: TransactionFormSubmitValues) => {
    await addTransaction({
      accountId: values.accountId,
      amount: values.amount,
      categoryId: values.categoryId,
      description: values.description,
      date: values.date,
      currencyId: values.currencyId,
      entryType: 'Expense',
    });
    setSuccessMessage('Expense added');
    setFormKey(key => key + 1);
  };

  const handleIncomeSubmit = async (values: IncomeFormSubmitValues) => {
    await addIncome({
      accountId: values.accountId,
      amount: values.amount,
      description: values.description,
      date: values.date,
      currencyId: values.currencyId,
    });
    setSuccessMessage('Income added');
    setFormKey(key => key + 1);
  };

  const handleSettled = (message: string) => {
    setSuccessMessage(message);
    setFormKey(key => key + 1);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabRow}
        contentContainerStyle={styles.tabRowContent}>
        {TABS.map(tab => (
          <Pressable
            key={tab.key}
            style={[
              styles.tabButton,
              activeTab === tab.key && styles.tabButtonActive,
            ]}
            onPress={() => switchTab(tab.key)}>
            <Text
              style={[
                styles.tabButtonText,
                activeTab === tab.key && styles.tabButtonTextActive,
              ]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {successMessage && <Text style={styles.success}>{successMessage}</Text>}

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
        {activeTab === 'LiabilityRepayment' && (
          <LoanSettlementForm
            key={`liability-${formKey}`}
            type="Liability"
            onSettled={() => handleSettled('Repayment recorded')}
          />
        )}
        {activeTab === 'ReceivableIncome' && (
          <LoanSettlementForm
            key={`receivable-${formKey}`}
            type="Receivable"
            onSettled={() => handleSettled('Payment received')}
          />
        )}
      </View>
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
    borderBottomColor: '#ccc',
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
    backgroundColor: '#eee',
  },
  tabButtonActive: {
    backgroundColor: '#1565c0',
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  tabButtonTextActive: {
    color: '#fff',
  },
  success: {
    color: '#2e7d32',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  formArea: {
    flex: 1,
  },
});

export default AddScreen;
