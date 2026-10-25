import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { RotateCcw } from 'lucide-react-native';
import Card from '../components/Card';
import EmptyState from '../components/common/EmptyState';
import InfoBanner from '../components/common/InfoBanner';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from '../components/NumericInputAccessory';
import { useTheme } from '../contexts/ThemeContext';
import { fieldErrorStyle } from '../utils/formFieldStyle';
import { checkAmount } from '../utils/amountValidation';
import FieldErrorText from '../components/common/FieldErrorText';
import { scaleFont, typography } from '../theme/typography';
import { useAsyncAction } from '../hooks/useAsyncAction';
import {
  useExchangeRates,
  useResetExchangeRate as useResetExchangeRateMutation,
  useSetExchangeRate as useSetExchangeRateMutation,
} from '../hooks/queries';
import type { ExchangeRateListRow } from '../hooks/queries';
import { useKeyboardOverlap } from '../hooks/useKeyboardOverlap';
import { FAB_CLEARANCE } from '../theme/layout';

// Roughly one expanded, in-edit row: how much of the list has to stay
// scrollable past the end so any row can reach the top of the visible
// area while the keyboard is up.
const EDIT_ROW_HEADROOM = 180;
// Long enough for the keyboard animation and the footer spacer's layout
// to have settled, so the scroll lands where it is asked to.
const EDIT_SCROLL_MS = 320;

// The rates cross-currency transfers convert with.
//
// EVERY RATE IS PHRASED AGAINST THE USER'S DEFAULT CURRENCY: each row
// answers "how many of this does 1 <default> buy?". With USD as the
// default, EUR reads 0.86 and LKR reads 340. That means six currencies
// need six numbers rather than thirty pairwise ones — knowing what 1 USD
// buys in EUR and in LKR already says what a EUR→LKR transfer should
// pre-fill. See config/exchangeRates.ts for the arithmetic.
//
// The default currency's own row is fixed at 1 and cannot be edited: it
// is the unit the others are measured in, not a rate anyone chose.
// Changing which currency is the default re-expresses every rate against
// the new one (see rescaleRatesToDefaultWithin) — the numbers on this
// screen move, but no conversion changes meaning, because every pair
// ratio is preserved.
//
// Editing a rate NEVER changes a transfer that already happened. Past
// transfers store the two amounts that were actually agreed, and nothing
// recomputes them from a rate — so this screen is safe to correct at any
// time without rewriting history.
function ExchangeRatesScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const runAction = useAsyncAction();
  const [rateMessage, setRateMessage] = useState<string | null>(null);
  const setExchangeRate = useSetExchangeRateMutation();
  const resetExchangeRate = useResetExchangeRateMutation();
  const { data: rates, isPending } = useExchangeRates();
  // The row flagged isAnchor IS the default currency — used for the
  // "how many X does 1 <default> buy" wording throughout.
  const anchorCode =
    (rates ?? []).find(row => row.isAnchor)?.currencyCode ?? '';

  // Which row is being edited, and its in-progress text. Only one at a
  // time, matching the inline-edit pattern the other settings lists use.
  const [editingCurrencyId, setEditingCurrencyId] = useState<number | null>(
    null,
  );
  const [draftRate, setDraftRate] = useState('');
  // Whether the user has pressed Save on an empty or nonsensical rate —
  // the same muted-but-pressable pattern every form in the app uses (see
  // hooks/useFieldErrors), inlined here because this is a single field
  // rather than a form worth a hook.
  const [rateErrorShown, setRateErrorShown] = useState(false);

  // The rows are edited IN PLACE rather than in a sheet, so this screen
  // needs the same keyboard treatment BottomSheetModal gets, just built
  // out of a FlatList's own parts: a footer spacer instead of extra
  // content padding, and scrollToIndex instead of scrollTo. See
  // hooks/useKeyboardOverlap for why nothing moves on its own any more.
  const { hostRef, overlap, keyboardVisible } = useKeyboardOverlap();
  const listRef = useRef<FlatList<ExchangeRateListRow>>(null);
  const [listHeight, setListHeight] = useState(0);
  const visibleListHeight = listHeight - overlap;
  // Clears the keyboard, and then leaves enough room below the last row
  // for ANY row — including that last one — to be scrolled up to the top
  // of what's still visible.
  // With the keyboard down it only has to let the last row scroll out
  // from under the FAB (which is hidden while the keyboard is up).
  const footerHeight = keyboardVisible
    ? overlap + Math.max(0, visibleListHeight - EDIT_ROW_HEADROOM)
    : FAB_CLEARANCE;

  // Opening a row for editing autofocuses its field, which raises the
  // keyboard over the bottom of the list — so put that row at the top of
  // what's left. Waits for the keyboard's animation, since the scroll
  // offset it needs depends on the footer above having been laid out.
  useEffect(() => {
    if (!keyboardVisible || editingCurrencyId == null) {
      return;
    }
    const index = (rates ?? []).findIndex(
      row => row.currencyId === editingCurrencyId,
    );
    if (index < 0) {
      return;
    }
    const timer = setTimeout(() => {
      listRef.current?.scrollToIndex({
        index,
        viewPosition: 0,
        animated: true,
      });
    }, EDIT_SCROLL_MS);
    return () => clearTimeout(timer);
  }, [keyboardVisible, overlap, editingCurrencyId, rates]);

  const startEdit = (row: ExchangeRateListRow) => {
    setEditingCurrencyId(row.currencyId);
    setDraftRate(row.ratePerAnchor > 0 ? String(row.ratePerAnchor) : '');
    setRateErrorShown(false);
    setRateMessage(null);
  };

  const cancelEdit = () => {
    setEditingCurrencyId(null);
    setDraftRate('');
    setRateErrorShown(false);
  };

  const saveEdit = (row: ExchangeRateListRow) => {
    // A rate has to be a positive number: zero or negative would make
    // every conversion through this currency either Infinity or a
    // negative amount. Blank is outlined; a wrong value is explained.
    const check = checkAmount(draftRate);
    if (check.kind === 'blank') {
      setRateErrorShown(true);
      return;
    }
    if (check.kind === 'invalid') {
      setRateMessage(
        check.message === 'Enter an amount greater than 0'
          ? 'Enter a rate greater than 0'
          : check.message,
      );
      return;
    }
    const parsed = check.value;
    runAction(async () => {
      await setExchangeRate(row.currencyId, parsed);
      setEditingCurrencyId(null);
      setDraftRate('');
      setRateErrorShown(false);
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

        {/* The default currency is 1 by definition — it is what every
            other rate is measured against, so there is nothing here to
            edit. */}
        {row.isAnchor ? (
          <Text style={[styles.help, { color: colors.textSecondary }]}>
            Your default currency — every rate below is measured in it.
          </Text>
        ) : isEditing ? (
          <>
            <Text style={[styles.help, { color: colors.textSecondary }]}>
              How many {row.currencyCode} one {anchorCode} buys.
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  borderColor: colors.border,
                  color: colors.text,
                  backgroundColor: colors.surface,
                },
                fieldErrorStyle(colors, rateErrorShown && !draftRate.trim()),
              ]}
              value={draftRate}
              onChangeText={text => {
                setDraftRate(text);
                setRateMessage(null);
              }}
              keyboardType="numeric"
              returnKeyType="done"
              inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
              autoFocus
            />
            <FieldErrorText message={rateMessage} />
            <View style={styles.actions}>
              <Pressable
                style={[styles.pill, { borderColor: colors.border }]}
                onPress={cancelEdit}>
                <Text style={[styles.pillText, { color: colors.text }]}>
                  Cancel
                </Text>
              </Pressable>
              {/* Muted but still pressable — pressing an incomplete
                  field is what turns it red, rather than the tap simply
                  doing nothing. Same reasoning as BottomSheetModal's
                  footer button. */}
              <Pressable
                style={[
                  styles.pillSolid,
                  {
                    backgroundColor: draftValid
                      ? colors.primary
                      : colors.neutralSoft,
                  },
                ]}
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
                ? `1 ${anchorCode} = ${row.ratePerAnchor} ${row.currencyCode}`
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
    <View
      ref={hostRef}
      collapsable={false}
      style={[styles.container, { backgroundColor: colors.background }]}>
      <InfoBanner>
        {anchorCode
          ? `Rates are measured against ${anchorCode}, your default currency. They only pre-fill the converted amount when you transfer between two currencies — you can always change that amount before saving, and editing a rate never changes a transfer you've already made.`
          : "These rates only pre-fill the converted amount when you transfer between two currencies — you can always change that amount before saving. Editing a rate here never changes a transfer you've already made."}
      </InfoBanner>

      {isPending ? (
        <EmptyState message="Loading..." />
      ) : (
        <FlatList
          ref={listRef}
          data={rates ?? []}
          keyExtractor={item => String(item.currencyId)}
          renderItem={({ item }) => renderRow(item)}
          keyboardShouldPersistTaps="handled"
          onLayout={event => setListHeight(event.nativeEvent.layout.height)}
          // A row far enough down the list may not be mounted yet when we
          // ask to scroll to it; this is the documented fallback.
          onScrollToIndexFailed={info =>
            listRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: true,
            })
          }
          ListFooterComponent={
            footerHeight > 0 ? <View style={{ height: footerHeight }} /> : null
          }
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
