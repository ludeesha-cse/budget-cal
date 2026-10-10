import React from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Minus,
  Plus,
  Repeat,
} from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { typography, scaleFont } from '../theme/typography';
import { useSlideSheet } from '../hooks/useSlideSheet';
import { tabBarTopOffset } from '../theme/layout';

// Space between the card's bottom edge and the top of the tab bar pill.
const GAP_ABOVE_TAB_BAR = 24;

export type AddEntryKind =
  | 'Expense'
  | 'Income'
  | 'LiabilityRepayment'
  | 'ReceivableIncome'
  | 'Withdraw'
  | 'Transfer';

type AddEntryOption = {
  kind: AddEntryKind;
  title: string;
  subtitle: string;
};

const OPTIONS: AddEntryOption[] = [
  { kind: 'Expense', title: 'Expense', subtitle: 'Category required' },
  {
    kind: 'Income',
    title: 'Income',
    subtitle: 'No category — description only',
  },
  {
    kind: 'LiabilityRepayment',
    title: 'Liability Repayment',
    subtitle: 'Pay down something you borrowed',
  },
  {
    kind: 'ReceivableIncome',
    title: 'Receivable Income',
    subtitle: 'Collect on money you lent',
  },
  {
    kind: 'Withdraw',
    title: 'Withdraw',
    subtitle: 'Move money from a bank account to cash',
  },
  {
    kind: 'Transfer',
    title: 'Transfer',
    subtitle: 'Move money between any two accounts',
  },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (kind: AddEntryKind) => void;
};

// The FAB's action sheet (App.tsx) — a small floating card rather than a
// full-height bottom sheet, since it only ever has to hold four rows.
// Tapping the dimmed backdrop or any row closes it; onSelect fires after
// the sheet is already closing so the destination screen never has to
// render underneath a still-visible modal. Slides up/down via
// useSlideSheet — the same choreography BottomSheetModal uses — rather
// than RN's own `animationType="fade"`, which behaved as an instant
// snap on both open and close.
function AddEntrySheet({
  visible,
  onClose,
  onSelect,
}: Props): React.JSX.Element | null {
  const { colors } = useTheme();
  // The app root's insets on purpose (this is read outside the Modal): the
  // card has to land above the tab bar, and the tab bar is positioned from
  // these same insets in App.tsx. A fixed paddingBottom used to put it
  // straight over the pill wherever the nav bar inset was large
  // (3-button navigation on edge-to-edge Android).
  const insets = useSafeAreaInsets();
  const { rendered, modalVisible, translateY, backdropOpacity, handleNativeDismiss } =
    useSlideSheet(visible);

  const handleSelect = (kind: AddEntryKind) => {
    onClose();
    onSelect(kind);
  };

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
          renderToHardwareTextureAndroid>
          <Pressable style={styles.backdropPress} onPress={onClose} />
        </Animated.View>
        <View
          style={[
            styles.sheetWrap,
            {
              paddingTop: insets.top + GAP_ABOVE_TAB_BAR,
              paddingBottom: tabBarTopOffset(insets) + GAP_ABOVE_TAB_BAR,
            },
          ]}
          pointerEvents="box-none">
          <Animated.View
            renderToHardwareTextureAndroid
            style={[
              styles.sheetSlide,
              { opacity: backdropOpacity, transform: [{ translateY }] },
            ]}>
            <Pressable
              style={[
                styles.sheet,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              onPress={() => {}}
            >
              <Text
                style={[
                  styles.eyebrow,
                  typography.eyebrow,
                  { color: colors.textSecondary },
                ]}
              >
                Add Entry
              </Text>
              {/* Scrolls only when it has to — a short screen, landscape,
                  or a large system font — instead of running off the top. */}
              <ScrollView
                style={styles.rows}
                showsVerticalScrollIndicator={false}>
                {OPTIONS.map(option => (
                  <Pressable
                    key={option.kind}
                    style={({ pressed }) => [
                      styles.row,
                      pressed && { opacity: 0.6 },
                    ]}
                    onPress={() => handleSelect(option.kind)}
                  >
                    <View
                      style={[
                        styles.iconCircle,
                        option.kind === 'Expense' && {
                          backgroundColor: colors.dangerSoft,
                        },
                        option.kind === 'Income' && {
                          backgroundColor: colors.successSoft,
                        },
                        option.kind === 'LiabilityRepayment' && {
                          backgroundColor: colors.primary,
                        },
                        option.kind === 'ReceivableIncome' && [
                          styles.iconCircleOutline,
                          { borderColor: colors.border },
                        ],
                        option.kind === 'Withdraw' && {
                          backgroundColor: colors.primarySoft,
                        },
                        option.kind === 'Transfer' && [
                          styles.iconCircleOutline,
                          { borderColor: colors.border },
                        ],
                      ]}
                    >
                      {option.kind === 'Expense' && (
                        <Minus size={18} color={colors.danger} strokeWidth={2.5} />
                      )}
                      {option.kind === 'Income' && (
                        <Plus size={18} color={colors.success} strokeWidth={2.5} />
                      )}
                      {option.kind === 'LiabilityRepayment' && (
                        <ArrowUpRight
                          size={18}
                          color={colors.primaryText}
                          strokeWidth={2.5}
                        />
                      )}
                      {option.kind === 'ReceivableIncome' && (
                        <ArrowDownLeft
                          size={18}
                          color={colors.text}
                          strokeWidth={2.5}
                        />
                      )}
                      {option.kind === 'Withdraw' && (
                        <Banknote
                          size={18}
                          color={colors.primary}
                          strokeWidth={2.5}
                        />
                      )}
                      {option.kind === 'Transfer' && (
                        <Repeat size={18} color={colors.text} strokeWidth={2.5} />
                      )}
                    </View>
                    <View style={styles.rowText}>
                      <Text style={[styles.rowTitle, { color: colors.text }]}>
                        {option.title}
                      </Text>
                      <Text
                        style={[
                          styles.rowSubtitle,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {option.subtitle}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </Pressable>
          </Animated.View>
        </View>
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
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  // Without an explicit width, this Animated.View (a plain flex item
  // inside sheetWrap's alignItems:'center' cross axis) shrinks to fit its
  // content instead of stretching — and its child (`sheet`, width:'100%')
  // then has nothing but 0/auto to resolve that percentage against,
  // collapsing the whole card into a sliver everything wraps inside of.
  // flexShrink (with sheet and rows below) lets the card give up height
  // when the space between the status bar and the tab bar is too small
  // for it, and the rows then scroll.
  sheetSlide: {
    width: '100%',
    maxWidth: 420,
    flexShrink: 1,
  },
  sheet: {
    width: '100%',
    flexShrink: 1,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  rows: {
    flexGrow: 0,
    flexShrink: 1,
  },
  eyebrow: {
    marginTop: 6,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  iconCircleOutline: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: scaleFont(16),
    fontWeight: '600',
  },
  rowSubtitle: {
    fontSize: scaleFont(12),
    marginTop: 2,
  },
});

export default AddEntrySheet;
