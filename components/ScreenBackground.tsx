import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { ThemeColors } from '../contexts/ThemeContext';

type Props = {
  colors: ThemeColors;
  // Which SafeAreaView edges to inset for — 'top' for screens whose
  // native-stack header is hidden in favor of their own eyebrow/title
  // (Dashboard, History, Reports), [] for screens that already sit under
  // a real native header (SettingsHome and everything pushed under it),
  // where an extra top inset here would just double up as dead space.
  edges?: Edge[];
  children: React.ReactNode;
};

// Every top-level screen renders this as its root instead of its own
// `<SafeAreaView style={{backgroundColor: colors.background}}>` — one
// place that knows how to paint a screen's background, so a palette can
// switch between a flat fill (theme/palettes.ts's `background`) and a
// diagonal gradient sweep (`backgroundGradient`) without any screen
// having to branch on which kind of palette is active.
//
// Built on react-native-svg's own <LinearGradient> rather than pulling in
// a dedicated gradient library — react-native-svg is already a linked
// native dependency (every lucide icon in this app renders through it),
// so this adds zero new native modules and nothing for iOS to re-link
// (see the earlier RNDocumentPicker incident: a missed `pod install`
// after adding a native package crashed the app until a manual fix).
function ScreenBackground({
  colors,
  edges = [],
  children,
}: Props): React.JSX.Element {
  if (!colors.backgroundGradient || colors.backgroundGradient.length < 2) {
    return (
      <SafeAreaView
        style={[styles.fill, { backgroundColor: colors.background }]}
        edges={edges}>
        {children}
      </SafeAreaView>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="screenBg" x1="0" y1="0" x2="1" y2="1">
            {colors.backgroundGradient.map((stopColor, index) => (
              <Stop
                key={stopColor + index}
                offset={`${
                  (index / (colors.backgroundGradient!.length - 1)) * 100
                }%`}
                stopColor={stopColor}
              />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#screenBg)" />
      </Svg>
      <SafeAreaView style={styles.fill} edges={edges}>
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});

export default ScreenBackground;
