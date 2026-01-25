import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import { getThemeMode, setThemeMode, ThemeMode } from '../db/queries';

export type ColorScheme = 'light' | 'dark';

export type ThemeColors = {
  background: string;
  surface: string;
  card: string;
  border: string;
  text: string;
  textSecondary: string;
  primary: string;
  primaryText: string;
  success: string;
  danger: string;
  warning: string;
  chevron: string;
};

// Flat token palettes rather than a component-styling library — this
// mirrors how every screen already builds its own StyleSheet, just
// swapping which literal color values feed it. Keep keys in sync between
// the two palettes so screens never have to branch on scheme by hand.
const LIGHT_COLORS: ThemeColors = {
  background: '#f2f2f2',
  surface: '#ffffff',
  card: '#ffffff',
  border: '#cccccc',
  text: '#1a1a1a',
  textSecondary: '#666666',
  primary: '#1565c0',
  primaryText: '#ffffff',
  success: '#2e7d32',
  danger: '#c62828',
  warning: '#e65100',
  chevron: '#999999',
};

const DARK_COLORS: ThemeColors = {
  background: '#121212',
  surface: '#1e1e1e',
  card: '#242424',
  border: '#3a3a3a',
  text: '#f2f2f2',
  textSecondary: '#a0a0a0',
  primary: '#5c9be8',
  primaryText: '#0a0a0a',
  success: '#66bb6a',
  danger: '#ef5350',
  warning: '#ffb74d',
  chevron: '#8a8a8a',
};

type ThemeContextValue = {
  // The user's stored preference — may be 'system'.
  mode: ThemeMode;
  // The actually-applied scheme once 'system' is resolved against the
  // device setting — always 'light' or 'dark', never 'system'. Screens
  // should render off `colors`/`scheme`, not `mode`.
  scheme: ColorScheme;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

type ThemeProviderProps = {
  children: React.ReactNode;
};

// Mounted only after runMigrations()/ensureDefaultAccount() succeed (see
// App.tsx), so the app_settings row is guaranteed to already be seeded by
// the time the initial getThemeMode() read below runs.
export function ThemeProvider({
  children,
}: ThemeProviderProps): React.JSX.Element {
  const deviceScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    let cancelled = false;
    getThemeMode()
      .then(stored => {
        if (!cancelled) {
          setModeState(stored);
        }
      })
      .catch(error => {
        // Already logged inside getThemeMode; falling back to the
        // in-memory 'system' default here just keeps the app usable.
        console.error('ThemeProvider: failed to load stored theme mode', error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    // Update in-memory state immediately so the UI responds without
    // waiting on the DB write; the write itself happens in the
    // background and is logged (not thrown) if it fails, so a save
    // hiccup never reverts what's already on screen.
    setModeState(next);
    setThemeMode(next).catch(error => {
      console.error('ThemeProvider: failed to persist theme mode', next, error);
    });
  }, []);

  const scheme: ColorScheme = useMemo(() => {
    if (mode === 'system') {
      return deviceScheme === 'dark' ? 'dark' : 'light';
    }
    return mode;
  }, [mode, deviceScheme]);

  const colors = scheme === 'dark' ? DARK_COLORS : LIGHT_COLORS;

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, scheme, colors, setMode }),
    [mode, scheme, colors, setMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
