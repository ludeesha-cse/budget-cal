import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Crown, Plus, Trash2 } from 'lucide-react-native';
import Card from '../components/Card';
import BottomSheetModal from '../components/BottomSheetModal';
import EmptyState from '../components/common/EmptyState';
import {
  addCurrency,
  deleteCurrency,
  getCurrencies,
  setDefaultCurrency,
} from '../db/queries';
import { useTheme } from '../contexts/ThemeContext';
import { scaleFont } from '../theme/typography';
import { useConfirmDelete } from '../hooks/useConfirmDelete';

// Lists existing currencies and lets the user add new ones; the seeded
// default currency is flagged with a badge and can't be added again.
type CurrencyRow = Awaited<ReturnType<typeof getCurrencies>>[number];

function CurrenciesScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const confirmDelete = useConfirmDelete();
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
    confirmDelete(
      'Delete currency',
      `Are you sure you want to delete ${currencyCode}?`,
      'Delete',
      async () => {
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
    );
  };

  const formCanSave = code.trim() !== '' && name.trim() !== '';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Pressable
        style={[styles.addButton, { borderColor: colors.primary }]}
        onPress={handleAddPress}>
        <Plus size={16} color={colors.primary} strokeWidth={2.5} />
        <Text style={[styles.addButtonText, { color: colors.primary }]}>
          Add Currency
        </Text>
      </Pressable>

      <FlatList
        style={styles.list}
        data={currencies}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <Card colors={colors} style={styles.row}>
            <View style={[styles.codeBadge, { backgroundColor: colors.neutralSoft }]}>
              <Text style={[styles.codeBadgeText, { color: colors.text }]}>
                {item.code.slice(0, 2)}
              </Text>
            </View>
            <View style={styles.rowDetails}>
              <Text style={[styles.rowCode, { color: colors.text }]}>
                {item.code}
              </Text>
              <Text style={{ color: colors.textSecondary }}>{item.name}</Text>
            </View>
            {item.isDefault ? (
              <View style={[styles.defaultBadge, { backgroundColor: colors.primarySoft }]}>
                <Crown size={12} color={colors.primary} />
                <Text style={[styles.defaultBadgeText, { color: colors.primary }]}>
                  Default
                </Text>
              </View>
            ) : (
              <View style={styles.rowActions}>
                <Pressable onPress={() => handleSetDefault(item.id)}>
                  <Text style={[styles.setDefaultLink, { color: colors.primary }]}>
                    Set Default
                  </Text>
                </Pressable>
                <Pressable
                  hitSlop={8}
                  style={styles.iconButton}
                  onPress={() => handleDelete(item.id, item.code)}>
                  <Trash2 size={16} color={colors.danger} />
                </Pressable>
              </View>
            )}
          </Card>
        )}
        ListEmptyComponent={
          <EmptyState message="No currencies yet." />
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
        title="Add Currency"
        saveLabel="Add">
        <Text style={[styles.label, { color: colors.text }]}>Code</Text>
        <TextInput
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
          ]}
          value={code}
          onChangeText={setCode}
          placeholder="e.g. JPY"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="characters"
        />

        <Text style={[styles.label, { color: colors.text }]}>Name</Text>
        <TextInput
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
          ]}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Japanese Yen"
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
  codeBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  codeBadgeText: {
    fontSize: scaleFont(12),
    fontWeight: '700',
  },
  rowDetails: {
    flex: 1,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowCode: {
    fontWeight: '600',
  },
  setDefaultLink: {
    fontSize: scaleFont(13),
    fontWeight: '700',
  },
  iconButton: {
    padding: 4,
  },
  defaultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  defaultBadgeText: {
    fontSize: scaleFont(12),
    fontWeight: '700',
  },
});

export default CurrenciesScreen;
