import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Keyboard,
  Modal,
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
}: Props): React.JSX.Element | null {
  const { colors } = useTheme();
  // Stays mounted through the closing animation — flipping `visible` to
  // false alone would yank the Modal off screen instantly with no way to
  // play the collapse-down animation first, since RN's Modal has no
  // exit-animation hook of its own once its own `visible` prop goes
  // false. This mirrors it one render late, unmounting only once the
  // slide-down Animated.timing actually finishes.
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
    // Only ever reacts to `visible` flipping — `rendered` is read, not a
    // dependency, since including it would re-fire this on the very
    // setRendered(false) the closing branch just triggered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!rendered) {
    return null;
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
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
