import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';

type Props = {
  error: string | null;
  canSave: boolean;
  label: string;
  onPress: () => void;
};

// The error message + submit button block, identical between
// TransactionForm and IncomeForm.
function FormSubmitButton({
  error,
  canSave,
  label,
  onPress,
}: Props): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <>
      {error && (
        <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
      )}

      <Pressable
        disabled={!canSave}
        style={[
          styles.submitButton,
          { backgroundColor: !canSave ? colors.neutralSoft : colors.primary },
        ]}
        onPress={onPress}>
        <Text
          style={[
            styles.submitButtonText,
            { color: !canSave ? colors.textSecondary : colors.primaryText },
          ]}>
          {label}
        </Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  error: {
    marginTop: 12,
  },
  submitButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  submitButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
});

export default FormSubmitButton;
