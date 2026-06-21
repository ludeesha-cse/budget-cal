import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronRight, Crown, Plus, Trash2 } from 'lucide-react-native';
import Card from '../components/Card';
import BottomSheetModal from '../components/BottomSheetModal';
import EmptyState from '../components/common/EmptyState';
import {
  addCurrency,
  deleteCurrency,
  getCurrencies,
  setCurrencyActive,
  setDefaultCurrency,
} from '../db/queries';
import { useTheme } from '../contexts/ThemeContext';
import { scaleFont, typography } from '../theme/typography';
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useEntityFormModal } from '../hooks/useEntityFormModal';

// Lists ENABLED currencies and lets the user enable a disabled one or add
// a brand-new one; the seeded default currency is flagged with a badge
// and can't be disabled or added again. Every picker/tab elsewhere in the
// app (budgets, transactions, reports, ...) only ever shows currencies
// enabled here — see getActiveCurrencies() in db/queries/currencies.ts.
type CurrencyRow = Awaited<ReturnType<typeof getCurrencies>>[number];

type CurrencyFormValues = { code: string; name: string };

function CurrenciesScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const confirmDelete = useConfirmDelete();
  const runAction = useAsyncAction();
  // Always the FULL list (active + disabled) — this screen is the one
  // place in the app that needs both, so it can list disabled currencies
  // as re-enable candidates in the "Add Currency" sheet below.
  const [allCurrencies, setAllCurrencies] = useState<CurrencyRow[]>([]);
  // Separate from the "add a brand-new currency" form sheet (below) — this
  // is the picker that opens first when "Add Currency" is tapped, listing
  // every currency that already exists but isn't enabled yet.
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

  const {
    visible: formVisible,
    values,
    setValues,
    canSave: formCanSave,
    openAdd: openNewCurrencyForm,
    close: closeForm,
    submit: handleSubmit,
  } = useEntityFormModal<CurrencyRow, CurrencyFormValues, CurrencyFormValues>({
    initialValues: { code: '', name: '' },
    // Never actually invoked — this screen is add-only (no edit path,
    // hence no onUpdate below), so openEdit is never called. Still
    // required by the hook's type.
    populateFromRow: currency => ({ code: currency.code, name: currency.name }),
    validate: v =>
      v.code.trim() === '' || v.name.trim() === ''
        ? 'Enter a currency code and name.'
        : null,
    toParams: v => ({ code: v.code.trim().toUpperCase(), name: v.name.trim() }),
    onCreate: params => addCurrency(params.code, params.name),
    onUpdate: undefined,
    onSaved: load,
    errorTitle: 'Cannot add currency',
  });

  const handleSetDefault = async (currencyId: number) => {
    await runAction(async () => {
      await setDefaultCurrency(currencyId);
      await load();
    }, 'Cannot set default currency');
  };

  // Soft, reversible opt-out — the currency row itself, and any past data
  // in it, is untouched. It just stops appearing in this screen's active
  // list and in every picker/tab across the app until re-enabled from the
  // "Add Currency" sheet below.
  const handleDisable = (currencyId: number) => {
    runAction(async () => {
      await setCurrencyActive(currencyId, false);
      await load();
    }, 'Cannot disable currency');
  };

  const handleEnable = (currencyId: number) => {
    runAction(async () => {
      await setCurrencyActive(currencyId, true);
      await load();
      setPickerVisible(false);
    }, 'Cannot enable currency');
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

      <BottomSheetModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        title="Add Currency">
        {disabledCurrencies.length > 0 ? (
          <>
            <Text
              style={[
                typography.eyebrow,
                styles.pickerSectionLabel,
                { color: colors.textSecondary },
              ]}>
              ENABLE AN EXISTING CURRENCY
            </Text>
            {disabledCurrencies.map(currency => (
              <Pressable
                key={currency.id}
                style={[styles.pickerRow, { borderColor: colors.border }]}
                onPress={() => handleEnable(currency.id)}>
                <View style={styles.rowDetails}>
                  <Text style={[styles.rowCode, { color: colors.text }]}>
                    {currency.code}
                  </Text>
                  <Text style={{ color: colors.textSecondary }}>{currency.name}</Text>
                </View>
                <Plus size={18} color={colors.primary} strokeWidth={2.5} />
              </Pressable>
            ))}
          </>
        ) : (
          <Text style={{ color: colors.textSecondary }}>
            Every currency this app knows about is already enabled.
          </Text>
        )}

        <Pressable
          style={[styles.newCurrencyRow, { borderColor: colors.border }]}
          onPress={() => {
            setPickerVisible(false);
            openNewCurrencyForm();
          }}>
          <Text style={[styles.actionLink, { color: colors.primary }]}>
            + Add a brand-new currency
          </Text>
          <ChevronRight size={16} color={colors.primary} />
        </Pressable>
      </BottomSheetModal>

      <BottomSheetModal
        visible={formVisible}
        onClose={closeForm}
        onSave={handleSubmit}
        canSave={formCanSave}
        title="Add a New Currency"
        saveLabel="Add">
        <Text style={[styles.label, { color: colors.text }]}>Code</Text>
        <TextInput
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
          ]}
          value={values.code}
          onChangeText={text => setValues(v => ({ ...v, code: text }))}
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
          value={values.name}
          onChangeText={text => setValues(v => ({ ...v, name: text }))}
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
  pickerSectionLabel: {
    marginBottom: 8,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  newCurrencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 4,
  },
});

export default CurrenciesScreen;
