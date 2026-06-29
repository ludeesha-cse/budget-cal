import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react-native';
import Card from '../components/Card';
import BottomSheetModal from '../components/BottomSheetModal';
import EmptyState from '../components/common/EmptyState';
import ActionButtons from '../components/common/ActionButtons';
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
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useEntityFormModal } from '../hooks/useEntityFormModal';

type CategoryRow = Awaited<ReturnType<typeof getCategories>>[number];

function CategoriesScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const confirmDelete = useConfirmDelete();
  const runAction = useAsyncAction();
  const { tier } = useEntitlement();
  const { openPaywall } = usePaywall();
  const [categories, setCategories] = useState<CategoryRow[]>([]);

  const load = useCallback(async () => {
    const rows = await getCategories();
    setCategories(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const {
    visible: formVisible,
    editingId,
    values: name,
    setValues: setName,
    canSave: formCanSave,
    openAdd: handleAddPress,
    openEdit: handleEditPress,
    close: closeForm,
    submit: handleSubmit,
    setVisible,
    notifyFullyClosed,
    waitForFullyClosed,
  } = useEntityFormModal<CategoryRow, string, string>({
    initialValues: '',
    populateFromRow: category => category.name,
    validate: value => (value.trim() === '' ? 'Enter a name.' : null),
    toParams: value => value.trim(),
    // Editing an existing category is never gated — see the same rule
    // applied in AccountsScreen. Only the create path below checks the
    // entitlement.
    onUpdate: (id, trimmedName) => updateCategory(id, trimmedName),
    onCreate: async trimmedName => {
      const userCategoryCount = await getUserCategoryCount();
      const check = canAddCategory(userCategoryCount, tier);
      if (check.allowed) {
        await addCategory(trimmedName);
        return;
      }
      // Hide this screen's own form popup first — showing PaywallModal's
      // <Modal> while this one is still visible=true is what freezes
      // iOS solid (two native Modals open at once never finishes
      // presenting there; Android tolerates it). onDismiss restores the
      // form, still filled in, if the user backs out without buying.
      // This promise deliberately never resolves in the dismiss case —
      // the hook's submit() only closes the sheet and reloads once
      // onCreate resolves, so a decline must leave both untouched.
      //
      // setVisible(false) alone isn't enough: BottomSheetModal keeps its
      // native Modal mounted until it actually finishes tearing itself
      // down, so opening the paywall immediately here can still overlap
      // two native Modals — iOS silently drops the second Modal's
      // presentation when that happens, with no error to log (see
      // useInstallmentForm's own onCreate, where this was actually
      // reproduced). waitForFullyClosed() resolves only once
      // BottomSheetModal's onFullyClosed below confirms the native Modal
      // is really gone.
      setVisible(false);
      await waitForFullyClosed();
      await new Promise<void>(resolve => {
        openPaywall({
          reason: check.reason ?? 'Additional categories require Premium.',
          onPurchaseSuccess: async () => {
            await addCategory(trimmedName);
            resolve();
          },
          onDismiss: () => setVisible(true),
        });
      });
    },
    onSaved: load,
    errorTitle: 'Cannot save category',
  });

  const handleDelete = (id: number) => {
    confirmDelete(
      'Delete category',
      'Are you sure you want to delete this category?',
      'Delete',
      () =>
        runAction(async () => {
          await deleteCategory(id);
          await load();
        }, 'Cannot delete category'),
    );
  };

  const hasReserved = categories.some(c => c.isSystemReserved);

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
                <ActionButtons
                  variant="icon"
                  items={[
                    { key: 'edit', icon: Pencil, tone: 'primary', onPress: () => handleEditPress(item) },
                    { key: 'delete', icon: Trash2, tone: 'danger', onPress: () => handleDelete(item.id) },
                  ]}
                />
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
        onClose={closeForm}
        onSave={handleSubmit}
        canSave={formCanSave}
        title={editingId ? 'Edit Category' : 'Add Category'}
        saveLabel={editingId ? 'Save' : 'Add'}
        onFullyClosed={notifyFullyClosed}>
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
