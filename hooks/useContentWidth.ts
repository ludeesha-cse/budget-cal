import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAX_CONTENT_WIDTH } from '../theme/layout';

export type ContentColumn = {
  // Width every tab screen's column actually gets.
  width: number;
  marginLeft: number;
  marginRight: number;
};

// The column App.tsx lays every tab screen out in: the full window on a
// phone in portrait; capped at MAX_CONTENT_WIDTH and centered on a tablet
// or in landscape; and always clear of a landscape notch/cut-out. Also
// used by screens that size something from a measured width (e.g. the
// Reports charts) so they match the column instead of the whole window.
export function useContentWidth(): ContentColumn {
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sideSpace = Math.max(0, (windowWidth - MAX_CONTENT_WIDTH) / 2);
  const marginLeft = Math.max(insets.left, sideSpace);
  const marginRight = Math.max(insets.right, sideSpace);
  return {
    width: windowWidth - marginLeft - marginRight,
    marginLeft,
    marginRight,
  };
}
