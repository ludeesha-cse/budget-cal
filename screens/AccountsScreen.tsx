import React, { useCallback, useState } from 'react';
import {
  Alert,
  Button,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useFocusEffect } from '@react-navigation/native';
import {
  addAccount,
  deleteAccount,
  getAccountBalance,
  getAccounts,
  updateAccount,
} from '../db/queries';

const ACCOUNT_TYPES = ['Cash', 'Bank', 'Card'] as const;

type AccountWithBalance = Awaited<ReturnType<typeof getAccounts>>[number] & {
  currentBalance: number;
};

function AccountsScreen(): React.JSX.Element {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<string>(ACCOUNT_TYPES[0]);
  const [openingBalance, setOpeningBalance] = useState('');

  const load = useCallback(async () => {
    const rows = await getAccounts();
    const withBalances = await Promise.all(
      rows.map(async account => ({
        ...account,
        currentBalance: await getAccountBalance(account.id),
      })),
    );
    setAccounts(withBalances);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setType(ACCOUNT_TYPES[0]);
    setOpeningBalance('');
  };

  const handleAddPress = () => {
    resetForm();
    setFormVisible(true);
  };

  const handleEditPress = (account: AccountWithBalance) => {
    setEditingId(account.id);
    setName(account.name);
    setType(account.type);
    setOpeningBalance(String(account.balance));
    setFormVisible(true);
  };

  const handleSubmit = async () => {
    const parsedBalance = Number(openingBalance);
    if (!name || !openingBalance || Number.isNaN(parsedBalance)) {
      return;
    }
    if (editingId) {
      await updateAccount(editingId, {
        name,
        type,
        openingBalance: parsedBalance,
      });
    } else {
      await addAccount({ name, type, openingBalance: parsedBalance });
    }
    setFormVisible(false);
    resetForm();
    load();
  };

  const handleDelete = (id: number) => {
    Alert.alert(
      'Delete account',
      'Are you sure you want to delete this account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount(id);
              load();
            } catch (error) {
              Alert.alert(
                'Cannot delete account',
                error instanceof Error ? error.message : String(error),
              );
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      {formVisible ? (
        <View style={styles.form}>
          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} />

          <Text style={styles.label}>Type</Text>
          <View style={styles.pickerWrapper}>
            <Picker selectedValue={type} onValueChange={setType}>
              {ACCOUNT_TYPES.map(t => (
                <Picker.Item key={t} label={t} value={t} />
              ))}
            </Picker>
          </View>

          <Text style={styles.label}>Opening balance</Text>
          <TextInput
            style={styles.input}
            value={openingBalance}
            onChangeText={setOpeningBalance}
            keyboardType="numeric"
            placeholder="0.00"
          />

          <View style={styles.formActions}>
            <Button
              title="Cancel"
              onPress={() => {
                setFormVisible(false);
                resetForm();
              }}
            />
            <Button
              title={editingId ? 'Update' : 'Add'}
              onPress={handleSubmit}
            />
          </View>
        </View>
      ) : (
        <Button title="Add Account" onPress={handleAddPress} />
      )}

      <FlatList
        style={styles.list}
        data={accounts}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowDetails}>
              <Text style={styles.rowName}>{item.name}</Text>
              <Text>{item.type}</Text>
              <Text style={styles.rowBalance}>
                Cash in hand: {item.currentBalance.toFixed(2)}
              </Text>
            </View>
            <View style={styles.rowActions}>
              <Button title="Edit" onPress={() => handleEditPress(item)} />
              <Button title="Delete" onPress={() => handleDelete(item.id)} />
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No accounts yet.</Text>
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
  form: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#999',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
  },
  pickerWrapper: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#999',
    borderRadius: 6,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
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
    borderBottomColor: '#ccc',
  },
  rowDetails: {
    flex: 1,
  },
  rowName: {
    fontWeight: '600',
  },
  rowBalance: {
    marginTop: 2,
  },
  rowActions: {
    flexDirection: 'row',
    gap: 4,
  },
});

export default AccountsScreen;
