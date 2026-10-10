import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../contexts/ThemeContext';
import type { ColorScheme } from '../contexts/ThemeContext';
import type { ThemeMode } from '../db/queries';
import type { Palette } from '../theme/palettes';
import { scaleFont } from '../theme/typography';
import { FAB_CLEARANCE } from '../theme/layout';

const THEME_OPTIONS: { key: ThemeMode; label: string }[] = [
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: 'system', label: 'System' },
];


// gradient sweep, resolved against the CURRENT scheme (not necessarily
// the palette's dark variant) so "Light"/"Dark"/"System" above and the
// swatch below always agree with each other. Picking a palette used to be
// a blind choice between two plain-text buttons; this makes it a visual
// one, the same way a real color picker would.
function PaletteSwatch({
  palette,
  scheme,
}: {
  palette: Palette;
  scheme: ColorScheme;
}): React.JSX.Element {
  const themeColors = scheme === 'dark' ? palette.dark : palette.light;
  const gradient = themeColors.backgroundGradient;
  const gradientId = `palette-swatch-${palette.id}-${scheme}`;

  return (
    <View
      style={[
        styles.swatch,
        { borderColor: themeColors.border, backgroundColor: themeColors.background },
      ]}>
      {gradient && gradient.length >= 2 && (
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
      )}
      <View style={[styles.swatchAccentDot, { backgroundColor: themeColors.primary }]} />
    </View>
  );
}

function AppSettingsScreen(): React.JSX.Element {
  const {
    colors,
    scheme,
    mode,
    setMode,
    paletteId,
    setPaletteId,
    availablePalettes,
  } = useTheme();

  return (
    // Scrolls so the palette cards stay reachable on short screens and with
    // a large system font size, where they used to run off the bottom.
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.container}>
      <Text style={[styles.label, { color: colors.text }]}>Theme</Text>
      <View style={styles.optionRow}>
        {THEME_OPTIONS.map(option => {
          const selected = mode === option.key;
          return (
            <Pressable
              key={option.key}
              style={[
                styles.option,
                { borderColor: colors.border },
                selected && {
                  backgroundColor: colors.primary,
                  borderColor: colors.primary,
                },
              ]}
              onPress={() => setMode(option.key)}>
              <Text
                style={[
                  styles.optionText,
                  { color: selected ? colors.primaryText : colors.text },
                ]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.label, styles.paletteLabel, { color: colors.text }]}>
        Color Theme
      </Text>
      <View style={styles.optionRow}>
        {availablePalettes.map(palette => {
          const selected = paletteId === palette.id;
          const isGradient =
            (scheme === 'dark' ? palette.dark : palette.light)
              .backgroundGradient != null;
          return (
            <Pressable
              key={palette.id}
              style={[
                styles.paletteOption,
                { borderColor: colors.border },
                selected && { borderColor: colors.primary },
              ]}
              onPress={() => setPaletteId(palette.id)}>
              <PaletteSwatch palette={palette} scheme={scheme} />
              <Text
                style={[
                  styles.optionText,
                  styles.paletteOptionText,
                  { color: selected ? colors.primary : colors.text },
                ]}>
                {palette.label}
              </Text>
              <Text style={[styles.paletteOptionHint, { color: colors.textSecondary }]}>
                {isGradient ? 'Gradient' : 'Flat'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    padding: 16,
    paddingBottom: FAB_CLEARANCE,
  },
  label: {
    fontSize: scaleFont(14),
    fontWeight: '600',
    marginBottom: 12,
  },
  paletteLabel: {
    marginTop: 24,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  option: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  optionText: {
    fontSize: scaleFont(14),
    fontWeight: '600',
  },
  paletteOption: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 2,
    padding: 8,
    alignItems: 'center',
  },
  paletteOptionText: {
    marginTop: 8,
    textAlign: 'center',
  },
  paletteOptionHint: {
    fontSize: scaleFont(11),
    marginTop: 2,
  },
  swatch: {
    width: '100%',
    height: 56,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  swatchAccentDot: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});

export default AppSettingsScreen;
