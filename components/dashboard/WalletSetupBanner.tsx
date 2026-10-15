import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Wallet, X } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';

type Props = {
  onPress: () => void;
  onDismiss: () => void;
};

// Shown on the Dashboard when the default "Cash in wallet" account has no
// balance row at all — no currency, so nothing can be paid from it. New
// installs set this up on the first-run screen; this catches installs
// that passed that screen before the wallet step existed (they are never
// sent back through it). Same non-blocking row shape as
// PendingReviewBanner, and the same per-visit dismissal.
function WalletSetupBanner({ onPress, onDismiss }: Props): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}>
      <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
        <Wallet size={15} color={colors.primary} />
      </View>
      <Text style={[styles.text, { color: colors.text }]}>
        Your Cash in wallet has no currency yet —{' '}
        <Text style={[styles.link, { color: colors.primary }]}>set it up</Text>
      </Text>
      <Pressable
        hitSlop={10}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss">
        <X size={16} color={colors.textSecondary} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    gap: 10,
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    fontSize: scaleFont(14),
    lineHeight: scaleFont(20),
  },
  link: {
    fontWeight: '700',
  },
});

export default WalletSetupBanner;
