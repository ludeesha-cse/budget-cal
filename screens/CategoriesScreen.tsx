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
  addCategory,
  deleteCategory,
  getCategories,
  getUserCategoryCount,
  updateCategory,
} from '../db/queries';
import { useEntitlement } from '../hooks/useEntitlement';
import { usePaywall } from '../contexts/PaywallContext';
import { canAddCategory } from '../utils/entitlementChecks';

type CategoryRow = Awaited<ReturnType<typeof getCategories>>[number];

function CategoriesScreen(): React.JSX.Element {
  const { tier } = useEntitlement();
  const { openPaywall } = usePaywall();
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    const rows = await getCategories();
    setCategories(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const resetForm = () => {
    setEditingId(null);
    setName('');
  };

  const handleAddPress = () => {
    resetForm();
    setFormVisible(true);
  };

  const handleEditPress = (category: CategoryRow) => {
    setEditingId(category.id);
    setName(category.name);
    setFormVisible(true);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      return;
    }
    try {
      if (editingId) {
        // Editing an existing category is never gated — see the same
        // rule applied in AccountsScreen.
        await updateCategory(editingId, name.trim());
        setFormVisible(false);
        resetForm();
        load();
        return;
      }

      const performCreate = async () => {
        await addCategory(name.trim());
        setFormVisible(false);
        resetForm();
        load();
      };

      const userCategoryCount = await getUserCategoryCount();
      const check = canAddCategory(userCategoryCount, tier);
      if (!check.allowed) {
        openPaywall({
          reason: check.reason ?? 'Additional categories require Premium.',
          onPurchaseSuccess: performCreate,
        });
        return;
      }
      await performCreate();
    } catch (error) {
      Alert.alert(
        'Cannot save category',
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const handleDelete = (id: number) => {
    Alert.alert(
      'Delete category',
      'Are you sure you want to delete this category?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCategory(id);
              load();
            } catch (error) {
              Alert.alert(
                'Cannot delete category',
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
        <Button title="Add Category" onPress={handleAddPress} />
      )}

      <FlatList
        style={styles.list}
        data={categories}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowName}>{item.name}</Text>
            <View style={styles.rowActions}>
              <Button title="Edit" onPress={() => handleEditPress(item)} />
              <Button title="Delete" onPress={() => handleDelete(item.id)} />
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No categories yet.</Text>
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
  rowName: {
    fontWeight: '600',
  },
  rowActions: {
    flexDirection: 'row',
    gap: 4,
  },
});

export default CategoriesScreen;
