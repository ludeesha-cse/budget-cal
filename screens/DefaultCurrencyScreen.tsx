import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Check, Plus, Wallet } from 'lucide-react-native';
import Card from '../components/Card';
import ScreenBackground from '../components/ScreenBackground';
import CollapsiblePicker from '../components/CollapsiblePicker';
import EmptyState from '../components/common/EmptyState';
import AmountInput from '../components/common/AmountInput';
import FieldErrorText from '../components/common/FieldErrorText';
import LoadErrorState from '../components/common/LoadErrorState';
import KeyboardAwareScrollView from '../components/common/KeyboardAwareScrollView';
import AddCurrencySheets from '../components/currencies/AddCurrencySheets';
import { getCurrencies, getDefaultCurrency } from '../db/queries';
import { useTheme } from '../contexts/ThemeContext';
import { useFieldErrors } from '../hooks/useFieldErrors';
import { scaleFont, typography } from '../theme/typography';
import { checkAmount } from '../utils/amountValidation';
import { reportError } from '../utils/appErrors';
import { useCompleteFirstRunSetup } from '../hooks/queries';

type CurrencyRow = Awaited<ReturnType<typeof getCurrencies>>[number];

type Props = {
  onDone: () => void;
};

// The fields this screen can point at, in the order they appear — which
// is also the order Confirm scrolls to the first one that needs fixing.
type FieldKey = 'defaultCurrency' | 'walletCurrency' | 'openingBalance';
const FIELD_ORDER: FieldKey[] = [
  'defaultCurrency',
  'walletCurrency',
  'openingBalance',
];

// The last first-run step: the app's default currency, and how much cash
// the user is carrying right now.
//
// WHY THE WALLET IS PART OF SETUP: the app seeds one "Cash in wallet"
// account, but with no balance row it has no currency and no money, so
// the first cash expense either has nowhere to come from or drives the
// wallet negative. Asking once, here, means balances start out true.
//
// Everything on this screen is saved by ONE write (completeFirstRunSetup)
// that either fully lands or leaves nothing behind — so a failure keeps
// the user here with their answers still filled in, rather than half
// set up on the other side.
function DefaultCurrencyScreen({ onDone }: Props): React.JSX.Element {
  const completeFirstRunSetup = useCompleteFirstRunSetup();
  const { colors } = useTheme();
  const [allCurrencies, setAllCurrencies] = useState<CurrencyRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // The wallet's currency follows the default currency above until the
  // user picks one for the wallet themselves — after that it is theirs,
  // and changing the default no longer moves it.
  const [walletCurrencyId, setWalletCurrencyId] = useState<number | null>(
    null,
  );
  const [walletCurrencyTouched, setWalletCurrencyTouched] = useState(false);
  const [openingBalance, setOpeningBalance] = useState('');
  // Messages for values that are present but wrong ("-5"), or for a save
  // the database refused — as opposed to blank fields, which are outlined.
  const [amountMessage, setAmountMessage] = useState<string | null>(null);
  const [walletCurrencyMessage, setWalletCurrencyMessage] = useState<
    string | null
  >(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView | null>(null);
  const fieldY = useRef<Partial<Record<FieldKey, number>>>({});
  const recordY = (field: FieldKey) => (y: number) => {
    fieldY.current[field] = y;
  };

  const load = useCallback(async () => {
    const [rows, current] = await Promise.all([
      getCurrencies(),
      getDefaultCurrency(),
    ]);
    setAllCurrencies(rows);
    // Only seeds the selection the first time. a reload after adding a
    // currency must not throw away a choice the user already made.
    setSelectedId(previous => previous ?? current?.id ?? null);
    setLoadFailed(false);
    setLoading(false);
  }, []);

  const retryLoad = useCallback(() => {
    setLoading(true);
    load().catch(error => {
      console.error('DefaultCurrencyScreen: failed to load currencies', error);
      setLoadFailed(true);
      setLoading(false);
    });
  }, [load]);

  useEffect(() => {
    retryLoad();
  }, [retryLoad]);

  useEffect(() => {
    if (!walletCurrencyTouched) {
      setWalletCurrencyId(selectedId);
    }
  }, [selectedId, walletCurrencyTouched]);

  // A message describes the value it was about; editing that value
  // retires it.
  useEffect(() => {
    setAmountMessage(null);
    setSaveError(null);
  }, [openingBalance]);
  useEffect(() => {
    setWalletCurrencyMessage(null);
    setSaveError(null);
  }, [walletCurrencyId, selectedId]);

  const activeCurrencies = useMemo(
    () => allCurrencies.filter(c => c.active),
    [allCurrencies],
  );
  const disabledCurrencies = useMemo(
    () => allCurrencies.filter(c => !c.active),
    [allCurrencies],
  );
  const walletCurrency = activeCurrencies.find(c => c.id === walletCurrencyId);

  const amountCheck = checkAmount(openingBalance, { allowZero: true });
  const missingFields = useMemo(() => {
    const missing: FieldKey[] = [];
    if (selectedId == null) {
      missing.push('defaultCurrency');
    }
    if (walletCurrencyId == null) {
      missing.push('walletCurrency');
    }
    if (amountCheck.kind === 'blank') {
      missing.push('openingBalance');
    }
    return missing;
  }, [selectedId, walletCurrencyId, amountCheck.kind]);
  const fieldErrors = useFieldErrors(missingFields);
  const canConfirm = missingFields.length === 0 && amountCheck.kind === 'ok';

  // Brings a field that needs attention on screen — the amount sits at
  // the bottom of a long list on a small phone, so an outline the user
  // cannot see would be no signal at all.
  const scrollToField = (field: FieldKey) => {
    const y = fieldY.current[field];
    if (y != null) {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
    }
  };

  const handleConfirm = async () => {
    if (confirming) {
      return;
    }
    setSaveError(null);
    // Muted but pressable while incomplete — the tap lands here and
    // outlines what is missing, rather than doing nothing. Same pattern
    // as every form in the app (see hooks/useFieldErrors).
    if (missingFields.length > 0) {
      fieldErrors.reveal();
      const first = FIELD_ORDER.find(field => missingFields.includes(field));
      if (first) {
        scrollToField(first);
      }
      return;
    }
    if (amountCheck.kind === 'invalid') {
      setAmountMessage(amountCheck.message);
      scrollToField('openingBalance');
      return;
    }
    if (
      selectedId == null ||
      walletCurrencyId == null ||
      amountCheck.kind !== 'ok'
    ) {
      return;
    }
    fieldErrors.reset();
    setConfirming(true);
    try {
      await completeFirstRunSetup({
        defaultCurrencyId: selectedId,
        walletCurrencyId,
        openingBalance: amountCheck.value,
      });
      onDone();
    } catch (error) {
      // Nothing was saved (the write is all-or-nothing), so the user
      // stays here with every answer still filled in.
      const appError = reportError(error, {
        operation: 'First-run setup',
      });
      if (appError.field === 'openingBalance') {
        setAmountMessage(appError.message);
        scrollToField('openingBalance');
      } else if (appError.field === 'walletCurrency') {
        setWalletCurrencyMessage(appError.message);
        scrollToField('walletCurrency');
      } else {
        setSaveError(appError.message);
      }
      // A currency may have vanished or been switched off underneath us;
      // re-read the list so the pickers show what really exists.
      load().catch(() => undefined);
    } finally {
      setConfirming(false);
    }
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

  if (loadFailed) {
    return (
      <ScreenBackground colors={colors} edges={['top', 'bottom']}>
        <View style={styles.padded}>
          <LoadErrorState what="your currencies" onRetry={retryLoad} />
        </View>
      </ScreenBackground>
    );
  }

  const defaultCurrencyMissing = fieldErrors.isMissing('defaultCurrency');

  return (
    <ScreenBackground colors={colors} edges={['top', 'bottom']}>
      <KeyboardAwareScrollView
        scrollViewRef={scrollRef}
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

        <View
          onLayout={event =>
            recordY('defaultCurrency')(event.nativeEvent.layout.y)
          }>
          {activeCurrencies.length === 0 ? (
            <EmptyState message="No currencies are turned on. Tap Add Currency below to choose one." />
          ) : (
            activeCurrencies.map(currency => {
              const selected = currency.id === selectedId;
              return (
                <Pressable
                  key={currency.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setSelectedId(currency.id)}>
                  <Card
                    colors={colors}
                    borderColor={
                      selected
                        ? colors.primary
                        : defaultCurrencyMissing
                          ? colors.danger
                          : undefined
                    }
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
          {defaultCurrencyMissing && (
            <FieldErrorText message="Choose a currency" />
          )}
        </View>

        <Pressable
          style={[styles.addButton, { borderColor: colors.primary }]}
          onPress={() => setPickerVisible(true)}>
          <Plus size={16} color={colors.primary} strokeWidth={2.5} />
          <Text style={[styles.addButtonText, { color: colors.primary }]}>
            Add Currency
          </Text>
        </Pressable>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIcon, { backgroundColor: colors.primarySoft }]}>
            <Wallet size={18} color={colors.primary} />
          </View>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Your cash wallet
          </Text>
        </View>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Cash in wallet is the money you physically carry — notes and coins in
          your purse or at home. Cash expenses come out of it. Enter how much
          cash you have right now so your balances start out correct. You can
          add bank accounts and cards later.
        </Text>

        <View
          onLayout={event =>
            recordY('walletCurrency')(event.nativeEvent.layout.y)
          }>
          <Text
            style={[
              typography.eyebrow,
              styles.fieldLabel,
              { color: colors.textSecondary },
            ]}>
            WALLET CURRENCY
          </Text>
          <CollapsiblePicker
            displayLabel={
              walletCurrency
                ? `${walletCurrency.code} — ${walletCurrency.name}`
                : 'Select currency'
            }
            selectedValue={walletCurrencyId != null ? String(walletCurrencyId) : ''}
            onValueChange={value => {
              setWalletCurrencyTouched(true);
              setWalletCurrencyId(Number(value));
            }}
            items={activeCurrencies.map(c => ({
              label: `${c.code} — ${c.name}`,
              value: String(c.id),
            }))}
            label="Wallet currency"
            invalid={fieldErrors.isMissing('walletCurrency')}
          />
          <FieldErrorText message={walletCurrencyMessage} />
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            Usually the same as your default currency. Carrying a different one?
            Pick it here, or add it with Add Currency above.
          </Text>
        </View>

        <View
          onLayout={event =>
            recordY('openingBalance')(event.nativeEvent.layout.y)
          }>
          <AmountInput
            label={`CASH IN WALLET RIGHT NOW${
              walletCurrency ? ` (${walletCurrency.code})` : ''
            }`}
            value={openingBalance}
            onChangeText={setOpeningBalance}
            invalid={fieldErrors.isMissing('openingBalance')}
          />
          <FieldErrorText message={amountMessage} />
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            No cash on you? Enter 0.
          </Text>
        </View>
      </KeyboardAwareScrollView>

      <View style={styles.footer}>
        {saveError && (
          <Text style={[styles.footerMessage, { color: colors.danger }]}>
            {saveError}
          </Text>
        )}
        {/* `confirming` still disables — that one is a genuine in-flight
            guard against a double submit, not a "you haven't filled this
            in" state. An incomplete form is only MUTED, so tapping
            Confirm outlines what is still missing instead of doing
            nothing. */}
        <Pressable
          disabled={confirming}
          accessibilityState={{ disabled: confirming, busy: confirming }}
          style={[
            styles.continueButton,
            {
              backgroundColor:
                confirming || !canConfirm ? colors.neutralSoft : colors.primary,
            },
          ]}
          onPress={handleConfirm}>
          {confirming ? (
            <ActivityIndicator color={colors.textSecondary} />
          ) : (
            <Text
              style={[
                styles.continueButtonText,
                {
                  color: !canConfirm ? colors.textSecondary : colors.primaryText,
                },
              ]}>
              Confirm
            </Text>
          )}
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
  padded: {
    flex: 1,
    padding: 20,
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
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 26,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: scaleFont(19),
    fontWeight: '700',
  },
  fieldLabel: {
    marginBottom: 6,
  },
  hint: {
    fontSize: scaleFont(12.5),
    lineHeight: scaleFont(18),
    marginTop: 6,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    paddingTop: 8,
  },
  footerMessage: {
    fontSize: scaleFont(13),
    lineHeight: scaleFont(19),
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  continueButton: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    minHeight: 50,
    justifyContent: 'center',
  },
  continueButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
});

export default DefaultCurrencyScreen;
