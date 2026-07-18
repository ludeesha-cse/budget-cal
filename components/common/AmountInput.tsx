import React from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from '../NumericInputAccessory';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { fieldErrorStyle } from '../../utils/formFieldStyle';

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  label?: string;
  invalid?: boolean;
};

// The "AMOUNT" eyebrow label + large numeric field + its keyboard
// accessory, shared byte-for-byte between TransactionForm and IncomeForm.
function AmountInput({
  value,
  onChangeText,
  label = 'AMOUNT',
  invalid = false,
}: Props): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <>
      <Text
        style={[
          typography.eyebrow,
          styles.label,
          { color: colors.textSecondary },
        ]}
      >
        {label}
      </Text>
      <TextInput
        style={[
          typography.amountMid,
          styles.amountInput,
          {
            borderColor: colors.border,
            color: colors.text,
            backgroundColor: colors.surface,
          },
          fieldErrorStyle(colors, invalid),
        ]}
        value={value}
        onChangeText={onChangeText}
        keyboardType="numeric"
        returnKeyType="done"
        inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
        placeholder="0.00"
        placeholderTextColor={colors.textSecondary}
      />
      <NumericInputAccessory />
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    marginTop: 16,
    marginBottom: 6,
  },
  amountInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});

export default AmountInput;
