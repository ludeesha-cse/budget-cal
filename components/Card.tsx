import React, { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { ThemeColors } from '../contexts/ThemeContext';

type Props = {
  colors: ThemeColors;
  // Whatever a plain card View used to get: padding, marginBottom,
  // flexDirection/alignItems for the ones that arrange their own
  // children in a row, etc. Never include backgroundColor or borderColor
  // here — Card owns those (colors.card / colors.cardGradient / the
  // `borderColor` prop below), the same way callers never pass their own
  // border/radius to a styled Button.
  style?: StyleProp<ViewStyle>;
  // Override for the (rare) card that isn't bordered in the normal
  // neutral colors.border — e.g. Dashboard's "Due Soon / Overdue" card,
  // which uses colors.warning to flag itself as needing attention.
  borderColor?: string;
  children: React.ReactNode;
};

// Only genuine "how THIS card sits inside ITS OWN parent" concerns stay
// on the outer box for the gradient path below — margin, self-alignment,
// sizing, absolute positioning. Everything else (padding, and critically
// flexDirection/alignItems/justifyContent/gap — how a card arranges ITS
// OWN children, e.g. summaryCard's 3-column row or shortcutRow's
// avatar-text-amount row) has to move to the inner wrapper together,
// because that's the view that actually contains the children. An
// earlier version of this component only moved padding and left
// flexDirection behind on the outer box, whose only child is the inner
// wrapper — so a "row" card's children silently fell back to the
// default column layout and stacked vertically the moment a gradient
// palette (Platinum) was active. Flat-palette cards never hit this path
// (single View, nothing to split) which is why it wasn't obvious right
// away.
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

// Every card-shaped box in the app (Dashboard's budget/category/shortcut
// cards, Reports' summary/chart cards, each SettingsHome section, ...)
// renders through this instead of a plain bordered View — one place that
// knows how to paint a card's background, mirroring ScreenBackground for
// the screen behind it. Flat colors.card fill for palettes that don't
// define a cardGradient (Ledger), or a subtle SVG gradient sheen for ones
// that do (Platinum — see theme/palettes.ts).
//
// The gradient path needs a real second wrapper: react-native-svg's
// absolute-fill positions itself relative to its parent's PADDING edge,
// not its border edge, so if this card's own padding lived on the same
// View as the gradient, a padding-width strip around every edge would
// show the flat fallback color instead of the gradient. Splitting into an
// outer (sizing/position only) and inner (padding + children layout)
// View — only for the gradient path — is what keeps the sheen reaching
// all the way to the card's rounded corners while still laying out
// children correctly. Split is auto-detected from `style` rather than a
// separate prop so every existing call site's style array works
// unchanged.
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
