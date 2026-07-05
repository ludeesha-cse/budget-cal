import React from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
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
        <View style={styles.sheetWrap} pointerEvents="box-none">
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
    paddingBottom: 110,
    paddingHorizontal: 24,
  },
  // Without an explicit width, this Animated.View (a plain flex item
  // inside sheetWrap's alignItems:'center' cross axis) shrinks to fit its
  // content instead of stretching — and its child (`sheet`, width:'100%')
  // then has nothing but 0/auto to resolve that percentage against,
  // collapsing the whole card into a sliver everything wraps inside of.
  sheetSlide: {
    width: '100%',
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 16,
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
