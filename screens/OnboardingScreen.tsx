import React, { useCallback, useRef, useState } from 'react';
import {
  Image,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ImageOff } from 'lucide-react-native';
import ScreenBackground from '../components/ScreenBackground';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../contexts/ThemeContext';
import { scaleFont, typography } from '../theme/typography';
import { HELP_TOPICS, type HelpTopic } from '../config/helpTopics';
import { setOnboardingCompleted } from '../db/queries';

type Props = {
  onDone: () => void;
};

function OnboardingScreen({ onDone }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const [pageWidth, setPageWidth] = useState(0);
  const [finishing, setFinishing] = useState(false);

  const isFirst = index === 0;
  const isLast = index === HELP_TOPICS.length - 1;

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setPageWidth(event.nativeEvent.layout.width);
  }, []);

  
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
  }, [finishing, onDone]);

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
                  backgroundColor:
                    dotIndex === index ? colors.primary : colors.neutralSoft,
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
}: {
  topic: HelpTopic;
  colors: ThemeColors;
  width: number;
}): React.JSX.Element {
  return (
    <View style={[styles.slide, { width }]}>
      <SlideImage topic={topic} colors={colors} />
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
  );
}


function SlideImage({
  topic,
  colors,
}: {
  topic: HelpTopic;
  colors: ThemeColors;
}): React.JSX.Element {
  if (topic.image) {
    return (
      <Image
        source={topic.image}
        style={styles.slideImage}
        resizeMode="contain"
      />
    );
  }
  return (
    <View
      style={[
        styles.slideImage,
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
  slide: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
  },
  slideImage: {
    width: 360,
    height: 270,
    borderRadius: 20,
    marginBottom: 32,
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
    paddingVertical: 20,
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
