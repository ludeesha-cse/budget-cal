// Cycles a palette's `chart` colors (already tuned for telling categories
// apart at a glance in Reports' pie chart) rather than inventing a separate
// avatar color set — the "soft" background is that same color with alpha
// appended (RN supports #RRGGBBAA), so this stays correct across every
// palette, including gradient ones, without needing its own soft-color
// entries in ThemeColors. Used for per-row initial avatars/badges
// (Categories, Recurring Rules' day badge, Liabilities & Receivables).
export function avatarColorsFor(
  index: number,
  chart: string[],
): { bg: string; fg: string } {
  const base = chart[index % chart.length];
  return { bg: `${base}26`, fg: base };
}
