import React from 'react';
import { StyleSheet, Text } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';

type Props = {
  message: string;
  centered?: boolean;
  style?: StyleProp<TextStyle>;
};

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
