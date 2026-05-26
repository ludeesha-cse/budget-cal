import React from 'react';
import { StyleSheet, Text } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';

type Props = {
  // The only thing that actually varied across the 15 places this was
  // copy-pasted (fontSize/marginTop/textAlign) — everything else was
  // identical, so those three become opt-in overrides rather than new
  // variants to keep track of.
  message: string;
  centered?: boolean;
  style?: StyleProp<TextStyle>;
};

// Replaces the `<Text style={[styles.empty, {color: colors.textSecondary}]}>`
// block that was hand-copied into 15 screen files (see REFACTOR_AUDIT.md,
// pattern #7) — every one of them was rendering the same "no items yet"
// message with only the wording different.
function EmptyState({ message, centered = false, style }: Props): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Text
      style={[
        styles.text,
        centered && styles.centered,
        { color: colors.textSecondary },
        style,
      ]}>
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: scaleFont(14),
    marginTop: 8,
  },
  centered: {
    textAlign: 'center',
    marginTop: 24,
  },
});

export default EmptyState;
