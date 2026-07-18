import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Info, X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';
import { useDismissibleBanner } from '../../hooks/useDismissibleBanner';

type Props = {
  children: string;
  // Defaults to the Info glyph every explanatory note in the app already
  // uses; pass another for a banner that is warning about something
  // rather than explaining it.
  icon?: LucideIcon;
};

// The standard "here's how this screen works" note that sits at the top
// of a screen — now with a close button.
//
// Every one of these was permanent before, which meant the explanation a
// person needed once went on occupying the top of the screen forever
// after. Closing it hides it for the rest of the visit and it returns
// next time the screen is opened (see useDismissibleBanner for why that
// is the right lifetime and how it is achieved), so the note stays
// available to someone who wants it without taxing someone who does not.
//
// Dismissal state lives INSIDE this component rather than being passed
// in, so adding a closable banner to a screen is one element and no
// wiring. A screen that needs to control visibility for another reason
// (Dashboard only shows its banner while occurrences are pending) still
// guards this component with its own condition — the two compose.
function InfoBanner({
  children,
  icon: Icon = Info,
}: Props): React.JSX.Element | null {
  const { colors } = useTheme();
  const banner = useDismissibleBanner();

  if (banner.dismissed) {
    return null;
  }

  return (
    <View style={[styles.banner, { backgroundColor: colors.primarySoft }]}>
      <Icon size={14} color={colors.primary} />
      <Text style={[styles.text, { color: colors.text }]}>{children}</Text>
      {/* hitSlop rather than a bigger glyph: the X should be easy to hit
          without becoming the loudest thing in a note that is meant to
          be read first. */}
      <Pressable
        hitSlop={10}
        onPress={banner.dismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        style={styles.close}>
        <X size={14} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  text: {
    flex: 1,
    fontSize: scaleFont(12.5),
    lineHeight: scaleFont(18),
  },
  close: {
    paddingTop: 1,
  },
});

export default InfoBanner;
