import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Platform } from 'react-native';
import { MODAL_TRANSITION_MS } from '../theme/motion';

const SCREEN_HEIGHT = Dimensions.get('window').height;

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
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setRendered(true);
      setModalVisible(true);
      translateY.setValue(SCREEN_HEIGHT);
      backdropOpacity.setValue(0);

      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
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
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }

    if (rendered) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT,
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
