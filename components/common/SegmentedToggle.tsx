import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';

export type SegmentedToggleOption<T extends string> = {
  key: T;
  label: string;
};

type Props<T extends string> = {
  options: SegmentedToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
};

function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  style,
}: Props<T>): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, style]}>
      {options.map(option => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            style={[
              styles.button,
              { backgroundColor: colors.surface, borderColor: colors.border },
              active && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
            onPress={() => onChange(option.key)}>
            <Text
              style={[
                styles.buttonText,
                { color: colors.text },
                active && { color: colors.primaryText },
              ]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: scaleFont(14),
    fontWeight: '700',
  },
});

export default SegmentedToggle;
