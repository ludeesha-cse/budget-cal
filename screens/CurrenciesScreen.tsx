import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Crown, Plus } from 'lucide-react-native';
import Card from '../components/Card';
import EmptyState from '../components/common/EmptyState';
import AddCurrencySheets from '../components/currencies/AddCurrencySheets';
import { useTheme } from '../contexts/ThemeContext';
import { scaleFont } from '../theme/typography';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useEntitlement } from '../hooks/useEntitlement';
import { usePaywall } from '../contexts/PaywallContext';
import { useAllCurrencies } from '../hooks/queries';
import {
  useSetCurrencyActive as useSetCurrencyActiveMutation,
  useSetDefaultCurrency as useSetDefaultCurrencyMutation,
} from '../hooks/queries';
import { FAB_CLEARANCE } from '../theme/layout';

function CurrenciesScreen(): React.JSX.Element {
  // Write paths go through the caching layer's mutation hooks: each
  // one runs the same db/queries function as before and then
  // invalidates every query its write can affect (see
  // hooks/queries/invalidation.ts). The call sites below are
  // unchanged — these hooks take the wrapped function's own arguments.
  const setCurrencyActive = useSetCurrencyActiveMutation();
  const setDefaultCurrency = useSetDefaultCurrencyMutation();
  const { colors } = useTheme();
  const runAction = useAsyncAction();
  const { tier } = useEntitlement();
  const { openPaywall } = usePaywall();
  const [pickerVisible, setPickerVisible] = useState(false);
  // Was a getCurrencies() read on every screen focus; now the shared
  // reference-cached roster. Every write on this screen goes through a
  // mutation that invalidates it, so the list is still correct the
  // instant a currency is added, disabled, deleted or made default.
  const { data: allCurrencies } = useAllCurrencies();

  const activeCurrencies = useMemo(
    () => (allCurrencies ?? []).filter(c => c.active),
    [allCurrencies],
  );
  const disabledCurrencies = useMemo(
    () => (allCurrencies ?? []).filter(c => !c.active),
    [allCurrencies],
  );

  const handleSetDefault = async (currencyId: number) => {
    await runAction(async () => {
      await setDefaultCurrency(currencyId);
      // No load() here any more: the mutation above already
      // invalidated every query this write affects, and awaiting it
      // waits for those refetches — a second read would be redundant.
    }, 'Cannot set default currency');
  };

  const handleDisable = (currencyId: number) => {
    runAction(async () => {
      await setCurrencyActive(currencyId, false);
      // No load() here any more: the mutation above already
      // invalidated every query this write affects, and awaiting it
      // waits for those refetches — a second read would be redundant.
    }, 'Cannot disable currency');
  };

  // DELETING A CURRENCY IS NO LONGER OFFERED, and that is the whole
  // feature rather than an omission. A currency is referenced by account
  // balances, transactions, budgets, transfers, loans, installments,
  // savings goals and now its own exchange rate — so in any database
  // that has actually been used, the delete either fails on a foreign
  // key or would have to cascade through the user's entire financial
  // history to succeed. Neither is something a settings screen should
  // do. Disabling is the supported answer: it removes the currency from
  // every picker and tab in the app while leaving the records that
  // reference it intact and readable. (The default currency cannot even
  // be disabled — the app always needs one usable currency; set another
  // as default first.)
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
        contentContainerStyle={styles.listContent}
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
        entitlement={{
          activeCurrencyCount: activeCurrencies.length,
          tier,
          openPaywall,
        }}
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
  // Lets the last row scroll out from under the FAB.
  listContent: {
    paddingBottom: FAB_CLEARANCE,
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
