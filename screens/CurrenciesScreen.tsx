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
import { useFocusEffect } from '@react-navigation/native';
import {
  addCurrency,
  deleteCurrency,
  getCurrencies,
  setDefaultCurrency,
} from '../db/queries';

// Lists existing currencies and lets the user add new ones; the seeded
// default currency is flagged with a badge and can't be added again.
type CurrencyRow = Awaited<ReturnType<typeof getCurrencies>>[number];

function CurrenciesScreen(): React.JSX.Element {
  const [currencies, setCurrencies] = useState<CurrencyRow[]>([]);
  const [formVisible, setFormVisible] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    const rows = await getCurrencies();
    setCurrencies(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const resetForm = () => {
    setCode('');
    setName('');
  };

  const handleAddPress = () => {
    resetForm();
    setFormVisible(true);
  };

  const handleSubmit = async () => {
    const trimmedCode = code.trim().toUpperCase();
    const trimmedName = name.trim();
    if (!trimmedCode || !trimmedName) {
      return;
    }
    try {
      await addCurrency(trimmedCode, trimmedName);
      setFormVisible(false);
      resetForm();
      load();
    } catch (error) {
      Alert.alert(
        'Cannot add currency',
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const handleSetDefault = async (currencyId: number) => {
    try {
      await setDefaultCurrency(currencyId);
      load();
    } catch (error) {
      Alert.alert(
        'Cannot set default currency',
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const handleDelete = (currencyId: number, currencyCode: string) => {
    Alert.alert(
      'Delete currency',
      `Are you sure you want to delete ${currencyCode}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCurrency(currencyId);
              load();
            } catch (error) {
              Alert.alert(
                'Cannot delete currency',
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
          <Text style={styles.label}>Code</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            placeholder="e.g. JPY"
            autoCapitalize="characters"
          />

          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Japanese Yen"
          />

          <View style={styles.formActions}>
            <Button
              title="Cancel"
              onPress={() => {
                setFormVisible(false);
                resetForm();
              }}
            />
            <Button title="Add" onPress={handleSubmit} />
          </View>
        </View>
      ) : (
        <Button title="Add Currency" onPress={handleAddPress} />
      )}

      <FlatList
        style={styles.list}
        data={currencies}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowDetails}>
              <Text style={styles.rowCode}>{item.code}</Text>
              <Text>{item.name}</Text>
            </View>
            <View style={styles.rowActions}>
              {item.isDefault ? (
                <Text style={styles.defaultBadge}>Default</Text>
              ) : (
                <Button
                  title="Set as Default"
                  onPress={() => handleSetDefault(item.id)}
                />
              )}
              <Button
                title="Delete"
                onPress={() => handleDelete(item.id, item.code)}
              />
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No currencies yet.</Text>
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
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rowCode: {
    fontWeight: '600',
  },
  defaultBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2e7d32',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2e7d32',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
});

export default CurrenciesScreen;
