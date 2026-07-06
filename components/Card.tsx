import React, { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { ThemeColors } from '../contexts/ThemeContext';

type Props = {
  colors: ThemeColors;
  style?: StyleProp<ViewStyle>;
  borderColor?: string;
  children: React.ReactNode;
};

const OUTER_ONLY_KEYS = [
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginHorizontal',
  'marginVertical',
  'marginStart',
  'marginEnd',
  'alignSelf',
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'position',
  'top',
  'left',
  'right',
  'bottom',
  'start',
  'end',
  'zIndex',
] as const;

function Card({ colors, style, borderColor, children }: Props): React.JSX.Element {
  const gradientId = `card-gradient-${useId()}`;
  const flat = (StyleSheet.flatten(style) ?? {}) as ViewStyle;
  const gradient = colors.cardGradient;
  const resolvedBorderColor = borderColor ?? colors.border;
  const resolvedRadius = flat.borderRadius ?? 16;

  if (!gradient || gradient.length < 2) {
    return (
      <View
        style={[
          flat,
          {
            borderRadius: resolvedRadius,
            backgroundColor: colors.card,
            borderColor: resolvedBorderColor,
            borderWidth: StyleSheet.hairlineWidth,
          },
        ]}>
        {children}
      </View>
    );
  }

  const outer: ViewStyle = {};
  const inner: ViewStyle = {};
  for (const [key, value] of Object.entries(flat)) {
    if (key === 'borderRadius') {
      continue; // already resolved above, applied to the outer box only
    }
    if ((OUTER_ONLY_KEYS as readonly string[]).includes(key)) {
      (outer as Record<string, unknown>)[key] = value;
    } else {
      (inner as Record<string, unknown>)[key] = value;
    }
  }

  return (
    <View
      style={[
        outer,
        styles.gradientClip,
        {
          borderRadius: resolvedRadius,
          backgroundColor: colors.card,
          borderColor: resolvedBorderColor,
          borderWidth: StyleSheet.hairlineWidth,
        },
      ]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            {gradient.map((stopColor, index) => (
              <Stop
                key={stopColor + index}
                offset={`${(index / (gradient.length - 1)) * 100}%`}
                stopColor={stopColor}
              />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
      <View style={inner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  gradientClip: {
    overflow: 'hidden',
  },
});

export default Card;
