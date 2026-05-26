import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { scaleFont } from '../../theme/typography';

type Props = {
  percent: number;
  size: number;
  strokeWidth: number;
  trackColor: string;
  fillColor: string;
  label: string;
  labelColor: string;
};

// Small circular progress ring — plain SVG (Circle + strokeDasharray), same
// library Card.tsx already pulls in for its gradient sheen, so this doesn't
// add a new dependency.
function ProgressRing({
  percent,
  size,
  strokeWidth,
  trackColor,
  fillColor,
  label,
  labelColor,
}: Props): React.JSX.Element {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, percent));
  const dashOffset = circumference * (1 - clamped / 100);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={fillColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: scaleFont(11),
    fontWeight: '700',
  },
});

export default ProgressRing;
