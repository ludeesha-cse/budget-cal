import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import CollapsiblePicker from '../CollapsiblePicker';
import EmptyState from '../common/EmptyState';
import { NUMERIC_KEYBOARD_ACCESSORY_ID } from '../NumericInputAccessory';
import { useTheme } from '../../contexts/ThemeContext';
import { currencyLabel } from '../../utils/currencyHelpers';
import { scaleFont } from '../../theme/typography';
import type { CurrencyRow } from '../../hooks/useAccounts';

type Props = {
  availableCurrencies: CurrencyRow[];
  currencyId: string;
  onCurrencyIdChange: (value: string) => void;
  balance: string;
  onBalanceChange: (value: string) => void;
  onSubmit: () => void;
};

// The inline "+ Add Currency" form that expands under an account row once
// toggled (see AccountListItem) — only ever rendered while expanded.
function AddCurrencyForm({
  availableCurrencies,
  currencyId,
  onCurrencyIdChange,
  balance,
  onBalanceChange,
  onSubmit,
}: Props): React.JSX.Element {
  const { colors } = useTheme();

  if (availableCurrencies.length === 0) {
    return (
      <EmptyState message="This account already has a balance in every currency." />
    );
  }

  return (
    <View style={styles.form}>
      <CollapsiblePicker
        displayLabel={
          currencyId ? currencyLabel(availableCurrencies, currencyId) : 'Select currency'
        }
        selectedValue={currencyId}
        onValueChange={onCurrencyIdChange}
        items={availableCurrencies.map(c => ({
          label: `${c.code} — ${c.name}`,
          value: String(c.id),
        }))}
        label="Currency"
      />
      <TextInput
        style={[
          styles.input,
          { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
        ]}
        value={balance}
        onChangeText={onBalanceChange}
        keyboardType="numeric"
        returnKeyType="done"
        inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
        placeholder="Starting balance"
        placeholderTextColor={colors.textSecondary}
      />
      <Pressable
        style={[styles.primaryPillButton, { backgroundColor: colors.primary }]}
        onPress={onSubmit}>
        <Text style={[styles.primaryPillButtonText, { color: colors.primaryText }]}>
          Add
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    marginTop: 8,
    gap: 8,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
  },
  primaryPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  primaryPillButtonText: {
    fontSize: scaleFont(14),
    fontWeight: '700',
  },
});

export default AddCurrencyForm;
