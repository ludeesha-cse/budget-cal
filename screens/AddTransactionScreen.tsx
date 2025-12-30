import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import TransactionForm, {
  TransactionFormSubmitValues,
} from '../components/TransactionForm';
import { addIncome, addTransaction } from '../db/queries';

function AddTransactionScreen(): React.JSX.Element {
  const [formKey, setFormKey] = useState(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (values: TransactionFormSubmitValues) => {
    if (values.entryType === 'Income') {
      await addIncome({
        accountId: values.accountId,
        amount: values.amount,
        categoryId: values.categoryId,
        description: values.description,
        date: values.date,
        currencyId: values.currencyId,
      });
      setSuccessMessage('Income added');
    } else {
      await addTransaction({
        accountId: values.accountId,
        amount: values.amount,
        categoryId: values.categoryId,
        description: values.description,
        date: values.date,
        currencyId: values.currencyId,
        entryType: 'Expense',
      });
      setSuccessMessage('Transaction added');
    }
    setFormKey(key => key + 1);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Add Transaction</Text>
      {successMessage && <Text style={styles.success}>{successMessage}</Text>}
      <TransactionForm
        key={formKey}
        onSubmit={handleSubmit}
        submitLabel="Add"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  success: {
    color: '#2e7d32',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
});

export default AddTransactionScreen;
