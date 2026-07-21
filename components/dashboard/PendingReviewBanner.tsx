import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';

type Props = {
  count: number;
  onPress: () => void;
  onDismiss: () => void;
};

// Non-blocking by design — a plain row, never a modal, so it can't stop
// the user from seeing anything else on the screen. Visibility (loading/
// count/dismissed gating) is decided by the orchestrator; this component
// just renders the banner once told to.
//
// ONE banner, ONE number, covering recurring-rule occurrences and
// installment occurrences together — never two stacked banners each
// counting its own half. The wording is "scheduled entries" rather than
// "recurring entries" for exactly that reason: an installment coming due
// is not a recurring rule, but it is waiting on the same decision from
// the same person in the same place.
function PendingReviewBanner({ count, onPress, onDismiss }: Props): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <Pressable
      style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}>
      <View style={[styles.bannerDot, { backgroundColor: colors.primary }]} />
      <Text style={[styles.bannerText, { color: colors.text }]}>
        <Text style={styles.bannerTextBold}>
          {count} scheduled {count === 1 ? 'entry' : 'entries'}
        </Text>{' '}
        to review
      </Text>
      <Pressable hitSlop={10} onPress={onDismiss}>
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
  bannerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  bannerText: {
    flex: 1,
    fontSize: scaleFont(14),
  },
  bannerTextBold: {
    fontWeight: '700',
  },
});

export default PendingReviewBanner;
