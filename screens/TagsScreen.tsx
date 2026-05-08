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
import { addTag, deleteTag, getTags, updateTag } from '../db/queries';
import { useTheme } from '../contexts/ThemeContext';

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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {formVisible ? (
        <View style={styles.form}>
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
        <Button title="Add Tag" color={colors.primary} onPress={handleAddPress} />
      )}

      <FlatList
        style={styles.list}
        data={tags}
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
                onPress={() => handleDelete(item)}
              />
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            No tags yet.
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

export default TagsScreen;
