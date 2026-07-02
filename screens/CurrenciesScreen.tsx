import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Crown, Plus, Trash2 } from 'lucide-react-native';
import Card from '../components/Card';
import EmptyState from '../components/common/EmptyState';
import AddCurrencySheets from '../components/currencies/AddCurrencySheets';
import {
  deleteCurrency,
  getCurrencies,
  setCurrencyActive,
  setDefaultCurrency,
} from '../db/queries';
import { useTheme } from '../contexts/ThemeContext';
import { scaleFont } from '../theme/typography';
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { useAsyncAction } from '../hooks/useAsyncAction';

type CurrencyRow = Awaited<ReturnType<typeof getCurrencies>>[number];

function CurrenciesScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const confirmDelete = useConfirmDelete();
  const runAction = useAsyncAction();
  const [allCurrencies, setAllCurrencies] = useState<CurrencyRow[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);

  const load = useCallback(async () => {
    const rows = await getCurrencies();
    setAllCurrencies(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const activeCurrencies = useMemo(
    () => allCurrencies.filter(c => c.active),
    [allCurrencies],
  );
  const disabledCurrencies = useMemo(
    () => allCurrencies.filter(c => !c.active),
    [allCurrencies],
  );

  const handleSetDefault = async (currencyId: number) => {
    await runAction(async () => {
      await setDefaultCurrency(currencyId);
      await load();
    }, 'Cannot set default currency');
  };

  const handleDisable = (currencyId: number) => {
    runAction(async () => {
      await setCurrencyActive(currencyId, false);
      await load();
    }, 'Cannot disable currency');
  };

  const handleDelete = (currencyId: number, currencyCode: string) => {
    confirmDelete(
      'Delete currency',
      `Are you sure you want to delete ${currencyCode}?`,
      'Delete',
      () =>
        runAction(async () => {
          await deleteCurrency(currencyId);
          await load();
        }, 'Cannot delete currency'),
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Pressable
        style={[styles.addButton, { borderColor: colors.primary }]}
        onPress={() => setPickerVisible(true)}>
        <Plus size={16} color={colors.primary} strokeWidth={2.5} />
        <Text style={[styles.addButtonText, { color: colors.primary }]}>
          Add Currency
        </Text>
      </Pressable>

      <FlatList
        style={styles.list}
        data={activeCurrencies}
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
                  <Text style={[styles.actionLink, { color: colors.primary }]}>
                    Set Default
                  </Text>
                </Pressable>
                <Pressable onPress={() => handleDisable(item.id)}>
                  <Text style={[styles.actionLink, { color: colors.textSecondary }]}>
                    Disable
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
          <EmptyState message="No currencies enabled." />
        }
      />

      <AddCurrencySheets
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        disabledCurrencies={disabledCurrencies}
        onChanged={load}
      />
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
  actionLink: {
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
