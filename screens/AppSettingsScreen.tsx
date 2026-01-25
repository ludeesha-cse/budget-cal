import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeMode } from '../db/queries';

const THEME_OPTIONS: { key: ThemeMode; label: string }[] = [
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: 'system', label: 'System' },
];

// Its own dedicated page, reached from More/Settings the same way as
// Accounts, Categories, Currencies etc. — not a section bolted onto the
// SettingsHome list. Currently just the theme picker; the shape (a plain
// screen under the Settings stack) leaves room for more app-wide toggles
// later without changing how it's navigated to.
function AppSettingsScreen(): React.JSX.Element {
  const { colors, mode, setMode } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
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
    fontSize: 14,
    fontWeight: '600',
  },
});

export default AppSettingsScreen;
