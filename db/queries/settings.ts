import { eq } from 'drizzle-orm';
import { db } from '../index';
import {
  appSettings,
} from '../schema';
import { DEFAULT_PALETTE_ID } from '../../theme/palettes';

export type ThemeMode = 'light' | 'dark' | 'system';

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/settings, keeping the same return type. app_settings
// is seeded with exactly one row (id=1) by ensureAppSettingsRow() in
// db/index.ts, so this always resolves — the 'system' fallback only
// covers the theoretical case where that seeding hasn't run yet.
export async function getThemeMode(): Promise<ThemeMode> {
  try {
    const [row] = await db.select().from(appSettings).limit(1);
    return row?.themeMode ?? 'system';
  } catch (error) {
    console.error('getThemeMode: failed to read theme mode', error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to PATCH /api/settings, keeping the same input shape. Updates the
// singleton row in place; falls back to inserting it if seeding somehow
// hasn't run yet, so this never silently no-ops.
export async function setThemeMode(mode: ThemeMode): Promise<void> {
  try {
    const [row] = await db.select().from(appSettings).limit(1);
    if (row) {
      await db
        .update(appSettings)
        .set({ themeMode: mode })
        .where(eq(appSettings.id, row.id));
    } else {
      await db.insert(appSettings).values({ themeMode: mode });
    }
  } catch (error) {
    console.error('setThemeMode: failed to save theme mode', mode, error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/settings, keeping the same return type. Mirrors
// getThemeMode exactly, just for the other independent preference
// (which entry of theme/palettes.ts's PALETTES is active) — kept as its
// own column/function rather than folded into ThemeMode since "light vs
// dark" and "which palette" are separate choices.
export async function getPaletteId(): Promise<string> {
  try {
    const [row] = await db.select().from(appSettings).limit(1);
    return row?.paletteId ?? DEFAULT_PALETTE_ID;
  } catch (error) {
    console.error('getPaletteId: failed to read palette id', error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to PATCH /api/settings, keeping the same input shape. Mirrors
// setThemeMode exactly.
export async function setPaletteId(paletteId: string): Promise<void> {
  try {
    const [row] = await db.select().from(appSettings).limit(1);
    if (row) {
      await db
        .update(appSettings)
        .set({ paletteId })
        .where(eq(appSettings.id, row.id));
    } else {
      await db.insert(appSettings).values({ paletteId });
    }
  } catch (error) {
    console.error('setPaletteId: failed to save palette id', paletteId, error);
    throw error;
  }
}

