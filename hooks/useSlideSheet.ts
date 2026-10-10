import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Platform } from 'react-native';
import { MODAL_TRANSITION_MS } from '../theme/motion';

// How far down a sheet sits while closed. The screen's LONGER side, read
// when it's needed rather than once at import: a height captured at
// startup goes stale after a rotation (start in landscape, turn to
// portrait) and stops being far enough to hide the sheet.
export function offscreenSheetOffset(): number {
  const { width, height } = Dimensions.get('screen');
  return Math.max(width, height);
}

export type SlideSheetState = {
  rendered: boolean;
  modalVisible: boolean;
  translateY: Animated.Value;
  backdropOpacity: Animated.Value;
  handleNativeDismiss: () => void;
};

export function useSlideSheet(
  visible: boolean,
  onFullyClosed?: () => void,
): SlideSheetState {
  const [rendered, setRendered] = useState(visible);
  const [modalVisible, setModalVisible] = useState(visible);
  const translateY = useRef(new Animated.Value(offscreenSheetOffset())).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setRendered(true);
      setModalVisible(true);
      translateY.setValue(offscreenSheetOffset());
      backdropOpacity.setValue(0);

      const raf1 = requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: 0,
            duration: MODAL_TRANSITION_MS,
            useNativeDriver: true,
          }),
          Animated.timing(backdropOpacity, {
            toValue: 1,
            duration: MODAL_TRANSITION_MS,
            useNativeDriver: true,
          }),
        ]).start();
      });
      return () => {
        cancelAnimationFrame(raf1);
      };
    }

    if (rendered) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: offscreenSheetOffset(),
          duration: MODAL_TRANSITION_MS,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: MODAL_TRANSITION_MS,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (!finished) {
          return;
        }
        setModalVisible(false);
        if (Platform.OS !== 'ios') {
          setRendered(false);
          onFullyClosed?.();
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleNativeDismiss = () => {
    setRendered(false);
    onFullyClosed?.();
  };

  return { rendered, modalVisible, translateY, backdropOpacity, handleNativeDismiss };
}
