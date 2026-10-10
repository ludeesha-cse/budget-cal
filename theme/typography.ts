import { Dimensions, Platform, TextStyle } from 'react-native';

export const fontFamily = {
  serif: Platform.select({
    ios: 'AvenirNext-Medium',
    android: 'sans-serif-medium',
    default: 'sans-serif',
  }),
  serifBold: Platform.select({
    ios: 'AvenirNext-Bold',
    android: 'sans-serif-medium',
    default: 'sans-serif',
  }),
  mono: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'monospace',
  }),
};

const BASE_WIDTH = 390;


const MIN_SCALE = 0.88;
const MAX_SCALE = 1.15;

let cachedScale: number | null = null;
function screenScale(): number {
  if (cachedScale == null) {
    // The SHORTER side, not `width`: this is read once and cached, and
    // width is the long side when the app happens to launch in landscape
    // — which would pin every font at MAX_SCALE until the next cold start.
    const { width, height } = Dimensions.get('window');
    const shortSide = Math.min(width, height);
    cachedScale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, shortSide / BASE_WIDTH),
    );
  }
  return cachedScale;
}

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
  // "Ledger", "History", "Reports" — the big screen title.
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
  // "Rs. 31,000" — the large figure on the budget card.
  amountLarge: {
    fontFamily: fontFamily.serifBold,
    fontSize: scaleFont(32),
    fontWeight: '700',
  } satisfies TextStyle,
  amountMid: {
    fontFamily: fontFamily.serifBold,
    fontSize: scaleFont(16),
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
