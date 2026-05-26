import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Pencil, Plus, Tag as TagIcon, Trash2 } from 'lucide-react-native';
import Card from '../components/Card';
import BottomSheetModal from '../components/BottomSheetModal';
import EmptyState from '../components/common/EmptyState';
import { addTag, deleteTag, getTags, updateTag } from '../db/queries';
import { useTheme } from '../contexts/ThemeContext';
import { scaleFont } from '../theme/typography';

type TagRow = Awaited<ReturnType<typeof getTags>>[number];

// Same shape as CategoriesScreen (Stage 5b) for consistency — the only
// real difference is there's no entitlement gate here, since tags are a
// free-tier feature (Stage 15 spec) unlike categories.
function TagsScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const [tags, setTags] = useState<TagRow[]>([]);
  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    const rows = await getTags();
    setTags(rows);
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

  const handleEditPress = (tag: TagRow) => {
    setEditingId(tag.id);
    setName(tag.name);
    setFormVisible(true);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      return;
    }
    try {
      if (editingId) {
        await updateTag(editingId, name.trim());
      } else {
        await addTag(name.trim());
      }
      setFormVisible(false);
      resetForm();
      load();
    } catch (error) {
      Alert.alert(
        'Cannot save tag',
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const handleDelete = (tag: TagRow) => {
    Alert.alert(
      'Delete tag',
      // Explicit about what survives — a tag can be applied to many
      // transactions, and deleting it must never be mistaken for
      // deleting the transactions it's attached to.
      `Delete "${tag.name}"? Any transactions tagged with it will keep their other tags and are never deleted. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTag(tag.id);
              load();
            } catch (error) {
              Alert.alert(
                'Cannot delete tag',
                error instanceof Error ? error.message : String(error),
              );
            }
          },
        },
      ],
    );
  };

  const formCanSave = name.trim() !== '';

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
                onPress={() => handleDelete(item)}>
                <Trash2 size={16} color={colors.danger} />
              </Pressable>
            </View>
          </Card>
        )}
        ListEmptyComponent={
          <EmptyState message="No tags yet." />
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
  rowActions: {
    flexDirection: 'row',
    gap: 10,
  },
  iconButton: {
    padding: 6,
  },
});

export default TagsScreen;
