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
import type { KeyboardEvent as RNKeyboardEvent } from 'react-native';
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

function useKeyboardOffset() {
  const offset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return;
    }
    const animateTo = (toValue: number, event: RNKeyboardEvent) => {
      Animated.timing(offset, {
        toValue,
        duration: event.duration > 0 ? event.duration : MODAL_TRANSITION_MS,
        useNativeDriver: true,
      }).start();
    };
    const showSub = Keyboard.addListener('keyboardWillShow', event =>
      animateTo(event.endCoordinates.height, event),
    );
    const hideSub = Keyboard.addListener('keyboardWillHide', event =>
      animateTo(0, event),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [offset]);

  return offset;
}

const KEYBOARD_TRANSITION_MS = 450;

function useSmoothAndroidKeyboardResize() {
  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    const configure = () =>
      LayoutAnimation.configureNext(
        LayoutAnimation.create(
          KEYBOARD_TRANSITION_MS,
          LayoutAnimation.Types.easeInEaseOut,
          LayoutAnimation.Properties.opacity,
        ),
      );
    const showSub = Keyboard.addListener('keyboardDidShow', configure);
    const hideSub = Keyboard.addListener('keyboardDidHide', configure);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
}

type PickerOverlayProps = {
  config: PickerConfig | null;
  onRequestClose: () => void;
  colors: ThemeColors;
};

function PickerOverlay({
  config,
  onRequestClose,
  colors,
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
  const keyboardOffset = useKeyboardOffset();
  useSmoothAndroidKeyboardResize();
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
              transform: [
                { translateY: Animated.subtract(translateY, keyboardOffset) },
              ],
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
        {/* Lives inside this same Modal, after (i.e. painted on top of)
              the form sheet above — see PickerOverlay's own comment for
              why it isn't a second native <Modal>. */}
        <PickerOverlay
          config={activePicker}
          onRequestClose={() => setActivePicker(null)}
          colors={colors}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
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
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '88%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  // Slightly shorter than the form sheet it stacks on top of, so a sliver
  // of that sheet (its title) stays visible above this one — reinforces
  // that this is a second sheet layered in front, not a replacement.
  pickerSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '75%',
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
  scroll: {
    flexGrow: 0,
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
