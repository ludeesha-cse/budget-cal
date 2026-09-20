import { useEffect, useRef, useState } from 'react';
import { Keyboard, LayoutAnimation, Platform } from 'react-native';
import type { View } from 'react-native';

// Fallback only — every real keyboard event carries its own duration and
// we use that instead, so this is just what we animate by if a platform
// ever reports 0.
export const KEYBOARD_TRANSITION_MS = 250;

export type KeyboardOverlap = {
  // Put this on the view whose bottom edge must stay clear of the
  // keyboard. It has to be a view whose own height is NOT affected by
  // the inset this hook returns, otherwise measuring it re-measures our
  // own correction and the value oscillates.
  hostRef: React.RefObject<View | null>;
  // How many points of that view the keyboard is currently covering.
  overlap: number;
  keyboardVisible: boolean;
};

// HOW MUCH OF A VIEW THE KEYBOARD IS ACTUALLY COVERING — measured, not
// assumed.
//
// The assumption this replaces was "Android resizes the window for us,
// so the inset is 0 there and only iOS owes anything". That WAS true,
// and stopped being true: this app targets SDK 36, and from Android 15
// on an app is edge-to-edge whether it asks to be or not, which makes
// `windowSoftInputMode` (adjustResize AND adjustPan) a no-op — the
// keyboard is simply drawn over the window, and nothing below it moves.
// On top of that, a React Native <Modal> with `statusBarTranslucent`
// sets FLAG_LAYOUT_NO_LIMITS on its dialog window, which independently
// stops that window from ever being resized for the IME. So a sheet that
// assumed the OS had already made room sat there with its lower half —
// the fields being typed into — behind the keyboard.
//
// Rather than swap one platform assumption for another (and re-break the
// case where the window DOES resize, which is what an earlier fix did by
// subtracting the keyboard height twice and pushing a sheet's title off
// the top of the screen), this measures the thing itself: where does the
// host view's bottom edge actually sit, and where does the keyboard's
// top edge actually sit? The difference is the only number anyone needs,
// and it is correct under every combination of the above:
//
//   - window not resized (today's Android, and iOS always):
//       host bottom = screen bottom, so overlap = keyboard height.
//   - window resized (older Androids, future OS changes):
//       host bottom is already above the keyboard, so overlap ~= 0 and
//       we add nothing on top of what the OS did.
//
// The keyboard event still supplies the animation duration, so the
// resulting layout change is animated in step with the keyboard itself.
export function useKeyboardOverlap(): KeyboardOverlap {
  const hostRef = useRef<View | null>(null);
  const [overlap, setOverlap] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const isIOS = Platform.OS === 'ios';
    // iOS gets the `will` events so the layout moves with the keyboard
    // rather than after it. Android only emits `did`, and emitting our
    // change before the IME insets have settled there would measure the
    // pre-keyboard world anyway.
    const showEvent = isIOS ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = isIOS ? 'keyboardWillHide' : 'keyboardDidHide';
    let cancelled = false;

    const animateNext = (duration?: number) =>
      LayoutAnimation.configureNext(
        LayoutAnimation.create(
          duration && duration > 0 ? duration : KEYBOARD_TRANSITION_MS,
          LayoutAnimation.Types.easeInEaseOut,
          LayoutAnimation.Properties.opacity,
        ),
      );

    const showSub = Keyboard.addListener(showEvent, event => {
      setKeyboardVisible(true);
      const keyboardTop = event.endCoordinates.screenY;
      const host = hostRef.current;
      if (!host) {
        // Nothing to measure against yet: assume the worst (nothing
        // moved for us) rather than assume the best.
        animateNext(event.duration);
        setOverlap(event.endCoordinates.height);
        return;
      }
      host.measureInWindow((_x, y, _width, height) => {
        if (cancelled) {
          return;
        }
        animateNext(event.duration);
        setOverlap(Math.max(0, Math.round(y + height - keyboardTop)));
      });
    });

    const hideSub = Keyboard.addListener(hideEvent, event => {
      animateNext(event.duration);
      setKeyboardVisible(false);
      setOverlap(0);
    });

    return () => {
      cancelled = true;
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return { hostRef, overlap, keyboardVisible };
}
