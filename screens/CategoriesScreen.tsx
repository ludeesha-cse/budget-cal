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
import { useTheme } from '../contexts/ThemeContext';

type CategoryRow = Awaited<ReturnType<typeof getCategories>>[number];

function CategoriesScreen(): React.JSX.Element {
  const { colors } = useTheme();
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
        // Hide this screen's own form Modal first — showing PaywallModal's
        // <Modal> while this one is still visible=true is what freezes
        // iOS solid (two native Modals open at once never finishes
        // presenting there; Android tolerates it). onDismiss restores the
        // form, still filled in, if the user backs out without buying.
        setFormVisible(false);
        openPaywall({
          reason: check.reason ?? 'Additional categories require Premium.',
          onPurchaseSuccess: performCreate,
          onDismiss: () => setFormVisible(true),
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {formVisible ? (
        <View style={styles.form}>
          <Text style={[styles.label, { color: colors.text }]}>Name</Text>
          <TextInput
            style={[
              styles.input,
              { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
            ]}
            value={name}
            onChangeText={setName}
            placeholderTextColor={colors.textSecondary}
          />

          <View style={styles.formActions}>
            <Button
              title="Cancel"
              color={colors.primary}
              onPress={() => {
                setFormVisible(false);
                resetForm();
              }}
            />
            <Button
              title={editingId ? 'Update' : 'Add'}
              color={colors.primary}
              onPress={handleSubmit}
            />
          </View>
        </View>
      ) : (
        <Button title="Add Category" color={colors.primary} onPress={handleAddPress} />
      )}

      <FlatList
        style={styles.list}
        data={categories}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <Text style={[styles.rowName, { color: colors.text }]}>
              {item.name}
            </Text>
            <View style={styles.rowActions}>
              <Button
                title="Edit"
                color={colors.primary}
                onPress={() => handleEditPress(item)}
              />
              <Button
                title="Delete"
                color={colors.danger}
                onPress={() => handleDelete(item.id)}
              />
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            No categories yet.
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
