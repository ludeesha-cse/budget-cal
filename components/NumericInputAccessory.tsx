import React from 'react';
import {
  Button,
  InputAccessoryView,
  Keyboard,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

// iOS's "numeric"/"number-pad"/"decimal-pad" keyboards have no Return/Done
// key of their own (unlike the default text keyboard) — without this, a
// numeric field opened from inside a Modal leaves the user with no way to
// get the keyboard out of the way to reach the Cancel/Save buttons
// underneath it, short of force-quitting the app. Android's numeric
// keyboards generally ship their own dismiss affordance, so this
// component renders nothing there; every numeric TextInput that wants
// this bar sets `inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}`
// (a no-op prop on Android, so the same JSX works on both platforms
// unchanged).
export const NUMERIC_KEYBOARD_ACCESSORY_ID = 'numeric-keyboard-done-accessory';

function NumericInputAccessory(): React.JSX.Element | null {
  const { colors } = useTheme();

  if (Platform.OS !== 'ios') {
    return null;
  }

  return (
    <InputAccessoryView nativeID={NUMERIC_KEYBOARD_ACCESSORY_ID}>
      <View
        style={[
          styles.bar,
          { backgroundColor: colors.surface, borderTopColor: colors.border },
        ]}>
        <Button title="Done" color={colors.primary} onPress={() => Keyboard.dismiss()} />
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

export default NumericInputAccessory;
