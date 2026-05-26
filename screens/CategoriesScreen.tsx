import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react-native';
import Card from '../components/Card';
import BottomSheetModal from '../components/BottomSheetModal';
import EmptyState from '../components/common/EmptyState';
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
import { avatarColorsFor } from '../utils/avatarColor';
import { useTheme } from '../contexts/ThemeContext';
import { scaleFont } from '../theme/typography';

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
        // Hide this screen's own form popup first — showing PaywallModal's
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

  const hasReserved = categories.some(c => c.isSystemReserved);
  const formCanSave = name.trim() !== '';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Pressable
        style={[styles.addButton, { borderColor: colors.primary }]}
        onPress={handleAddPress}>
        <Plus size={16} color={colors.primary} strokeWidth={2.5} />
        <Text style={[styles.addButtonText, { color: colors.primary }]}>
          Add Category
        </Text>
      </Pressable>

      <FlatList
        style={styles.list}
        data={categories}
        keyExtractor={item => String(item.id)}
        renderItem={({ item, index }) => {
          const { bg, fg } = avatarColorsFor(index, colors.chart);
          return (
            <Card colors={colors} style={styles.row}>
              <View style={[styles.avatar, { backgroundColor: bg }]}>
                <Text style={[styles.avatarText, { color: fg }]}>
                  {item.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              {item.isSystemReserved ? (
                <View style={styles.reservedBadge}>
                  <Lock size={13} color={colors.textSecondary} />
                  <Text
                    style={[styles.reservedBadgeText, { color: colors.textSecondary }]}>
                    RESERVED
                  </Text>
                </View>
              ) : (
                <View style={styles.rowActions}>
                  <Pressable
                    hitSlop={8}
                    style={styles.iconButton}
                    onPress={() => handleEditPress(item)}>
                    <Pencil size={16} color={colors.primary} />
                  </Pressable>
                  <Pressable
                    hitSlop={8}
                    style={styles.iconButton}
                    onPress={() => handleDelete(item.id)}>
                    <Trash2 size={16} color={colors.danger} />
                  </Pressable>
                </View>
              )}
            </Card>
          );
        }}
        ListEmptyComponent={
          <EmptyState message="No categories yet." />
        }
        ListFooterComponent={
          hasReserved ? (
            <Text style={[styles.footerHint, { color: colors.textSecondary }]}>
              Bank is reserved for balance corrections and can't be deleted —
              that's why it shows a lock instead of edit/delete.
            </Text>
          ) : null
        }
      />

      <BottomSheetModal
        visible={formVisible}
        onClose={() => {
          setFormVisible(false);
          resetForm();
        }}
        onSave={handleSubmit}
        canSave={formCanSave}
        title={editingId ? 'Edit Category' : 'Add Category'}
        saveLabel={editingId ? 'Save' : 'Add'}>
        <Text style={[styles.label, { color: colors.text }]}>Name</Text>
        <TextInput
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
          ]}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Groceries"
          placeholderTextColor={colors.textSecondary}
        />
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 14,
  },
  addButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 4,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
  },
  list: {
    marginTop: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  rowName: {
    flex: 1,
    fontSize: scaleFont(15),
    fontWeight: '600',
  },
  rowActions: {
    flexDirection: 'row',
    gap: 10,
  },
  iconButton: {
    padding: 6,
  },
  reservedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reservedBadgeText: {
    fontSize: scaleFont(10.5),
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  footerHint: {
    fontSize: scaleFont(12.5),
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 8,
    lineHeight: scaleFont(18),
  },
});

export default CategoriesScreen;
