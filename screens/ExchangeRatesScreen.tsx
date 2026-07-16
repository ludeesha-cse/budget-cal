import React, { useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Info, RotateCcw } from 'lucide-react-native';
import Card from '../components/Card';
import EmptyState from '../components/common/EmptyState';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from '../components/NumericInputAccessory';
import { useTheme } from '../contexts/ThemeContext';
import { scaleFont, typography } from '../theme/typography';
import { useAsyncAction } from '../hooks/useAsyncAction';
import {
  useExchangeRates,
  useResetExchangeRate as useResetExchangeRateMutation,
  useSetExchangeRate as useSetExchangeRateMutation,
} from '../hooks/queries';
import type { ExchangeRateListRow } from '../hooks/queries';
import { ANCHOR_CURRENCY_CODE } from '../config/exchangeRates';

// The rates cross-currency transfers convert with.
//
// Every rate is expressed against one anchor currency, so six currencies
// need six numbers rather than thirty pairwise ones — "1 USD = 340 LKR"
// and "1 GBP = 425 LKR" together already say what a USD→GBP transfer
// should pre-fill. See config/exchangeRates.ts for the arithmetic.
//
// Editing a rate NEVER changes a transfer that already happened. Past
// transfers store the two amounts that were actually agreed, and nothing
// recomputes them from a rate — so this screen is safe to correct at any
// time without rewriting history.
function ExchangeRatesScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const runAction = useAsyncAction();
  const setExchangeRate = useSetExchangeRateMutation();
  const resetExchangeRate = useResetExchangeRateMutation();
  const { data: rates, isPending } = useExchangeRates();

  // Which row is being edited, and its in-progress text. Only one at a
  // time, matching the inline-edit pattern the other settings lists use.
  const [editingCurrencyId, setEditingCurrencyId] = useState<number | null>(
    null,
  );
  const [draftRate, setDraftRate] = useState('');

  const startEdit = (row: ExchangeRateListRow) => {
    setEditingCurrencyId(row.currencyId);
    setDraftRate(row.ratePerAnchor > 0 ? String(row.ratePerAnchor) : '');
  };

  const cancelEdit = () => {
    setEditingCurrencyId(null);
    setDraftRate('');
  };

  const saveEdit = (row: ExchangeRateListRow) => {
    const parsed = Number(draftRate);
    runAction(async () => {
      await setExchangeRate(row.currencyId, parsed);
      setEditingCurrencyId(null);
      setDraftRate('');
    }, 'Could not save rate');
  };

  const handleReset = (row: ExchangeRateListRow) => {
    runAction(async () => {
      await resetExchangeRate(row.currencyId);
      setEditingCurrencyId(null);
    }, 'Could not reset rate');
  };

  const renderRow = (row: ExchangeRateListRow) => {
    const isEditing = editingCurrencyId === row.currencyId;
    const draftValid = Number(draftRate) > 0 && !Number.isNaN(Number(draftRate));

    return (
      <Card colors={colors} style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={[styles.code, { color: colors.text }]}>
              {row.currencyCode}
              {row.isCustom && (
                <Text style={[styles.customTag, { color: colors.primary }]}>
                  {'  '}edited
                </Text>
              )}
            </Text>
            <Text style={[styles.name, { color: colors.textSecondary }]}>
              {row.currencyName}
            </Text>
          </View>
          {!isEditing && (
            <Text
              style={[typography.amountMono, styles.rate, { color: colors.text }]}>
              {row.ratePerAnchor > 0 ? row.ratePerAnchor : '—'}
            </Text>
          )}
        </View>

        {/* The anchor is 1 by definition — it is what every other rate is
            measured against, so there is nothing here to edit. */}
        {row.isAnchor ? (
          <Text style={[styles.help, { color: colors.textSecondary }]}>
            The base currency every other rate is measured against.
          </Text>
        ) : isEditing ? (
          <>
            <Text style={[styles.help, { color: colors.textSecondary }]}>
              How many {ANCHOR_CURRENCY_CODE} one {row.currencyCode} is worth.
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  borderColor: colors.border,
                  color: colors.text,
                  backgroundColor: colors.surface,
                },
              ]}
              value={draftRate}
              onChangeText={setDraftRate}
              keyboardType="numeric"
              returnKeyType="done"
              inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
              autoFocus
            />
            <View style={styles.actions}>
              <Pressable
                style={[styles.pill, { borderColor: colors.border }]}
                onPress={cancelEdit}>
                <Text style={[styles.pillText, { color: colors.text }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.pillSolid,
                  {
                    backgroundColor: draftValid
                      ? colors.primary
                      : colors.neutralSoft,
                  },
                ]}
                disabled={!draftValid}
                onPress={() => saveEdit(row)}>
                <Text
                  style={[
                    styles.pillText,
                    {
                      color: draftValid ? colors.primaryText : colors.textSecondary,
                    },
                  ]}>
                  Save
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.help, { color: colors.textSecondary }]}>
              {row.ratePerAnchor > 0
                ? `1 ${row.currencyCode} = ${row.ratePerAnchor} ${ANCHOR_CURRENCY_CODE}`
                : `No rate set — transfers into or out of ${row.currencyCode} will ask you to type the converted amount.`}
            </Text>
            <View style={styles.actions}>
              <Pressable
                style={[styles.pill, { borderColor: colors.border }]}
                onPress={() => startEdit(row)}>
                <Text style={[styles.pillText, { color: colors.text }]}>
                  {row.ratePerAnchor > 0 ? 'Edit rate' : 'Set rate'}
                </Text>
              </Pressable>
              {row.isCustom && row.defaultRatePerAnchor != null && (
                <Pressable
                  style={[styles.pill, { borderColor: colors.border }]}
                  onPress={() => handleReset(row)}>
                  <RotateCcw size={12} color={colors.textSecondary} />
                  <Text style={[styles.pillText, { color: colors.text }]}>
                    {'  '}Reset to {row.defaultRatePerAnchor}
                  </Text>
                </Pressable>
              )}
            </View>
          </>
        )}
      </Card>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.infoBanner, { backgroundColor: colors.primarySoft }]}>
        <Info size={14} color={colors.primary} />
        <Text style={[styles.infoBannerText, { color: colors.text }]}>
          These rates only pre-fill the converted amount when you transfer
          between two currencies — you can always change that amount before
          saving. Editing a rate here never changes a transfer you've already
          made.
        </Text>
      </View>

      {isPending ? (
        <EmptyState message="Loading..." />
      ) : (
        <FlatList
          data={rates ?? []}
          keyExtractor={item => String(item.currencyId)}
          renderItem={({ item }) => renderRow(item)}
          ListEmptyComponent={
            <EmptyState message="No active currencies to set rates for." />
          }
        />
      )}

      <NumericInputAccessory />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  infoBannerText: {
    flex: 1,
    fontSize: scaleFont(12.5),
    lineHeight: scaleFont(18),
  },
  card: {
    padding: 14,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  code: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  customTag: {
    fontSize: scaleFont(11),
    fontWeight: '600',
  },
  name: {
    fontSize: scaleFont(12.5),
    marginTop: 2,
  },
  rate: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  help: {
    fontSize: scaleFont(12),
    lineHeight: scaleFont(17),
    marginTop: 8,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: scaleFont(16),
    marginTop: 6,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  pillSolid: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  pillText: {
    fontSize: scaleFont(12.5),
    fontWeight: '600',
  },
});

export default ExchangeRatesScreen;
