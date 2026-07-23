import React, {
  createContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Dimensions,
  Keyboard,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ViewStyle } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../contexts/ThemeContext';
import { typography, scaleFont } from '../theme/typography';
import { MODAL_TRANSITION_MS } from '../theme/motion';
import { useSlideSheet } from '../hooks/useSlideSheet';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSave?: () => void;
  canSave?: boolean;
  title?: string;
  saveLabel?: string;
  cancelLabel?: string;
  saveDestructive?: boolean;
  children: React.ReactNode;
  onFullyClosed?: () => void;
};

export type BottomSheetPickerOption = {
  label: string;
  value: string;
};

type PickerConfig = {
  title: string;
  items: BottomSheetPickerOption[];
  selectedValue: string;
  onSelect: (value: string) => void;
};

type PickerHost = {
  openPicker: (config: PickerConfig) => void;
};
export const BottomSheetPickerContext = createContext<PickerHost | null>(null);

const SCREEN_HEIGHT = Dimensions.get('window').height;

// PickerOverlay (below) is a second, layered sheet with the exact same
// "slide up from the bottom" shape as useSlideSheet (hooks/useSlideSheet.ts)
// but nested inside this same native Modal rather than a Modal of its
// own, so it can't reuse that hook directly — same two-frame delay before
// starting the opening animation, for the same reason (see that hook's
// own comment): starting .start() in the same tick as the setState that
// mounts this view races its first paint, eating most of the slide's
// frames before there's anything on screen to show them.
function useSlideAnimation(visible: boolean) {
  const [rendered, setRendered] = useState(visible);
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setRendered(true);
      translateY.setValue(SCREEN_HEIGHT);
      backdropOpacity.setValue(0);
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          Animated.parallel([
            Animated.timing(translateY, {
              toValue: 0,
              duration: MODAL_TRANSITION_MS,
              useNativeDriver: true,
            }),
            Animated.timing(backdropOpacity, {
              toValue: 1,
              duration: MODAL_TRANSITION_MS,
              useNativeDriver: true,
            }),
          ]).start();
        });
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    if (rendered) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT,
          duration: MODAL_TRANSITION_MS,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: MODAL_TRANSITION_MS,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setRendered(false);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return { rendered, translateY, backdropOpacity };
}

const KEYBOARD_TRANSITION_MS = 450;

// How much of the screen stays clear above a sheet, so the backdrop is
// always visibly a backdrop and the sheet never reads as a full screen
// that has lost its header. Expressed as a fixed margin rather than a
// percentage on purpose — see sheetContainerInset below.
const SHEET_TOP_GUTTER = 64;
// The picker sheet stacks ON TOP of the form sheet, so it keeps a
// deeper gutter: a sliver of the sheet underneath (its title) stays
// visible, which is what makes it read as a second layer rather than a
// replacement.
const PICKER_TOP_GUTTER = 116;

// WHO OWNS THE KEYBOARD INSET, PER PLATFORM — the single thing this file
// has to get right, and the thing an earlier fix got wrong in both
// directions.
//
// iOS: nobody. A native Modal's window is full-screen and does not
// resize, so this component has to account for the keyboard itself. It
// does that as a LAYOUT inset (the sheet's `bottom` and `maxHeight`
// below), not as a transform. An earlier version translated the sheet up
// bodily by the keyboard height while keeping maxHeight at 88% of the
// FULL screen, so a tall form (Add Lend, eight fields) rose until its
// top — including the field being typed into — was above the top of the
// screen, unreachable, because as far as layout was concerned the sheet
// still had all the room it started with.
//
// Android: the OS already did it. React Native's Modal is its own dialog
// window in ADJUST_RESIZE, so that window has ALREADY given up the
// keyboard's height before this component lays anything out. Subtracting
// it a second time here shifted the sheet up TWICE and pushed its title
// and first fields off the top of the screen — which is exactly what
// hid the Name and Type fields on the Add Account form. So on Android
// the inset stays 0 and the sheet keeps a percentage maxHeight, which
// resolves against that already-shrunk window.
//
// The keyboard events are still subscribed to on both platforms: Android
// needs them to drive the LayoutAnimation that makes the OS's own resize
// look deliberate rather than instant.
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const isIOS = Platform.OS === 'ios';
    const showEvent = isIOS ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = isIOS ? 'keyboardWillHide' : 'keyboardDidHide';
    const animateNext = (duration: number) =>
      LayoutAnimation.configureNext(
        LayoutAnimation.create(
          duration > 0 ? duration : KEYBOARD_TRANSITION_MS,
          LayoutAnimation.Types.easeInEaseOut,
          LayoutAnimation.Properties.opacity,
        ),
      );
    const showSub = Keyboard.addListener(showEvent, event => {
      animateNext(event.duration);
      // Android's dialog window has already shrunk by this much — see
      // the note above. Reporting it here would double-count it.
      setInset(isIOS ? event.endCoordinates.height : 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, event => {
      animateNext(event.duration);
      setInset(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return inset;
}

// The keyboard's claim on the sheet's CONTAINER, not on the sheet.
//
// This is the whole layout strategy, and it is the third attempt at it.
// The sheet is a bottom-aligned flex child (`justifyContent: 'flex-end'`)
// with `flexShrink: 1` and a fixed `marginTop`. It has no height of its
// own, no percentage, and no arithmetic against a measured window: it is
// as tall as its content, and when that will not fit, flexbox shrinks it
// — in the SAME layout pass that sizes its parent.
//
// WHY THAT MATTERS, AND WHAT IT FIXES: the previous version gave the
// sheet an explicit `maxHeight` (a percentage on Android, a pixel figure
// from useWindowDimensions on iOS) while positioning it absolutely. Both
// resolve against the parent's height *as most recently measured*, and
// the keyboard event that triggers our re-render does not arrive in the
// same frame as the window resize it announces. So for one frame a tall
// form was clamped against the pre-keyboard height: the sheet kept its
// full height, the container had already shrunk under it, and its top —
// with the first two or three fields — sat above the top of the screen,
// unreachable, because the ScrollView believed it had all the room it
// needed. Typing anything forced another render, the measurement caught
// up, and it snapped into place correctly. That is precisely the
// "invisible until I type" symptom.
//
// flexShrink cannot get this wrong. Even if the parent's height is stale
// for a frame, the child is shrunk to fit WHATEVER that height is, so the
// sheet can never be laid out taller than the box it lives in. The worst
// a stale frame can now do is make the sheet momentarily a little short.
//
// So the only number left is how much room the keyboard takes away from
// the CONTAINER, and only iOS owes it (see useKeyboardInset).
function sheetContainerInset(keyboardInset: number): ViewStyle {
  return { paddingBottom: keyboardInset };
}

type PickerOverlayProps = {
  config: PickerConfig | null;
  onRequestClose: () => void;
  colors: ThemeColors;
  // Same keyboard inset the form sheet uses. A picker can be opened
  // while a field above it still holds focus, so it gets the same
  // treatment rather than being left to sit under the keyboard.
  keyboardInset: number;
};

function PickerOverlay({
  config,
  onRequestClose,
  colors,
  keyboardInset,
}: PickerOverlayProps): React.JSX.Element | null {
  const visible = config != null;
  const { rendered, translateY, backdropOpacity } = useSlideAnimation(visible);
  const lastConfig = useRef<PickerConfig | null>(config);
  if (config) {
    lastConfig.current = config;
  }

  if (!rendered) {
    return null;
  }
  const active = lastConfig.current;
  if (!active) {
    return null;
  }

  return (
    <View style={styles.pickerOverlayFill} pointerEvents="box-none">
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents="box-none"
        renderToHardwareTextureAndroid
      >
        <Pressable style={styles.backdropPress} onPress={onRequestClose} />
      </Animated.View>
      {/* The keyboard inset lives on this host, not on the overlay root
          above: Yoga positions an absolutely-filled child against the
          parent's PADDING box, so padding the root would pull the
          backdrop up off the keyboard strip and leave it unpainted mid
          keyboard animation. The host carries the inset, the backdrop
          stays full-bleed. */}
      <View
        style={[styles.sheetHost, sheetContainerInset(keyboardInset)]}
        pointerEvents="box-none">
        <Animated.View
          renderToHardwareTextureAndroid
          style={[
            styles.pickerSheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: backdropOpacity,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={styles.pickerHeader}>
            <Pressable
              onPress={onRequestClose}
              hitSlop={12}
              style={styles.pickerBack}
            >
              <ChevronLeft size={22} color={colors.text} />
            </Pressable>
            <Text
              style={[typography.cardTitle, { color: colors.text }]}
              numberOfLines={1}
            >
              {active.title}
            </Text>
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {active.items.map((item, index) => (
              <Pressable
                key={item.value}
                style={[
                  styles.pickerOption,
                  { borderBottomColor: colors.border },
                  index === active.items.length - 1 && styles.pickerOptionLast,
                ]}
                onPress={() => {
                  active.onSelect(item.value);
                  onRequestClose();
                }}
              >
                <Text
                  style={[
                    styles.pickerOptionText,
                    { color: colors.text },
                    item.value === active.selectedValue &&
                      styles.pickerOptionTextSelected,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>
      </View>
    </View>
  );
}

function BottomSheetModal({
  visible,
  onClose,
  onSave,
  canSave = true,
  title,
  saveLabel = 'Save',
  cancelLabel = 'Cancel',
  saveDestructive = false,
  children,
  onFullyClosed,
}: Props): React.JSX.Element | null {
  const { colors } = useTheme();
  const {
    rendered,
    modalVisible,
    translateY,
    backdropOpacity,
    handleNativeDismiss,
  } = useSlideSheet(visible, onFullyClosed);
  const keyboardInset = useKeyboardInset();
  const [activePicker, setActivePicker] = useState<PickerConfig | null>(null);
  const pickerHost = useMemo<PickerHost>(
    () => ({ openPicker: config => setActivePicker(config) }),
    [],
  );

  // Leaving any open picker behind on close, so reopening this sheet later
  // (e.g. editing a different row) always starts back on the form itself
  // rather than resuming mid-pick.
  useEffect(() => {
    if (!visible) {
      setActivePicker(null);
    }
  }, [visible]);

  if (!rendered) {
    return null;
  }

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
      onDismiss={handleNativeDismiss}
    >
      <View style={styles.fill}>
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity }]}
          pointerEvents="box-none"
          renderToHardwareTextureAndroid
        >
          {/* Dismisses the keyboard, same as every screen's old
                modalBackdrop press handler — deliberately does NOT close
                the sheet itself, so a stray tap while typing never
                discards an in-progress form. */}
          <Pressable
            style={styles.backdropPress}
            onPress={() => Keyboard.dismiss()}
          />
        </Animated.View>
        {/* Everything the keyboard displaces lives inside this host, so
            the backdrop above stays full-bleed — Yoga lays an absolutely
            filled child out against the parent's padding box, so putting
            the inset on the root would leave the keyboard strip
            unpainted while the keyboard animates in. */}
        <View
          style={[styles.sheetHost, sheetContainerInset(keyboardInset)]}
          pointerEvents="box-none">
          <Animated.View
            renderToHardwareTextureAndroid
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                // Also fades in with the backdrop (not just sliding), so a
                // freshly-mounted native view has an opacity gate as well as
                // a position one — see the Android note on backdropOpacity's
                // declaration in useSlideSheet.ts for why the position alone
                // isn't a safe enough guard against a flash on first paint.
                opacity: backdropOpacity,
                // translateY is purely the open/close slide. The keyboard
                // is handled by the host's padding, never by this
                // transform — see sheetContainerInset.
                transform: [{ translateY }],
              },
            ]}
          >
            <BottomSheetPickerContext.Provider value={pickerHost}>
              {title && (
                <Text
                  style={[
                    typography.cardTitle,
                    styles.title,
                    { color: colors.text },
                  ]}
                >
                  {title}
                </Text>
              )}
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {children}
              </ScrollView>
              <View style={[styles.footer, { borderTopColor: colors.border }]}>
                <Pressable
                  style={[
                    styles.footerButton,
                    styles.cancelButton,
                    { borderColor: colors.border },
                  ]}
                  onPress={onClose}
                >
                  <Text style={[styles.footerButtonText, { color: colors.text }]}>
                    {cancelLabel}
                  </Text>
                </Pressable>
                {onSave && (
                  // NOT `disabled` when canSave is false, deliberately.
                  // The button still LOOKS unavailable (muted fill, muted
                  // text), which is the "not yet" signal — but pressing it
                  // runs the form's submit anyway, and that is what asks
                  // the form to point at whatever is still missing. A truly
                  // disabled button swallows the tap and leaves the user
                  // with no way to find out why nothing happened. See
                  // hooks/useFieldErrors for the other half.
                  <Pressable
                    style={[
                      styles.footerButton,
                      {
                        backgroundColor: !canSave
                          ? colors.neutralSoft
                          : saveDestructive
                          ? colors.danger
                          : colors.primary,
                      },
                    ]}
                    onPress={onSave}
                  >
                    <Text
                      style={[
                        styles.footerButtonText,
                        {
                          color: !canSave
                            ? colors.textSecondary
                            : saveDestructive
                            ? '#FFFFFF'
                            : colors.primaryText,
                        },
                      ]}
                    >
                      {saveLabel}
                    </Text>
                  </Pressable>
                )}
              </View>
            </BottomSheetPickerContext.Provider>
          </Animated.View>
        </View>
        {/* Lives inside this same Modal, after (i.e. painted on top of)
              the form sheet above — see PickerOverlay's own comment for
              why it isn't a second native <Modal>. */}
        <PickerOverlay
          config={activePicker}
          onRequestClose={() => setActivePicker(null)}
          colors={colors}
          keyboardInset={keyboardInset}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  // The box a sheet is actually laid out in: the whole modal minus
  // whatever the keyboard has taken. Bottom-aligned, so its sheet is a
  // normal flex child rather than an absolutely-positioned one — which
  // is what lets flexShrink clamp the sheet against this box's REAL
  // height in the same pass that sizes it. box-none so taps on the empty
  // area above the sheet still reach the backdrop underneath.
  sheetHost: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backdropPress: {
    flex: 1,
  },
  pickerOverlayFill: {
    ...StyleSheet.absoluteFillObject,
  },
  // NO height, maxHeight or position here, deliberately. The sheet is as
  // tall as its content until it cannot be, and then flexShrink takes it
  // down to exactly what the container has left. marginTop is what keeps
  // a strip of backdrop showing above a tall sheet — a fixed margin does
  // that job without a percentage, and a percentage is what needed a
  // parent height that could still be a frame out of date.
  sheet: {
    flexShrink: 1,
    marginTop: SHEET_TOP_GUTTER,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  // Shorter than the form sheet it stacks on top of, so a sliver of that
  // sheet (its title) stays visible above this one — reinforces that
  // this is a second sheet layered in front, not a replacement.
  pickerSheet: {
    flexShrink: 1,
    marginTop: PICKER_TOP_GUTTER,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  title: {
    marginBottom: 12,
  },
  // Where the sheet's shrinking is absorbed. The title and the footer
  // keep their natural height (flexShrink defaults to 0 in React
  // Native), so every pixel the sheet gives up comes out of the scroll
  // area — which is exactly the part that can scroll it back. Without
  // this the content would hold its full height and push the footer
  // buttons out through the bottom of the sheet. flexGrow stays 0 so a
  // short form still hugs its content instead of stretching to fill.
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  footerButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 4,
  },
  pickerBack: {
    padding: 4,
    marginLeft: -4,
  },
  pickerOption: {
    paddingHorizontal: 4,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerOptionLast: {
    borderBottomWidth: 0,
  },
  pickerOptionText: {
    fontSize: scaleFont(16),
  },
  pickerOptionTextSelected: {
    fontWeight: '700',
  },
});

export default BottomSheetModal;
