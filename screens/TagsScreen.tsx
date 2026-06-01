import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Pencil, Plus, Tag as TagIcon, Trash2 } from 'lucide-react-native';
import Card from '../components/Card';
import BottomSheetModal from '../components/BottomSheetModal';
import EmptyState from '../components/common/EmptyState';
import ActionButtons from '../components/common/ActionButtons';
import { addTag, deleteTag, getTags, updateTag } from '../db/queries';
import { useTheme } from '../contexts/ThemeContext';
import { scaleFont } from '../theme/typography';
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useEntityFormModal } from '../hooks/useEntityFormModal';

type TagRow = Awaited<ReturnType<typeof getTags>>[number];

// Same shape as CategoriesScreen (Stage 5b) for consistency — the only
// real difference is there's no entitlement gate here, since tags are a
// free-tier feature (Stage 15 spec) unlike categories.
function TagsScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const confirmDelete = useConfirmDelete();
  const runAction = useAsyncAction();
  const [tags, setTags] = useState<TagRow[]>([]);

  const load = useCallback(async () => {
    const rows = await getTags();
    setTags(rows);
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
  } = useEntityFormModal<TagRow, string, string>({
    initialValues: '',
    populateFromRow: tag => tag.name,
    validate: value => (value.trim() === '' ? 'Enter a name.' : null),
    toParams: value => value.trim(),
    onCreate: trimmedName => addTag(trimmedName),
    onUpdate: (id, trimmedName) => updateTag(id, trimmedName),
    onSaved: load,
    errorTitle: 'Cannot save tag',
  });

  const handleDelete = (tag: TagRow) => {
    // Explicit about what survives — a tag can be applied to many
    // transactions, and deleting it must never be mistaken for
    // deleting the transactions it's attached to.
    confirmDelete(
      'Delete tag',
      `Delete "${tag.name}"? Any transactions tagged with it will keep their other tags and are never deleted. This cannot be undone.`,
      'Delete',
      () =>
        runAction(async () => {
          await deleteTag(tag.id);
          await load();
        }, 'Cannot delete tag'),
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Pressable
        style={[styles.addButton, { borderColor: colors.primary }]}
        onPress={handleAddPress}>
        <Plus size={16} color={colors.primary} strokeWidth={2.5} />
        <Text style={[styles.addButtonText, { color: colors.primary }]}>
          Add Tag
        </Text>
      </Pressable>

      <FlatList
        style={styles.list}
        data={tags}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <Card colors={colors} style={styles.row}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primarySoft }]}>
              <TagIcon size={16} color={colors.primary} />
            </View>
            <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            <ActionButtons
              variant="icon"
              items={[
                { key: 'edit', icon: Pencil, tone: 'primary', onPress: () => handleEditPress(item) },
                { key: 'delete', icon: Trash2, tone: 'danger', onPress: () => handleDelete(item) },
              ]}
            />
          </Card>
        )}
        ListEmptyComponent={
          <EmptyState message="No tags yet." />
        }
      />

      <BottomSheetModal
        visible={formVisible}
        onClose={closeForm}
        onSave={handleSubmit}
        canSave={formCanSave}
        title={editingId ? 'Edit Tag' : 'Add Tag'}
        saveLabel={editingId ? 'Save' : 'Add'}>
        <Text style={[styles.label, { color: colors.text }]}>Name</Text>
        <TextInput
          style={[
            styles.input,
            {
              borderColor: colors.border,
              color: colors.text,
              backgroundColor: colors.surface,
            },
          ]}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Reimbursable"
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
  list: {
    marginTop: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 10,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowName: {
    flex: 1,
    fontSize: scaleFont(15),
    fontWeight: '600',
  },
});

export default TagsScreen;
