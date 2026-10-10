import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { ImageOff } from 'lucide-react-native';
import ScreenBackground from '../components/ScreenBackground';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../contexts/ThemeContext';
import { scaleFont, typography } from '../theme/typography';
import { HELP_TOPICS, type HelpTopic } from '../config/helpTopics';
import { useSetOnboardingCompleted as useSetOnboardingCompletedMutation } from '../hooks/queries';

type Props = {
  onDone: () => void;
};

// The slide illustrations are all 2000x1500.
const IMAGE_ASPECT = 4 / 3;
// Beyond this (tablets, landscape) the text column and image stop growing
// and stay centered — a 1000dp-wide line of body copy is unreadable.
const SLIDE_MAX_CONTENT_WIDTH = 560;
// Never let the illustration take more than this share of the screen's
// height, so heading and body text still fit below it on short phones.
const IMAGE_MAX_HEIGHT_RATIO = 0.34;

type ImageSize = { width: number; height: number };

// Fits the 4:3 illustration into whatever room this device has: as wide
// as the slide's text column allows, unless that would make it too tall
// for the screen, in which case height wins and width follows. This
// replaces a fixed 360x270 that ran off the right edge of any phone
// narrower than ~416dp (most Androids, e.g. a 360-393dp Redmi Note).
function fitImage(columnWidth: number, windowHeight: number): ImageSize {
  const maxHeight = windowHeight * IMAGE_MAX_HEIGHT_RATIO;
  const width = Math.min(columnWidth, maxHeight * IMAGE_ASPECT);
  return {
    width: Math.max(0, Math.floor(width)),
    height: Math.max(0, Math.floor(width / IMAGE_ASPECT)),
  };
}

function OnboardingScreen({ onDone }: Props): React.JSX.Element {
  // Write paths go through the caching layer's mutation hooks: each
  // one runs the same db/queries function as before and then
  // invalidates every query its write can affect (see
  // hooks/queries/invalidation.ts). The call sites below are
  // unchanged — these hooks take the wrapped function's own arguments.
  const setOnboardingCompleted = useSetOnboardingCompletedMutation();
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const [pageWidth, setPageWidth] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const { height: windowHeight } = useWindowDimensions();
  // A touch less side padding on the narrowest phones (320dp class).
  const slidePadding = pageWidth > 0 && pageWidth < 360 ? 20 : 28;
  const columnWidth = Math.min(
    SLIDE_MAX_CONTENT_WIDTH,
    Math.max(0, pageWidth - slidePadding * 2),
  );
  const imageSize = fitImage(columnWidth, windowHeight);

  const isFirst = index === 0;
  const isLast = index === HELP_TOPICS.length - 1;

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setPageWidth(event.nativeEvent.layout.width);
  }, []);

  // Pages are pageWidth wide, so when that changes (rotation, split
  // screen, foldable unfolding) the old scroll offset would land between
  // two slides — jump back to the current one at the new width.
  const indexRef = useRef(index);
  indexRef.current = index;
  useEffect(() => {
    if (pageWidth > 0) {
      scrollRef.current?.scrollTo({
        x: indexRef.current * pageWidth,
        animated: false,
      });
    }
  }, [pageWidth]);

  
  const goTo = useCallback(
    (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(HELP_TOPICS.length - 1, nextIndex));
      scrollRef.current?.scrollTo({ x: clamped * pageWidth, animated: true });
      setIndex(clamped);
    },
    [pageWidth],
  );

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (pageWidth <= 0) {
        return;
      }
      const nextIndex = Math.round(
        event.nativeEvent.contentOffset.x / pageWidth,
      );
      setIndex(nextIndex);
    },
    [pageWidth],
  );

  const handleGetStarted = useCallback(async () => {
    if (finishing) {
      return;
    }
    setFinishing(true);
    try {
      await setOnboardingCompleted();
      console.log('[onboarding] completed — advancing to default currency');
      onDone();
    } catch (error) {
      console.error('[onboarding] could not save completion', error);
      setFinishing(false);
    }
    // setOnboardingCompleted is the mutation hook's callable — stable
    // across renders (useCallback + useMemo inside useDbMutation), so
    // listing it here does not re-create this callback each render.
  }, [finishing, onDone, setOnboardingCompleted]);

  return (
    <ScreenBackground colors={colors} edges={['top', 'bottom']}>
      <View style={styles.fill} onLayout={handleLayout}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          style={styles.fill}>
          {HELP_TOPICS.map(topic => (
            <Slide
              key={topic.key}
              topic={topic}
              colors={colors}
              width={pageWidth}
              padding={slidePadding}
              columnWidth={columnWidth}
              imageSize={imageSize}
            />
          ))}
        </ScrollView>

        <View style={styles.dots}>
          {HELP_TOPICS.map((topic, dotIndex) => (
            <View
              key={topic.key}
              style={[
                styles.dot,
                dotIndex === index ? styles.dotActive : styles.dotInactive,
                {
                  // chevron rather than neutralSoft: the latter is nearly the
                  // background color, which left the inactive dots invisible.
                  backgroundColor:
                    dotIndex === index ? colors.primary : colors.chevron,
                },
              ]}
            />
          ))}
        </View>

        <View style={styles.footer}>
          <Pressable
            style={[
              styles.footerButton,
              styles.backButton,
              { borderColor: colors.border },
              isFirst && styles.hiddenButton,
            ]}
            disabled={isFirst}
            pointerEvents={isFirst ? 'none' : 'auto'}
            onPress={() => goTo(index - 1)}>
            <Text style={[styles.footerButtonText, { color: colors.text }]}>
              Back
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.footerButton,
              {
                backgroundColor: finishing ? colors.neutralSoft : colors.primary,
              },
            ]}
            disabled={finishing}
            onPress={() => (isLast ? handleGetStarted() : goTo(index + 1))}>
            <Text
              style={[
                styles.footerButtonText,
                {
                  color: finishing ? colors.textSecondary : colors.primaryText,
                },
              ]}>
              {isLast ? 'Get Started' : 'Next'}
            </Text>
          </Pressable>
        </View>
      </View>
    </ScreenBackground>
  );
}


// inside OnboardingScreen for the same reason App.tsx's tab icons are —
// a component declared in a render body is a new type on every render.
function Slide({
  topic,
  colors,
  width,
  padding,
  columnWidth,
  imageSize,
}: {
  topic: HelpTopic;
  colors: ThemeColors;
  width: number;
  padding: number;
  columnWidth: number;
  imageSize: ImageSize;
}): React.JSX.Element {
  // Each slide scrolls vertically on its own when the image plus text
  // don't fit (short phones, landscape, a large system font) — otherwise
  // the end of the body copy was simply cut off. When it does fit,
  // flexGrow + justifyContent keep it vertically centered as before.
  return (
    <ScrollView
      style={{ width }}
      contentContainerStyle={[styles.slideContent, { paddingHorizontal: padding }]}
      showsVerticalScrollIndicator={false}>
      <View style={[styles.slideColumn, { width: columnWidth }]}>
        <SlideImage topic={topic} colors={colors} size={imageSize} />
        <Text
          style={[
            typography.eyebrow,
            styles.slideEyebrow,
            { color: colors.textSecondary },
          ]}>
          Getting Started
        </Text>
        <Text style={[typography.screenTitle, { color: colors.text }]}>
          {topic.heading}
        </Text>
        <Text style={[styles.slideBody, { color: colors.textSecondary }]}>
          {topic.summary}
        </Text>
      </View>
    </ScrollView>
  );
}


function SlideImage({
  topic,
  colors,
  size,
}: {
  topic: HelpTopic;
  colors: ThemeColors;
  size: ImageSize;
}): React.JSX.Element {
  if (topic.image) {
    return (
      <Image
        source={topic.image}
        style={[styles.slideImage, size]}
        resizeMode="contain"
      />
    );
  }
  return (
    <View
      style={[
        styles.slideImage,
        size,
        styles.slideImagePlaceholder,
        { borderColor: colors.border, backgroundColor: colors.neutralSoft },
      ]}>
      <ImageOff size={28} color={colors.chevron} />
      <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
        Image placeholder — {topic.key}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  slideContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
  },
  slideColumn: {
    maxWidth: SLIDE_MAX_CONTENT_WIDTH,
  },
  // Size comes from fitImage(); centered within the text column.
  slideImage: {
    alignSelf: 'center',
    borderRadius: 20,
    marginBottom: 28,
  },
  slideImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  placeholderText: {
    fontSize: scaleFont(12),
    fontWeight: '600',
  },
  slideEyebrow: {
    marginBottom: 8,
  },
  slideBody: {
    fontSize: scaleFont(15),
    lineHeight: scaleFont(23),
    marginTop: 14,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  // The current slide's dot stretches into a short bar rather than just
  // changing color — a size difference stays readable for someone who
  // can't tell the two tints apart.
  dotActive: {
    width: 20,
  },
  dotInactive: {
    width: 8,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  footerButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  hiddenButton: {
    opacity: 0,
  },
  footerButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
});

export default OnboardingScreen;
