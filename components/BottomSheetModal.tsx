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
const ANIM_MS = 260;

function useSlideSheet(visible: boolean, onFullyClosed?: () => void) {
  const [rendered, setRendered] = useState(visible);
  const [modalVisible, setModalVisible] = useState(visible);
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setRendered(true);
      setModalVisible(true);
      translateY.setValue(SCREEN_HEIGHT);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: ANIM_MS,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: ANIM_MS,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (rendered) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT,
          duration: ANIM_MS,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: ANIM_MS,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (!finished) {
          return;
        }
        // Now that it's fully off screen, actually tell the native Modal
        // to dismiss. iOS does this asynchronously — see handleNativeDismiss
        // below, fired by RN once it's truly gone. Android's Modal doesn't
        // implement onDismiss at all (see react-native's own Modal.js) but
        // also tears the native modal down synchronously with this same
        // prop flip, so it's safe to finish the close right here instead
        // of waiting on a callback that will never come.
        setModalVisible(false);
        if (Platform.OS !== 'ios') {
          setRendered(false);
          onFullyClosed?.();
        }
      });
    }
    // Only ever reacts to `visible` flipping — `rendered` is read, not a
    // dependency, since including it would re-fire this on the very
    // setRendered(false) the closing branch just triggered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleNativeDismiss = () => {
    setRendered(false);
    onFullyClosed?.();
  };

  return {
    rendered,
    modalVisible,
    translateY,
    backdropOpacity,
    handleNativeDismiss,
  };
}

function useSlideAnimation(visible: boolean) {
  const [rendered, setRendered] = useState(visible);
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setRendered(true);
      translateY.setValue(SCREEN_HEIGHT);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: ANIM_MS,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: ANIM_MS,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (rendered) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT,
          duration: ANIM_MS,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: ANIM_MS,
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

// Tracks the keyboard's own height as an Animated.Value, iOS only — used
// to shift the sheet up above the keyboard (see its use in translateY
// below). `KeyboardAvoidingView` was tried here first and doesn't work:
// its automatic frame measurement doesn't reliably account for content
// presented inside a <Modal>, which renders into a separate native root
// than the rest of the app — a well-known RN gap, not something specific
// to this sheet's own layout. Listening directly for keyboardWillShow/
// Hide and animating a value ourselves sidesteps that measurement
// entirely, and lets the motion match the keyboard's own reported
// duration/curve instead of guessing one. Android is left at a
// permanently-zero offset: its windowSoftInputMode is "adjustPan" (see
// AndroidManifest.xml), which already pans the whole screen to keep the
// focused field visible at the native level, so adding our own offset on
// top would double up.
function useKeyboardOffset() {
  const offset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return;
    }
    const animateTo = (toValue: number, event: RNKeyboardEvent) => {
      Animated.timing(offset, {
        toValue,
        duration: event.duration > 0 ? event.duration : ANIM_MS,
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
      >
        <Pressable style={styles.backdropPress} onPress={onRequestClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.pickerSheet,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
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
  // Whichever <CollapsiblePicker> (if any) is currently being picked — see
  // BottomSheetPickerContext above. Rendered as its own stacked sheet (see
  // PickerOverlay) in front of this one, which stays open underneath it.
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
      onRequestClose={onClose}
      onDismiss={handleNativeDismiss}
    >
      <View style={styles.fill}>
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity }]}
          pointerEvents="box-none"
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
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              // Subtracting keyboardOffset here (rather than adding
              // padding somewhere) is what actually slides the sheet up
              // above the keyboard on iOS — see useKeyboardOffset's own
              // comment for why this replaced KeyboardAvoidingView.
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
                <Pressable
                  disabled={!canSave}
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
