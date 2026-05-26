import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

type Props = {
  // Raw percent (0-100 expected, but not required) — clamped internally so
  // every screen stops reimplementing its own Math.min/Math.max dance.
  percent: number;
  color: string;
  trackColor?: string; // defaults to theme's colors.border
  height?: number; // default 6 (most list rows); Dashboard/SavingsGoals use 8
  style?: StyleProp<ViewStyle>;
};

function ProgressBar({
  percent,
  color,
  trackColor,
  height = 6,
  style,
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  const clamped = Math.min(100, Math.max(0, percent));
  const radius = height / 2;
  return (
    <View
      style={[
        styles.track,
        {
          height,
          borderRadius: radius,
          backgroundColor: trackColor ?? colors.border,
        },
        style,
      ]}>
      <View
        style={[
          styles.fill,
          { width: `${clamped}%`, borderRadius: radius, backgroundColor: color },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});

export default ProgressBar;
