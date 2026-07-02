import React from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import BottomSheetModal from '../BottomSheetModal';
import CollapsiblePicker from '../CollapsiblePicker';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from '../NumericInputAccessory';
import { useTheme } from '../../contexts/ThemeContext';
import type { EntitlementTier } from '../../hooks/useEntitlement';
import { ACCOUNT_TYPES } from '../../hooks/useAccountForm';
import type { UseAccountFormResult } from '../../hooks/useAccountForm';
import type { CurrencyRow } from '../../hooks/useAccounts';
import { currencyLabel } from '../../utils/currencyHelpers';
import { FREE_ACCOUNT_TYPES } from '../../config/entitlements';
import { sharedFormStyles as styles } from './sharedFormStyles';

type Props = {
  form: UseAccountFormResult;
  currencies: CurrencyRow[];
  tier: EntitlementTier;
};

function AccountFormModal({ form, currencies, tier }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { visible, editingId, values, setValues, canSave, close, submit } = form;

  const setName = (name: string) => setValues(current => ({ ...current, name }));
  const setType = (type: string) => setValues(current => ({ ...current, type }));
  const setInitialCurrencyId = (initialCurrencyId: string) =>
    setValues(current => ({ ...current, initialCurrencyId }));
  const setInitialBalance = (initialBalance: string) =>
    setValues(current => ({ ...current, initialBalance }));

  return (
    <BottomSheetModal
      visible={visible}
      onClose={close}
      onSave={submit}
      canSave={canSave}
      title={editingId ? 'Edit Account' : 'Add Account'}
      saveLabel={editingId ? 'Update' : 'Add'}
      onFullyClosed={form.notifyFullyClosed}>
      <Text style={[styles.label, { color: colors.text }]}>Name</Text>
      <TextInput
        style={[
          styles.input,
          { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
        ]}
        value={values.name}
        onChangeText={setName}
        placeholderTextColor={colors.textSecondary}
      />

      <Text style={[styles.label, { color: colors.text }]}>Type</Text>
      <CollapsiblePicker
        displayLabel={values.type}
        selectedValue={values.type}
        onValueChange={setType}
        items={ACCOUNT_TYPES.map(t => ({ label: t, value: t }))}
        label="Type"
      />
      {/* Only while creating — editing an existing account of a premium
          type is never blocked, so flagging it here would be misleading
          about what's actually gated. */}
      {!editingId && tier === 'free' && !FREE_ACCOUNT_TYPES.includes(values.type) && (
        <Text style={[localStyles.premiumBadge, { color: colors.warning }]}>
          🔒 Premium — {values.type}
        </Text>
      )}

      {!editingId && (
        <>
          <Text style={[styles.label, { color: colors.text }]}>
            Initial currency
          </Text>
          <CollapsiblePicker
            displayLabel={currencyLabel(currencies, values.initialCurrencyId)}
            selectedValue={values.initialCurrencyId}
            onValueChange={setInitialCurrencyId}
            items={currencies.map(c => ({
              label: `${c.code} — ${c.name}`,
              value: String(c.id),
            }))}
            label="Initial currency"
          />

          <Text style={[styles.label, { color: colors.text }]}>
            Initial balance
          </Text>
          <TextInput
            style={[
              styles.input,
              { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
            ]}
            value={values.initialBalance}
            onChangeText={setInitialBalance}
            keyboardType="numeric"
            returnKeyType="done"
            inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
            placeholder="0.00"
            placeholderTextColor={colors.textSecondary}
          />
        </>
      )}

      <NumericInputAccessory />
    </BottomSheetModal>
  );
}

const localStyles = StyleSheet.create({
  premiumBadge: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
  },
});

export default AccountFormModal;
