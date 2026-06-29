import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChevronRight, Plus } from 'lucide-react-native';
import BottomSheetModal from '../BottomSheetModal';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont, typography } from '../../theme/typography';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useEntityFormModal } from '../../hooks/useEntityFormModal';
import { addCurrency, setCurrencyActive } from '../../db/queries';
import type { getCurrencies } from '../../db/queries';

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
  onChanged: () => void | Promise<void>;
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
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  const runAction = useAsyncAction();

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
    // Never actually invoked — this flow is add-only (no edit path, hence
    // no onUpdate below), so openEdit is never called. Still required by
    // the hook's type.
    populateFromRow: currency => ({ code: currency.code, name: currency.name }),
    validate: v =>
      v.code.trim() === '' || v.name.trim() === ''
        ? 'Enter a currency code and name.'
        : null,
    toParams: v => ({ code: v.code.trim().toUpperCase(), name: v.name.trim() }),
    onCreate: params => addCurrency(params.code, params.name),
    onUpdate: undefined,
    onSaved: onChanged,
    errorTitle: 'Cannot add currency',
  });

  const handleEnable = (currencyId: number) => {
    runAction(async () => {
      await setCurrencyActive(currencyId, true);
      await onChanged();
      onClose();
    }, 'Cannot enable currency');
  };

  return (
    <>
      <BottomSheetModal
        visible={visible}
        onClose={onClose}
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
