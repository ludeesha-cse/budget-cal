import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import {
  getPaletteId,
  getThemeMode,
  setPaletteId as persistPaletteId,
  setThemeMode,
  ThemeMode,
} from '../db/queries';
import { PALETTES, getPalette, DEFAULT_PALETTE_ID } from '../theme/palettes';
import type { Palette } from '../theme/palettes';

export type ColorScheme = 'light' | 'dark';

// Re-exported so existing `import type { ThemeColors } from
// '../contexts/ThemeContext'` call sites keep working — theme/palettes.ts
// is the actual source of truth now (see its own header comment for why),
// this file just wires it into React state/persistence.
export type { ThemeColors } from '../theme/palettes';

type ThemeContextValue = {
  // The user's stored preference — may be 'system'.
  mode: ThemeMode;
  // The actually-applied scheme once 'system' is resolved against the
  // device setting — always 'light' or 'dark', never 'system'. Screens
  // should render off `colors`/`scheme`, not `mode`.
  scheme: ColorScheme;
  colors: import('../theme/palettes').ThemeColors;
  setMode: (mode: ThemeMode) => void;
  // Which theme/palettes.ts entry is active, plus the setter and the
  // full list — AppSettingsScreen's palette picker renders straight off
  // `availablePalettes`, so adding a palette to that one file is enough
  // to make it choosable here with no further wiring.
  paletteId: string;
  setPaletteId: (paletteId: string) => void;
  availablePalettes: Palette[];
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

type ThemeProviderProps = {
  children: React.ReactNode;
};

// Mounted only after runMigrations()/ensureDefaultAccount() succeed (see
// App.tsx), so the app_settings row is guaranteed to already be seeded by
// the time the initial getThemeMode()/getPaletteId() reads below run.
export function ThemeProvider({
  children,
}: ThemeProviderProps): React.JSX.Element {
  const deviceScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [paletteId, setPaletteIdState] = useState<string>(DEFAULT_PALETTE_ID);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getThemeMode(), getPaletteId()])
      .then(([storedMode, storedPaletteId]) => {
        if (!cancelled) {
          setModeState(storedMode);
          setPaletteIdState(storedPaletteId);
        }
      })
      .catch(error => {
        // Already logged inside getThemeMode/getPaletteId; falling back
        // to the in-memory defaults here just keeps the app usable.
        console.error('ThemeProvider: failed to load stored theme prefs', error);
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

  const setPaletteId = useCallback((next: string) => {
    setPaletteIdState(next);
    persistPaletteId(next).catch(error => {
      console.error('ThemeProvider: failed to persist palette id', next, error);
    });
  }, []);

  const scheme: ColorScheme = useMemo(() => {
    if (mode === 'system') {
      return deviceScheme === 'dark' ? 'dark' : 'light';
    }
    return mode;
  }, [mode, deviceScheme]);

  const palette = useMemo(() => getPalette(paletteId), [paletteId]);
  const colors = scheme === 'dark' ? palette.dark : palette.light;

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      scheme,
      colors,
      setMode,
      paletteId,
      setPaletteId,
      availablePalettes: PALETTES,
    }),
    [mode, scheme, colors, setMode, paletteId, setPaletteId],
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
