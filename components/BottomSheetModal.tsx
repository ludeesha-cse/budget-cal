import React, { useEffect, useRef, useState } from 'react';
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
import { useTheme } from '../contexts/ThemeContext';
import { typography, scaleFont } from '../theme/typography';

type Props = {
  visible: boolean;
  onClose: () => void;
  // Omit entirely for a read-only sheet (rare) — most callers pass this.
  onSave?: () => void;
  // Gates the Save button — the caller computes this from its own field
  // validation (same "every required field filled" rule every form in
  // this app already enforces via its own buildParams/handleSubmit, just
  // surfaced visually now instead of only failing at submit time).
  canSave?: boolean;
  title?: string;
  saveLabel?: string;
  cancelLabel?: string;
  // Red Save button for a destructive confirm (e.g. "Delete") rather than
  // the ordinary primary-colored one — rare, defaults off.
  saveDestructive?: boolean;
  children: React.ReactNode;
  // Fires once this sheet's real native Modal has actually finished
  // closing — later than `visible` going false, which only starts the
  // slide-down animation below. A caller that needs to present a SECOND
  // native Modal right after this one closes (e.g. the free-tier paywall
  // gating in useInstallmentForm/useAccountForm/CategoriesScreen) must
  // wait for this rather than guessing a timeout: iOS silently refuses to
  // present a new Modal while a previous one is still mid-dismissal —
  // no error, no log, just nothing happens — which is exactly the freeze
  // those callers hit before this existed.
  onFullyClosed?: () => void;
};

const SCREEN_HEIGHT = Dimensions.get('window').height;
const ANIM_MS = 260;

// Every screen with an "add/edit X" popup renders one of these instead of
// its own ad hoc <Modal transparent animationType="fade"> + Pressable
// backdrop + bottom-anchored card (the copy-pasted pattern this app used
// everywhere before — see InstallmentPlansScreen/RecurringRulesScreen/
// SavingsGoalsScreen/etc.'s own `modalBackdrop`/`modalCard` styles).
// Centralizes three things every one of those screens needs identically:
// a real slide-up-from-bottom / collapse-back-down animation (built on
// RN's own Animated API — no new native dependency), a scrollable content
// area so a long form never gets clipped by the sheet's own maxHeight,
// and a Cancel/Save footer where Save is disabled until the caller's own
// validation says the form is complete.
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
  // Stays mounted through the closing animation — flipping `visible` to
  // false alone would yank the Modal off screen instantly with no way to
  // play the collapse-down animation first, since RN's Modal has no
  // exit-animation hook of its own once its own `visible` prop goes
  // false. This mirrors it one render late, unmounting only once the
  // real native Modal is confirmed gone (see modalVisible below), not
  // just once our own slide-down animation finishes.
  const [rendered, setRendered] = useState(visible);
  // The REAL native <Modal>'s own `visible` prop — kept true through the
  // whole slide-down animation (there has to be something on screen to
  // animate), only flipped false once that finishes. That flip is what
  // actually tells iOS to tear down the presented view controller, and
  // is the only thing that makes `onDismiss` below fire.
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
        // Now that it's fully off screen, actually tell the native
        // Modal to dismiss. iOS does this asynchronously — see
        // handleNativeDismiss below, fired by RN once it's truly gone.
        // Android's Modal doesn't implement onDismiss at all (see
        // react-native's own Modal.js) but also tears the native modal
        // down synchronously with this same prop flip, so it's safe to
        // finish the close right here instead of waiting on a callback
        // that will never come.
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

  if (!rendered) {
    return null;
  }

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      onDismiss={handleNativeDismiss}>
      <View style={styles.fill}>
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity }]}
          pointerEvents="box-none">
          {/* Dismisses the keyboard, same as every screen's old
              modalBackdrop press handler — deliberately does NOT close
              the sheet itself, so a stray tap while typing never
              discards an in-progress form. */}
          <Pressable style={styles.backdropPress} onPress={() => Keyboard.dismiss()} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              transform: [{ translateY }],
            },
          ]}>
          {title && (
            <Text
              style={[typography.cardTitle, styles.title, { color: colors.text }]}>
              {title}
            </Text>
          )}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Pressable
              style={[
                styles.footerButton,
                styles.cancelButton,
                { borderColor: colors.border },
              ]}
              onPress={onClose}>
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
                onPress={onSave}>
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
                  ]}>
                  {saveLabel}
                </Text>
              </Pressable>
            )}
          </View>
        </Animated.View>
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
});

export default BottomSheetModal;
