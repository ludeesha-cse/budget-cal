// The single place to add a new color theme. Every screen already reads
// its colors exclusively through useTheme().colors (contexts/ThemeContext.tsx)
// rather than any hardcoded literal, so adding a palette here — and
// nowhere else — is enough to make it selectable app-wide (see
// AppSettingsScreen's palette picker). Two rules keep that true:
//   1. Every palette must define every key in ThemeColors, for both
//      `light` and `dark` — a screen should never have to branch on
//      which palette is active, only on colors.<token>.
//   2. Never rename or remove an existing ThemeColors key without
//      updating every screen that already reads it — the whole app
//      leans on these names staying stable.

export type ThemeColors = {
  background: string;
  surface: string;
  card: string;
  border: string;
  text: string;
  textSecondary: string;
  primary: string;
  // Text/icon color for anything drawn ON TOP of a `primary`-filled
  // shape (the FAB, an active filter pill, an active tab). Deliberately
  // NOT assumed to be white — the ledger palette's gold is light enough
  // that dark ink reads better on it in both light and dark mode.
  primaryText: string;
  success: string;
  danger: string;
  warning: string;
  chevron: string;
  // Pale, low-contrast tints of success/danger/primary/neutral — the
  // category-avatar and status-badge backgrounds behind full-strength
  // text/icons of the matching color (e.g. a green-tinted circle behind
  // a `success`-colored letter).
  successSoft: string;
  dangerSoft: string;
  primarySoft: string;
  neutralSoft: string;
  // Rotation for category pie/bar charts (ReportsScreen). Cycles if
  // there are more categories than colors — see utils/chartHelpers.ts.
  chart: string[];
  // Optional diagonal sweep (top-left → bottom-right) rendered behind a
  // screen's content instead of a flat `background` fill — see
  // components/ScreenBackground.tsx, which every top-level tab screen
  // renders as its root instead of its own SafeAreaView. Two or more
  // stops, first-to-last. `background` itself is still required even
  // when this is set — it's the flat fallback anywhere a gradient can't
  // be drawn (the OS status bar / React Navigation's own theme.colors.card,
  // neither of which can render an SVG), so it should be close to the
  // gradient's own average tone rather than left as some unrelated color.
  backgroundGradient?: string[];
  // Same idea as `backgroundGradient`, but for the rounded/bordered card
  // boxes every screen groups content into (see components/Card.tsx,
  // which every card-shaped View across Dashboard/Reports/SettingsHome
  // renders through instead of a plain View). Deliberately subtle when
  // set — text and icons sit directly on top of a card, so this should
  // read as a soft sheen close to `card`'s own tone, not a bold sweep
  // like the screen background gets away with.
  cardGradient?: string[];
};

export type Palette = {
  id: string;
  label: string;
  light: ThemeColors;
  dark: ThemeColors;
};

const LEDGER: Palette = {
  id: 'ledger',
  label: 'Ledger',
  light: {
    background: '#F1EFEA',
    surface: '#FFFFFF',
    card: '#FFFFFF',
    border: '#E6E2D8',
    text: '#1E1B16',
    textSecondary: '#8C8579',
    primary: '#B98D4E',
    primaryText: '#1E1B16',
    success: '#5B8A63',
    danger: '#A24E3B',
    warning: '#BD8034',
    chevron: '#A39C8E',
    successSoft: '#DCEBDD',
    dangerSoft: '#F4DCD4',
    primarySoft: '#F0E4CC',
    neutralSoft: '#E7E4DC',
    chart: ['#A24E3B', '#B98D4E', '#5B8A63', '#9C978A', '#6E7F9C', '#8C6E9C'],
  },
  dark: {
    background: '#15130F',
    surface: '#1C1811',
    card: '#1C1811',
    border: '#2E2A21',
    text: '#F1EAD9',
    textSecondary: '#8E8778',
    primary: '#D6A85E',
    primaryText: '#17140F',
    success: '#7CAE84',
    danger: '#C97C68',
    warning: '#D6A85E',
    chevron: '#6E6A5F',
    successSoft: '#24312A',
    dangerSoft: '#34241F',
    primarySoft: '#332B1C',
    neutralSoft: '#26221A',
    chart: ['#C97C68', '#D6A85E', '#7CAE84', '#8A8578', '#7C93B8', '#A084AE'],
  },
};

// Same accent/text/status relationships as LEDGER's dark scheme (a
// user-visible screenshot of that scheme is literally what "Platinum" was
// requested to match) — the one real difference is `backgroundGradient`,
// a warm graphite-to-black sweep standing in for LEDGER's flat
// `background`, giving the screen behind every card a soft sheen instead
// of a single flat tone. Cards/surfaces stay flat on purpose: a gradient
// on every card as well would fight the content sitting on top of it,
// where the mockup's own cards read as solid.
const PLATINUM: Palette = {
  id: 'platinum',
  label: 'Platinum',
  light: {
    background: '#EDEBE5',
    surface: '#FFFFFF',
    card: '#FFFFFF',
    border: '#E1DDD2',
    text: '#1E1B16',
    textSecondary: '#8C8579',
    primary: '#B98D4E',
    primaryText: '#1E1B16',
    success: '#5B8A63',
    danger: '#A24E3B',
    warning: '#BD8034',
    chevron: '#A39C8E',
    successSoft: '#DCEBDD',
    dangerSoft: '#F4DCD4',
    primarySoft: '#F0E4CC',
    neutralSoft: '#E7E4DC',
    chart: ['#A24E3B', '#B98D4E', '#5B8A63', '#9C978A', '#6E7F9C', '#8C6E9C'],
    backgroundGradient: ['#FAF8F3', '#EFEBE0', '#DCD6C6'],
    cardGradient: ['#FFFFFF', '#F6F3EC'],
  },
  dark: {
    background: '#17140F',
    surface: '#1C1811',
    card: '#1C1811',
    border: '#2E2A21',
    text: '#F1EAD9',
    textSecondary: '#8E8778',
    primary: '#D6A85E',
    primaryText: '#17140F',
    success: '#7CAE84',
    danger: '#C97C68',
    warning: '#D6A85E',
    chevron: '#6E6A5F',
    successSoft: '#24312A',
    dangerSoft: '#34241F',
    primarySoft: '#332B1C',
    neutralSoft: '#26221A',
    chart: ['#C97C68', '#D6A85E', '#7CAE84', '#8A8578', '#7C93B8', '#A084AE'],
    backgroundGradient: ['#28241C', '#18150F', '#0C0B09'],
    cardGradient: ['#3d3c3c', '#24211b'],
  },
};

// Premium fintech palette — dark side uses the "Obsidian" brief (deep
// near-black canvas, emerald as the single primary/success color, gold
// reserved for warning/premium accents per the existing `warning`
// convention above), light side is the "Executive Reserve" brief (crisp
// alabaster + institutional navy + muted teal). Unlike PLATINUM, both
// modes get a gradient — the brief explicitly asked for "suitable
// gradient colors for cards and stuff" rather than treating gradients as
// a dark-only flourish.
const RESERVE: Palette = {
  id: 'reserve',
  label: 'Executive Reserve',
  light: {
    background: '#F8FAFC',
    surface: '#FFFFFF',
    card: '#FFFFFF',
    border: '#E2E8F0',
    text: '#0F172A',
    textSecondary: '#64748B',
    primary: '#0D9488',
    primaryText: '#FFFFFF',
    success: '#0D9488',
    danger: '#B91C1C',
    warning: '#B45309',
    chevron: '#94A3B8',
    successSoft: '#CCFBF1',
    dangerSoft: '#FEE2E2',
    primarySoft: '#D9F5F1',
    neutralSoft: '#F1F5F9',
    chart: ['#0D9488', '#B45309', '#0F172A', '#64748B', '#B91C1C', '#7C3AED'],
    backgroundGradient: ['#FFFFFF', '#F8FAFC', '#EEF2F6'],
    cardGradient: ['#FFFFFF', '#F8FAFC'],
  },
  dark: {
    background: '#0B0F19',
    surface: '#131B2E',
    card: '#131B2E',
    border: '#1E293B',
    text: '#F1F5F9',
    textSecondary: '#94A3B8',
    primary: '#00C896',
    primaryText: '#04120E',
    success: '#00C896',
    danger: '#F87171',
    warning: '#E2C08A',
    chevron: '#64748B',
    successSoft: '#0F3B31',
    dangerSoft: '#3B1518',
    primarySoft: '#123C33',
    neutralSoft: '#1B2436',
    chart: ['#00C896', '#E2C08A', '#38BDF8', '#94A3B8', '#F87171', '#A78BFA'],
    backgroundGradient: ['#0F1626', '#0B0F19', '#070A11'],
    cardGradient: ['#182338', '#131B2E'],
  },
};

// Add a new theme by appending another Palette here — nothing else in
// the app needs to change for it to show up in AppSettingsScreen's
// picker and become selectable.
export const PALETTES: Palette[] = [RESERVE, LEDGER, PLATINUM];

export const DEFAULT_PALETTE_ID = 'reserve';

export function getPalette(paletteId: string): Palette {
  return PALETTES.find(p => p.id === paletteId) ?? RESERVE;
}
