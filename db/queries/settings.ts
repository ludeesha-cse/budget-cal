import { eq } from 'drizzle-orm';
import { db } from '../index';
import {
  appMeta,
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
      // paletteId set explicitly here too (not just in seedAppSettings) so
      // this fallback-insert edge case can't silently land on the
      // `palette_id` column's own stale SQL default (see schema.ts).
      await db
        .insert(appSettings)
        .values({ themeMode: mode, paletteId: DEFAULT_PALETTE_ID });
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

// ---------------------------------------------------------------------
// app_meta — first-launch flow state (Stage 19). Separate table from
// app_settings above on purpose; see db/schema.ts's appMeta comment.
// ---------------------------------------------------------------------

export type AppMeta = typeof appMeta.$inferSelect;

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/app-meta, keeping the same return type. app_meta is
// seeded with exactly one row by seedAppMeta() in db/index.ts, so this
// normally always resolves to a row. Returns null rather than throwing on
// a genuinely missing row so the caller (App.tsx's RootFlow) can decide
// what a missing row means — it treats it as "fresh install, show
// onboarding", which is the safe reading: showing the carousel one extra
// time is far less bad than silently skipping first-run currency setup.
export async function getAppMeta(): Promise<AppMeta | null> {
  try {
    const [row] = await db.select().from(appMeta).limit(1);
    return row ?? null;
  } catch (error) {
    console.error('getAppMeta: failed to read app meta row', error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to PATCH /api/app-meta, keeping the same input shape. Updates the
// singleton row in place; falls back to inserting it if seeding somehow
// hasn't run yet, so tapping "Get Started" can never silently no-op and
// strand the user on a carousel that reappears on every launch.
export async function setOnboardingCompleted(): Promise<void> {
  try {
    const [row] = await db.select().from(appMeta).limit(1);
    if (row) {
      await db
        .update(appMeta)
        .set({ onboardingCompleted: true })
        .where(eq(appMeta.id, row.id));
    } else {
      await db.insert(appMeta).values({ onboardingCompleted: true });
    }
  } catch (error) {
    console.error(
      'setOnboardingCompleted: failed to mark onboarding complete',
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to PATCH /api/app-meta, keeping the same input shape. Mirrors
// setOnboardingCompleted exactly, for the other latch.
//
// Also sets onboardingCompleted on the insert fallback path: reaching the
// currency screen at all means the carousel is behind the user, so the
// two flags must never be left in the impossible
// "currency confirmed but onboarding not" state that would send the next
// launch back to slide 1.
export async function setDefaultCurrencyConfirmed(): Promise<void> {
  try {
    const [row] = await db.select().from(appMeta).limit(1);
    if (row) {
      await db
        .update(appMeta)
        .set({ defaultCurrencyConfirmed: true })
        .where(eq(appMeta.id, row.id));
    } else {
      await db
        .insert(appMeta)
        .values({ onboardingCompleted: true, defaultCurrencyConfirmed: true });
    }
  } catch (error) {
    console.error(
      'setDefaultCurrencyConfirmed: failed to mark default currency confirmed',
      error,
    );
    throw error;
  }
}
