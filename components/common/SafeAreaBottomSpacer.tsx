import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  // Part of the bottom inset something else already accounts for — e.g.
  // a keyboard inset, which on edge-to-edge Android is measured down to
  // the very bottom of the screen and so already covers the nav bar.
  consumed?: number;
};

// Fills the strip of a bottom-anchored sheet that the system UI (Android's
// 3-button / gesture nav bar, the iOS home indicator) draws over, so the
// sheet's background runs to the bottom edge but its buttons stay above
// that strip.
//
// Meant to be rendered inside a <SafeAreaProvider> placed directly inside
// the <Modal>. A Modal is its own native window, and whether that window
// reaches under the nav bar depends on the OS version and the Modal's
// flags (statusBarTranslucent on edge-to-edge Android does; older
// Androids don't). A provider inside the Modal measures THAT window, so
// this is the real overlap on every device instead of the app root's
// inset applied on faith — which would either leave buttons behind the
// nav bar or add a dead gap below them.
function SafeAreaBottomSpacer({ consumed = 0 }: Props): React.JSX.Element | null {
  const insets = useSafeAreaInsets();
  const height = Math.max(0, insets.bottom - consumed);
  if (height === 0) {
    return null;
  }
  return <View style={{ height }} />;
}

export default SafeAreaBottomSpacer;
