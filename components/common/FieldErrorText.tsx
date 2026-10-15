import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';

type Props = {
  message: string | null | undefined;
};

// The one line of red text that sits directly under a field when what is
// IN it is wrong — "Insufficient balance, transfer or withdraw to the
// account first" under an account picker, "Enter an amount greater than
// 0" under an amount. Deliberately plain: no icon, no box, no button,
// because it explains the control right above it rather than starting a
// conversation of its own.
//
// Not for a field left blank — that is the red outline from
// fieldErrorStyle (see hooks/useFieldErrors). Renders nothing when there
// is no message, so a form can always mount it.
function FieldErrorText({ message }: Props): React.JSX.Element | null {
  const { colors } = useTheme();
  if (!message) {
    return null;
  }
  return (
    <Text
      accessibilityLiveRegion="polite"
      style={[styles.text, { color: colors.danger }]}>
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: scaleFont(12.5),
    lineHeight: scaleFont(17),
    marginTop: 6,
  },
});

export default FieldErrorText;
