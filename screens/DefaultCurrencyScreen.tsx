import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Check, Plus } from 'lucide-react-native';
import Card from '../components/Card';
import ScreenBackground from '../components/ScreenBackground';
import EmptyState from '../components/common/EmptyState';
import AddCurrencySheets from '../components/currencies/AddCurrencySheets';
import {
  getCurrencies,
  getDefaultCurrency,
  setDefaultCurrency,
  setDefaultCurrencyConfirmed,
} from '../db/queries';
import { useTheme } from '../contexts/ThemeContext';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { scaleFont, typography } from '../theme/typography';

type CurrencyRow = Awaited<ReturnType<typeof getCurrencies>>[number];

type Props = {
  // Same shape as OnboardingScreen's — App.tsx's RootFlow owns what comes
  // next (the normal tab navigator), so this screen needs no navigator
  // and no route of its own.
  onDone: () => void;
};

// Step two of first launch: confirm which currency everything defaults to.
// Deliberately a confirmation, not a forced choice — db/index.ts already
// seeds LKR as the default, so the common case is a user who taps Continue
// once without changing anything. The screen exists because the LESS
// common case (someone whose money isn't in rupees) would otherwise have
// to discover More → Currencies on their own after their first few entries
// were already recorded against the wrong default.
function DefaultCurrencyScreen({ onDone }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const runAction = useAsyncAction();
  const [allCurrencies, setAllCurrencies] = useState<CurrencyRow[]>([]);
  // What the DB says the default is right now, captured on load. Compared
  // against `selectedId` on Continue so setDefaultCurrency() is only
  // called when the user genuinely picked something else — re-writing the
  // same default would run a two-statement transaction for no reason.
  const [storedDefaultId, setStoredDefaultId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    // getCurrencies() (the FULL list, active + disabled) rather than
    // getActiveCurrencies(), because the "Add Currency" sheet below needs
    // the disabled ones to offer as re-enable candidates — same reason
    // CurrenciesScreen reads the full list. Only the active ones are
    // offered as a default below, though: setCurrencyActive() refuses to
    // disable the default currency precisely because the app assumes its
    // default is always usable, and letting first launch pick a disabled
    // one would walk straight into the state that guard exists to prevent.
    const [rows, current] = await Promise.all([
      getCurrencies(),
      getDefaultCurrency(),
    ]);
    setAllCurrencies(rows);
    setStoredDefaultId(current?.id ?? null);
    // Only seeds the selection the first time — a reload after adding a
    // currency must not throw away a choice the user already made.
    setSelectedId(previous => previous ?? current?.id ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch(error => {
      console.error('DefaultCurrencyScreen: failed to load currencies', error);
      setLoading(false);
    });
  }, [load]);

  const activeCurrencies = useMemo(
    () => allCurrencies.filter(c => c.active),
    [allCurrencies],
  );
  const disabledCurrencies = useMemo(
    () => allCurrencies.filter(c => !c.active),
    [allCurrencies],
  );

  const handleContinue = async () => {
    if (confirming || selectedId == null) {
      return;
    }
    setConfirming(true);
    await runAction(async () => {
      // storedDefaultId == null covers the theoretical "no currency is
      // flagged default at all" case — there the write is required, not
      // optional, so it can't be skipped by the equality check alone.
      if (storedDefaultId == null || selectedId !== storedDefaultId) {
        console.log(
          `[first launch] changing default currency ${storedDefaultId} -> ${selectedId}`,
        );
        await setDefaultCurrency(selectedId);
      } else {
        console.log(
          `[first launch] keeping existing default currency ${storedDefaultId} — no write`,
        );
      }
      await setDefaultCurrencyConfirmed();
      onDone();
    }, 'Cannot confirm default currency');
    // Not in a `finally` — if the action succeeded, onDone() has already
    // swapped this screen out and setting state on the way out would be a
    // no-op at best. This only matters on the failure path, where the
    // Alert has been shown and the button needs to become tappable again.
    setConfirming(false);
  };

  if (loading) {
    return (
      <ScreenBackground colors={colors} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground colors={colors} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.scrollContent}>
        <Text style={[typography.eyebrow, { color: colors.textSecondary }]}>
          One Last Thing
        </Text>
        <Text
          style={[typography.screenTitle, styles.title, { color: colors.text }]}>
          Your default currency
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          New budgets, accounts and reports start in this currency. You can add
          others at any time, and nothing is ever converted between them — each
          currency keeps its own separate totals.
        </Text>

        {activeCurrencies.length === 0 ? (
          <EmptyState message="No currencies are enabled. Add one to continue." />
        ) : (
          activeCurrencies.map(currency => {
            const selected = currency.id === selectedId;
            return (
              <Pressable
                key={currency.id}
                onPress={() => setSelectedId(currency.id)}>
                <Card
                  colors={colors}
                  borderColor={selected ? colors.primary : undefined}
                  style={styles.row}>
                  <View
                    style={[
                      styles.codeBadge,
                      {
                        backgroundColor: selected
                          ? colors.primarySoft
                          : colors.neutralSoft,
                      },
                    ]}>
                    <Text
                      style={[
                        styles.codeBadgeText,
                        { color: selected ? colors.primary : colors.text },
                      ]}>
                      {currency.code.slice(0, 2)}
                    </Text>
                  </View>
                  <View style={styles.rowDetails}>
                    <Text style={[styles.rowCode, { color: colors.text }]}>
                      {currency.code}
                    </Text>
                    <Text style={{ color: colors.textSecondary }}>
                      {currency.name}
                    </Text>
                  </View>
                  {selected && <Check size={20} color={colors.primary} />}
                </Card>
              </Pressable>
            );
          })
        )}

        <Pressable
          style={[styles.addButton, { borderColor: colors.primary }]}
          onPress={() => setPickerVisible(true)}>
          <Plus size={16} color={colors.primary} strokeWidth={2.5} />
          <Text style={[styles.addButtonText, { color: colors.primary }]}>
            Add Currency
          </Text>
        </Pressable>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          disabled={confirming || selectedId == null}
          style={[
            styles.continueButton,
            {
              backgroundColor:
                confirming || selectedId == null
                  ? colors.neutralSoft
                  : colors.primary,
            },
          ]}
          onPress={handleContinue}>
          <Text
            style={[
              styles.continueButtonText,
              {
                color:
                  confirming || selectedId == null
                    ? colors.textSecondary
                    : colors.primaryText,
              },
            ]}>
            Continue
          </Text>
        </Pressable>
      </View>

      <AddCurrencySheets
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        disabledCurrencies={disabledCurrencies}
        onChanged={load}
      />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 20,
  },
  title: {
    marginTop: 6,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: scaleFont(14),
    lineHeight: scaleFont(21),
    marginBottom: 22,
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
  rowCode: {
    fontWeight: '600',
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
    marginTop: 6,
  },
  addButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    paddingTop: 8,
  },
  continueButton: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  continueButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
});

export default DefaultCurrencyScreen;
