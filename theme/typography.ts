import { Dimensions, Platform, TextStyle } from 'react-native';

// System fonts only — no bundled/custom font files. Georgia and Menlo
// (iOS) / the generic 'serif'/'monospace' aliases (Android) ship with
// every device already, so there's no font-linking step (Info.plist
// entries, Android assets, react-native.config.js, a rebuild) to get
// wrong. Close enough to the mockups to read as "an editorial ledger",
// not a pixel-exact match — swapping in a bundled Google Font later is a
// contained change (this file, plus the linking step) if closer fidelity
// ever matters more than that simplicity.
export const fontFamily = {
  serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
  serifBold: Platform.select({
    ios: 'Georgia-Bold',
    android: 'serif',
    default: 'serif',
  }),
  mono: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'monospace',
  }),
};

// Every fontSize in this file (and in each screen's own StyleSheet — see
// the scaleFont() call sites throughout Dashboard/History/Reports/
// SettingsHome/AppSettingsScreen) was authored against this width, a
// reasonable mid-size phone. Scaling by the device's actual window width
// keeps text at roughly the same PROPORTION of the screen on a small
// phone (an iPhone SE at 375pt) as on a large one, instead of a fixed
// pixel size that reads relatively huge on a small screen and small on a
// big one.
const BASE_WIDTH = 390;

// Clamped to +/-18% so a tiny device can't shrink text into illegibility
// and a tablet can't blow it up absurdly — this is a screen-size
// adjustment, not the main driver of how big text ultimately renders
// (the OS's own accessibility text-size setting, which every RN <Text>
// already respects via allowFontScaling, does far more of that; this
// only corrects for the device itself).
const MIN_SCALE = 0.88;
const MAX_SCALE = 1.15;

let cachedScale: number | null = null;
function screenScale(): number {
  if (cachedScale == null) {
    const { width } = Dimensions.get('window');
    cachedScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, width / BASE_WIDTH));
  }
  return cachedScale;
}

// Scales a design fontSize for the current device's screen width. Safe to
// call at module-eval time (as typography's own presets below do) since
// Dimensions.get('window') is available before first render — RN
// populates it from the native side synchronously at startup, unlike
// layout measurements that need an actual mount.
export function scaleFont(size: number): number {
  return Math.round(size * screenScale());
}

// Reusable presets for the recurring text roles in the new design —
// screens compose these with their own color/margin rather than each
// re-declaring fontFamily/letterSpacing by hand, so every "eyebrow"
// label across the app stays in sync if this changes.
export const typography = {
  // "FRIDAY, 7 AUG", "THIS MONTH'S BUDGET", "BY CATEGORY" — small
  // uppercase mono labels used as section/date headers.
  eyebrow: {
    fontFamily: fontFamily.mono,
    fontSize: scaleFont(11),
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  } satisfies TextStyle,
  // "Ledger", "History", "Reports" — the big serif screen title.
  screenTitle: {
    fontFamily: fontFamily.serifBold,
    fontSize: scaleFont(30),
    fontWeight: '700',
  } satisfies TextStyle,
  // "Overall — August", card/section headings.
  cardTitle: {
    fontFamily: fontFamily.serif,
    fontSize: scaleFont(16),
    fontWeight: '600',
  } satisfies TextStyle,
  // "Rs. 31,000" — the large serif figure on the budget card.
  amountLarge: {
    fontFamily: fontFamily.serifBold,
    fontSize: scaleFont(32),
    fontWeight: '700',
  } satisfies TextStyle,
  // Row-level amounts ("-3,500", "+45,000"), percentages, and other
  // small numeric readouts that want tabular/monospaced digits.
  amountMono: {
    fontFamily: fontFamily.mono,
    fontWeight: '700',
  } satisfies TextStyle,
  // Everyday body text (transaction descriptions, row labels) — plain
  // system font, no override, kept here just so call sites can still
  // reference `typography.body` instead of omitting fontFamily by hand.
  body: {} satisfies TextStyle,
};
