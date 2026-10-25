import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';

type Props = {
  error: string | null;
  canSave: boolean;
  // True while a save is in flight. The ONE case where the button is
  // genuinely disabled: it guards against a double submit, it is not a
  // "you haven't filled this in" state.
  submitting?: boolean;
  label: string;
  onPress: () => void;
};

// The error message + submit button block, identical between
// TransactionForm and IncomeForm.
function FormSubmitButton({
  error,
  canSave,
  submitting = false,
  label,
  onPress,
}: Props): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <>
      {error && (
        <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
      )}

      {/* Muted but still pressable when the form is incomplete — see the
          matching note in BottomSheetModal's footer, and
          hooks/useFieldErrors, for why a genuinely disabled button is
          the wrong answer here. */}
      <Pressable
        disabled={submitting}
        accessibilityState={{ disabled: submitting, busy: submitting }}
        style={[
          styles.submitButton,
          {
            backgroundColor:
              !canSave || submitting ? colors.neutralSoft : colors.primary,
          },
        ]}
        onPress={onPress}>
        <Text
          style={[
            styles.submitButtonText,
            {
              color:
                !canSave || submitting
                  ? colors.textSecondary
                  : colors.primaryText,
            },
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
