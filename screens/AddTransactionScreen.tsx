import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import TransactionForm, {
  TransactionFormSubmitValues,
} from '../components/TransactionForm';
import { addTransaction, ensureDefaultAccount } from '../db/queries';

function AddTransactionScreen(): React.JSX.Element {
  const [formKey, setFormKey] = useState(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (values: TransactionFormSubmitValues) => {
    const account = await ensureDefaultAccount();
    await addTransaction({
      accountId: account.id,
      amount: values.amount,
      category: values.category,
      description: values.description,
      date: values.date,
    });
    setSuccessMessage('Transaction added');
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
