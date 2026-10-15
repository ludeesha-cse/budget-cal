import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import type {
  GestureResponderEvent,
  HostInstance,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollViewProps,
  ViewStyle,
} from 'react-native';
import { useKeyboardOverlap } from '../../hooks/useKeyboardOverlap';

type Props = ScrollViewProps & {
  children?: React.ReactNode;
  // Set this when the surrounding container already lifts itself clear
  // of the keyboard — BottomSheetModal does, by shrinking the box its
  // sheet is laid out in. Without it this view would pad for the same
  // keyboard a second time and the form would end up floating well above
  // it. The headroom below still applies: that part is about how far the
  // user can scroll, not about where the keyboard is.
  keyboardInsetHandledByParent?: boolean;
  // How much of the content has to be able to reach the TOP of the
  // visible area. Roughly "one field", so the last field in a form isn't
  // stuck at the bottom edge with its error text or the next field
  // hidden under the keyboard — see the padding note below.
  focusHeadroom?: number;
  // Receives the inner ScrollView, for a screen that needs to scroll a
  // particular field into view itself (e.g. the first-run screen
  // bringing a missing field on screen when Confirm is pressed).
  scrollViewRef?: React.MutableRefObject<ScrollView | null>;
};

// Breathing room kept above/below a field when scrolling it into view,
// so it never ends up flush against the keyboard or the top edge.
const FOCUS_MARGIN = 16;
const DEFAULT_FOCUS_HEADROOM = 140;

// Two attempts at scrolling the focused field into view: one almost
// immediately (so it feels like a response to the tap) and one after the
// keyboard's own animation has settled, because the first one measures a
// viewport that is often still mid-resize. The scroll is a minimal one,
// so whichever of the two lands second is usually a no-op.
const EARLY_SCROLL_MS = 60;
const SETTLED_SCROLL_MS = 320;
// A tap lands before focus moves; this is the grace period we give it
// before asking which input is focused now.
const FOCUS_SETTLE_MS = 120;

function numericPaddingBottom(style: ScrollViewProps['contentContainerStyle']): number {
  const flat = StyleSheet.flatten(style) as ViewStyle | undefined;
  const explicit = flat?.paddingBottom ?? flat?.paddingVertical ?? flat?.padding;
  return typeof explicit === 'number' ? explicit : 0;
}

// A ScrollView that keeps whatever the user is typing into visible.
//
// Three things, all of which this app needs everywhere it has a form and
// none of which React Native does on its own any more (see
// useKeyboardOverlap for why the OS stopped helping):
//
//  1. It makes room for the keyboard, by measuring what the keyboard is
//     actually covering rather than assuming the window resized.
//  2. It scrolls the focused field into view — on the keyboard opening,
//     and again when focus moves to a different field while the keyboard
//     is already up (no keyboard event fires for that, so a passive touch
//     handler watches for the focused input changing).
//  3. While the keyboard is up it adds enough bottom padding that the
//     LAST field can be scrolled all the way to the top of the visible
//     area. Without it, content simply ends where it ends: the bottom
//     field can be brought level with the keyboard and no further, which
//     leaves it technically visible but pinned to the very edge of the
//     screen with nothing under it.
function KeyboardAwareScrollView({
  children,
  style,
  contentContainerStyle,
  keyboardInsetHandledByParent = false,
  focusHeadroom = DEFAULT_FOCUS_HEADROOM,
  scrollViewRef,
  onLayout,
  onScroll,
  keyboardShouldPersistTaps = 'handled',
  scrollEventThrottle = 16,
  onTouchStart,
  onContentSizeChange,
  ...rest
}: Props): React.JSX.Element {
  const { hostRef, overlap, keyboardVisible } = useKeyboardOverlap();
  const scrollRef = useRef<ScrollView>(null);
  const viewportHeight = useRef(0);
  const scrollOffset = useRef(0);
  const lastFocused = useRef<HostInstance | null>(null);
  // State (not just the refs above) because the headroom below is
  // derived from both and has to survive into the next render.
  const [measuredViewport, setMeasuredViewport] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  const keyboardPadding = keyboardInsetHandledByParent ? 0 : overlap;

  const scrollFocusedInputIntoView = useCallback(() => {
    const scroll = scrollRef.current;
    const input = TextInput.State.currentlyFocusedInput();
    if (!scroll || !input) {
      return;
    }
    // The content view, not the ScrollView itself: measuring against the
    // scroll container would give a position that changes as the user
    // scrolls, which is not something we can compare a scroll offset to.
    const inner = (
      scroll as ScrollView & { getInnerViewRef?: () => unknown }
    ).getInnerViewRef?.();
    if (!inner) {
      return;
    }
    input.measureLayout(
      inner as HostInstance,
      (_x, y, _width, height) => {
        // Not the scroll view's full height: when this component is the
        // one padding for the keyboard, the bottom `keyboardPadding`
        // points of it are behind the keyboard. Measuring against the
        // whole thing would call a field "already in view" while it sat
        // underneath the keys — the exact bug this component exists to
        // fix.
        const viewport = viewportHeight.current - keyboardPadding;
        if (viewport <= 0) {
          return;
        }
        const top = scrollOffset.current;
        const bottom = top + viewport;
        let next: number;
        if (y + height + FOCUS_MARGIN > bottom) {
          next = y + height + FOCUS_MARGIN - viewport;
        } else if (y - FOCUS_MARGIN < top) {
          next = y - FOCUS_MARGIN;
        } else {
          // Already comfortably in view — leave the user's scroll
          // position alone rather than yanking it around.
          return;
        }
        scroll.scrollTo({ y: Math.max(0, next), animated: true });
      },
      () => {},
    );
  }, [keyboardPadding]);

  // The keyboard opening is the one moment we always re-check, whichever
  // field caused it.
  useEffect(() => {
    if (!keyboardVisible) {
      lastFocused.current = null;
      return;
    }
    lastFocused.current = TextInput.State.currentlyFocusedInput();
    const early = setTimeout(scrollFocusedInputIntoView, EARLY_SCROLL_MS);
    const settled = setTimeout(scrollFocusedInputIntoView, SETTLED_SCROLL_MS);
    return () => {
      clearTimeout(early);
      clearTimeout(settled);
    };
    // The overlap is in here on purpose: a keyboard that changes height
    // (emoji panel, a different IME, autocomplete bar) resizes the
    // viewport without ever closing, and the focused field can end up
    // under it again.
  }, [keyboardVisible, overlap, scrollFocusedInputIntoView]);

  // Moving between fields while the keyboard is already up fires no
  // keyboard event at all. onTouchStart is passive — it does not take
  // part in the responder negotiation, so it cannot interfere with
  // scrolling — and we only act when the focused input actually CHANGED,
  // which a scroll drag never does. That's what stops this from dragging
  // the user back to a field they were deliberately scrolling away from.
  const handleTouchStart = useCallback(
    (event: GestureResponderEvent) => {
      onTouchStart?.(event);
      setTimeout(() => {
        const input = TextInput.State.currentlyFocusedInput();
        if (input && input !== lastFocused.current) {
          lastFocused.current = input;
          scrollFocusedInputIntoView();
        }
      }, FOCUS_SETTLE_MS);
    },
    [onTouchStart, scrollFocusedInputIntoView],
  );

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewportHeight.current = event.nativeEvent.layout.height;
      setMeasuredViewport(event.nativeEvent.layout.height);
      onLayout?.(event);
    },
    [onLayout],
  );

  const handleContentSizeChange = useCallback(
    (width: number, height: number) => {
      setContentHeight(height);
      onContentSizeChange?.(width, height);
    },
    [onContentSizeChange],
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollOffset.current = event.nativeEvent.contentOffset.y;
      onScroll?.(event);
    },
    [onScroll],
  );

  // The headroom applies only while the keyboard is up AND the content
  // already overflows the visible area.
  //
  // Both halves matter. At rest the empty space below a short form would
  // just look like a bug. And if everything already fits, there is
  // nothing hidden to scroll up to — but more importantly, inside a
  // BottomSheetModal a non-overflowing scroll view is sized BY its
  // content (`flexGrow: 0`), so padding it would make it taller, which
  // would make the next headroom bigger, and a two-field form would
  // inflate itself pass by pass until it filled the screen. Once the
  // content overflows, the sheet's flexShrink has clamped the viewport
  // and that feedback path is closed.
  const contentOverflows = contentHeight > measuredViewport + 1;
  const visibleViewport = measuredViewport - keyboardPadding;
  const headroom =
    keyboardVisible && contentOverflows && visibleViewport > focusHeadroom
      ? visibleViewport - focusHeadroom
      : 0;
  const extraPadding = keyboardPadding + headroom;

  const content =
    extraPadding > 0
      ? [
          contentContainerStyle,
          {
            paddingBottom:
              numericPaddingBottom(contentContainerStyle) + extraPadding,
          },
        ]
      : contentContainerStyle;

  const scrollView = (
    <ScrollView
      {...rest}
      ref={node => {
        scrollRef.current = node;
        if (scrollViewRef) {
          scrollViewRef.current = node;
        }
      }}
      style={keyboardInsetHandledByParent ? style : styles.fill}
      contentContainerStyle={content}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      scrollEventThrottle={scrollEventThrottle}
      onLayout={handleLayout}
      onScroll={handleScroll}
      onContentSizeChange={handleContentSizeChange}
      onTouchStart={handleTouchStart}
    >
      {children}
    </ScrollView>
  );

  // When the parent owns the keyboard inset there is nothing for this
  // component to measure, so it stays a plain ScrollView and keeps the
  // caller's layout exactly as it was. Otherwise it needs a host view
  // whose height the keyboard padding does NOT change — see
  // useKeyboardOverlap — and the caller's `style` (flex, background)
  // moves onto that host, with the ScrollView filling it.
  if (keyboardInsetHandledByParent) {
    return scrollView;
  }
  return (
    <View ref={hostRef} style={style} collapsable={false}>
      {scrollView}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});

export default KeyboardAwareScrollView;
