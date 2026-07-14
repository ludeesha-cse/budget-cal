import React, { useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChevronRight, Plus } from 'lucide-react-native';
import BottomSheetModal from '../BottomSheetModal';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont, typography } from '../../theme/typography';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useEntityFormModal } from '../../hooks/useEntityFormModal';

import type { getCurrencies } from '../../db/queries';
import type { PaywallRequest } from '../../contexts/PaywallContext';
import type { EntitlementTier } from '../../hooks/useEntitlement';
import { canAddCurrency } from '../../utils/entitlementChecks';
import {
  useAddCurrency as useAddCurrencyMutation,
  useSetCurrencyActive as useSetCurrencyActiveMutation,
} from '../../hooks/queries';

type CurrencyRow = Awaited<ReturnType<typeof getCurrencies>>[number];
type CurrencyFormValues = { code: string; name: string };

type Props = {
  // Controls the PICKER sheet only. The "add a brand-new currency" form
  // sheet manages its own visibility internally, which is why this
  // component has to stay mounted even while `visible` is false — closing
  // the picker is what opens the form.
  visible: boolean;
  onClose: () => void;
  // Currencies that exist but are switched off. Passed in rather than
  // fetched here so the parent keeps owning its own list state and its
  // own reload timing (CurrenciesScreen reloads on focus; the first-launch
  // DefaultCurrencyScreen loads once).
  disabledCurrencies: CurrencyRow[];
  // Called after a currency is enabled or created, so the parent can
  // re-read its list. The picker closes itself on enable.
  // Optional since the TanStack Query refactor: a caller used to pass
  // its screen's load() here purely to re-read the database after a
  // successful write. The mutation hooks now invalidate every affected
  // query themselves, so that job is done — this is left for callers
  // that still need to do something ELSE once a save lands (reset
  // local UI state, navigate away).
  onChanged?: () => void | Promise<void>;
  // Gates both "enable an existing currency" and "add a brand-new
  // currency" behind canAddCurrency. Omitted by the first-launch
  // DefaultCurrencyScreen on purpose — that flow always collapses to a
  // single active currency on confirm (see confirmDefaultCurrency), so
  // gating this picker there would block a free user from even
  // previewing a different currency as their one starting default.
  // CurrenciesScreen (the ongoing "add another currency" flow, where the
  // free-tier limit actually matters) always passes this.
  entitlement?: {
    activeCurrencyCount: number;
    tier: EntitlementTier;
    openPaywall: (request: PaywallRequest) => void;
  };
};

// The Stage 7b "Add Currency" flow, lifted verbatim out of
// CurrenciesScreen so the first-launch DefaultCurrencyScreen can offer the
// exact same thing rather than growing a second, subtly-different
// currency-creation form. Two sheets, in sequence:
//
//   1. A picker listing every currency that already exists but is
//      switched off, each one tappable to re-enable it. This is the
//      common case — someone wants EUR and EUR is already in the table,
//      just disabled.
//   2. Behind a link at the bottom of that picker, a two-field form for a
//      currency the app has never heard of.
//
// Both screens render this identically; nothing here branches on which
// one is hosting it.
function AddCurrencySheets({
  visible,
  onClose,
  disabledCurrencies,
  onChanged,
  entitlement,
}: Props): React.JSX.Element {
  // Write paths go through the caching layer's mutation hooks: each
  // one runs the same db/queries function as before and then
  // invalidates every query its write can affect (see
  // hooks/queries/invalidation.ts). The call sites below are
  // unchanged — these hooks take the wrapped function's own arguments.
  const addCurrency = useAddCurrencyMutation();
  const setCurrencyActive = useSetCurrencyActiveMutation();
  const { colors } = useTheme();
  const runAction = useAsyncAction();

  // Mirrors useEntityFormModal's own waitForFullyClosed, but for the
  // PICKER sheet below — that sheet's visible/onClose are owned by the
  // parent screen, not by useEntityFormModal, so there's no built-in
  // close-confirmation to await before opening the paywall on top of it.
  // Without waiting, two native Modals can end up open at once, which
  // freezes iOS solid (same issue useAccountForm/useInstallmentForm's
  // onCreate work around for their own form sheets).
  const pickerCloseWaitersRef = useRef<Array<() => void>>([]);
  const notifyPickerFullyClosed = () => {
    const waiters = pickerCloseWaitersRef.current;
    pickerCloseWaitersRef.current = [];
    waiters.forEach(resolve => resolve());
  };
  const waitForPickerFullyClosed = () =>
    new Promise<void>(resolve => {
      pickerCloseWaitersRef.current.push(resolve);
    });

  const form = useEntityFormModal<CurrencyRow, CurrencyFormValues, CurrencyFormValues>({
    initialValues: { code: '', name: '' },
    // Never actually invoked — this flow is add-only (no edit path, hence
    // no onUpdate below), so openEdit is never called. Still required by
    // the hook's type.
    populateFromRow: currency => ({ code: currency.code, name: currency.name }),
    validate: v =>
      v.code.trim() === '' || v.name.trim() === ''
        ? 'Enter a currency code and name.'
        : null,
    toParams: v => ({ code: v.code.trim().toUpperCase(), name: v.name.trim() }),
    onCreate: async params => {
      const performCreate = () => addCurrency(params.code, params.name);
      const check = entitlement
        ? canAddCurrency(entitlement.activeCurrencyCount, entitlement.tier)
        : { allowed: true };
      if (check.allowed) {
        await performCreate();
        return;
      }
      // Hide this screen's own form sheet before showing the paywall's —
      // see useAccountForm/useInstallmentForm's own onCreate for why (two
      // native Modals open at once freezes iOS solid). onDismiss restores
      // the form, still filled in, if the user backs out without buying.
      form.setVisible(false);
      await form.waitForFullyClosed();
      await new Promise<void>(resolve => {
        entitlement!.openPaywall({
          reason: check.reason ?? 'Multiple currencies require Premium.',
          onPurchaseSuccess: async () => {
            await performCreate();
            resolve();
          },
          onDismiss: () => form.setVisible(true),
        });
      });
    },
    onUpdate: undefined,
    onSaved: onChanged,
    errorTitle: 'Cannot add currency',
  });

  const {
    visible: formVisible,
    values,
    setValues,
    canSave: formCanSave,
    openAdd: openNewCurrencyForm,
    close: closeForm,
    submit: handleSubmit,
  } = form;

  const handleEnable = (currencyId: number) => {
    const check = entitlement
      ? canAddCurrency(entitlement.activeCurrencyCount, entitlement.tier)
      : { allowed: true };

    if (!check.allowed) {
      onClose();
      waitForPickerFullyClosed().then(() => {
        entitlement!.openPaywall({
          reason: check.reason ?? 'Multiple currencies require Premium.',
          onPurchaseSuccess: () => {
            runAction(async () => {
              await setCurrencyActive(currencyId, true);
              await onChanged?.();
            }, 'Cannot enable currency');
          },
        });
      });
      return;
    }

    runAction(async () => {
      await setCurrencyActive(currencyId, true);
      await onChanged?.();
      onClose();
    }, 'Cannot enable currency');
  };

  return (
    <>
      <BottomSheetModal
        visible={visible}
        onClose={onClose}
        onFullyClosed={notifyPickerFullyClosed}
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
                  <Text style={{ color: colors.textSecondary }}>
                    {currency.name}
                  </Text>
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
            onClose();
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
            {
              borderColor: colors.border,
              color: colors.text,
              backgroundColor: colors.surface,
            },
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
            {
              borderColor: colors.border,
              color: colors.text,
              backgroundColor: colors.surface,
            },
          ]}
          value={values.name}
          onChangeText={text => setValues(v => ({ ...v, name: text }))}
          placeholder="e.g. Japanese Yen"
          placeholderTextColor={colors.textSecondary}
        />
      </BottomSheetModal>
    </>
  );
}

const styles = StyleSheet.create({
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
  rowDetails: {
    flex: 1,
  },
  rowCode: {
    fontWeight: '600',
  },
  actionLink: {
    fontSize: scaleFont(13),
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

export default AddCurrencySheets;
