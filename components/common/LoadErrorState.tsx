import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RotateCw } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';

type Props = {
  // What could not be loaded, in the user's words: "your accounts",
  // "this month's history". Used in the sentence shown.
  what?: string;
  onRetry: () => void;
};

// What a screen shows when the query behind it FAILED — instead of a
// spinner that never stops, or an empty screen that reads as "you have
// no data". Says plainly that loading failed, that nothing was lost, and
// offers the one thing that usually fixes it.
//
// Wire `onRetry` to the failing query's refetch (or to a screen hook's
// own retry that refetches all of its queries).
function LoadErrorState({ what = 'this screen', onRetry }: Props): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.box,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}>
      <Text style={[styles.title, { color: colors.text }]}>
        Couldn't load {what}
      </Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        Your data is safe — it just didn't load this time.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={[styles.button, { backgroundColor: colors.primary }]}>
        <RotateCw size={15} color={colors.primaryText} />
        <Text style={[styles.buttonText, { color: colors.primaryText }]}>
          Try again
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 16,
    marginVertical: 16,
    alignItems: 'center',
  },
  title: {
    fontSize: scaleFont(15),
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    fontSize: scaleFont(13),
    lineHeight: scaleFont(19),
    marginTop: 6,
    textAlign: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginTop: 14,
  },
  buttonText: {
    fontSize: scaleFont(14),
    fontWeight: '700',
  },
});

export default LoadErrorState;
