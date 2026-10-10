import { Platform } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

// Layout measurements shared by everything that has to line up with the
// floating tab bar (App.tsx), the FAB that sits on top of it, the
// AddEntrySheet that opens just above it, and the screens scrolling
// underneath. Keeping them in one place is what stops them drifting
// apart from each other on devices nobody tuned them on.

// The pill's own height. Fixed, and deliberately NOT including the
// device's bottom inset — React Navigation's default tab bar pads itself
// by insets.bottom on the inside, which with a fixed height like this
// one eats the icon/label area. That's exactly what clipped every label
// on edge-to-edge Android with 3-button navigation (insets.bottom ~48dp
// left ~16dp for icon + label). App.tsx zeroes that inner padding and
// carries the inset as a margin below the pill instead.
export const TAB_BAR_HEIGHT = 64;

// Gap between the pill and the device's own safe-area edge, on top of
// insets.bottom (not instead of it). iOS's inset is already a real gap
// (~34pt on a Face ID device), so it needs far less extra than Android,
// whose inset is ~0 with gesture nav on older versions.
export const TAB_BAR_BOTTOM_GAP = Platform.OS === 'ios' ? 6 : 16;

export const TAB_BAR_SIDE_MARGIN = 16;

// Past this width (tablets, phones in landscape) the pill stops
// stretching edge-to-edge and stays a centered, thumb-sized bar.
export const TAB_BAR_MAX_WIDTH = 520;

export const FAB_SIZE = 56;
// How far the FAB's bottom edge sits below the pill's top edge — keeps it
// poking up out of the bar by a fixed, deliberate amount.
export const FAB_OVERLAP_INTO_BAR = 22;

// Widest a screen's content column gets. Phones never reach it; on a
// tablet or a phone in landscape it keeps forms, lists and cards a
// readable width instead of stretching across the whole display.
export const MAX_CONTENT_WIDTH = 720;

// Same idea for bottom sheets and other modal cards.
export const MAX_SHEET_WIDTH = 640;

// Bottom padding a scrolling tab screen gives its content so the last row
// scrolls well clear of the FAB. The pill itself is laid out in normal
// flow (a screen already ends at its top edge), so only the part of the
// FAB poking up above it plus breathing room has to be cleared — which
// is why this is a constant and does NOT depend on the device's inset.
export const SCREEN_BOTTOM_CLEARANCE = 120;

// The tighter version for lists and forms that already sit inside a
// padded container: just enough that the last row's middle — where the
// centered FAB pokes up above the pill — can scroll out from under it.
export const FAB_CLEARANCE = FAB_SIZE - FAB_OVERLAP_INTO_BAR + 24;

// Distance from the bottom of the window to the top of the pill.
export function tabBarTopOffset(insets: EdgeInsets): number {
  return insets.bottom + TAB_BAR_BOTTOM_GAP + TAB_BAR_HEIGHT;
}

// Horizontal margin that keeps the pill at most TAB_BAR_MAX_WIDTH wide
// and clear of any landscape notch/cut-out.
export function tabBarSideMargin(
  windowWidth: number,
  insets: EdgeInsets,
): number {
  const minimum =
    TAB_BAR_SIDE_MARGIN + Math.max(insets.left, insets.right);
  return Math.max(minimum, (windowWidth - TAB_BAR_MAX_WIDTH) / 2);
}
