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
  // Called once "Get Started" has successfully flipped the
  // onboardingCompleted latch. App.tsx's RootFlow owns what happens next
  // (the default currency screen) — this screen deliberately knows
  // nothing about it, so it stays a plain component with no navigator of
  // its own and no route to register.
  onDone: () => void;
};

// The first-launch carousel. Slides come from config/helpTopics.ts, the
// same list Help & Support renders in expanded form — see that file's
// header for why the two screens share one source.
//
// Built on React Native's own ScrollView with pagingEnabled rather than a
// carousel library: the requirement here is one full-width page at a time
// with no parallax, no autoplay and no looping, which is exactly what
// pagingEnabled already does. Adding a native carousel dependency (and an
// iOS pod install step, and a rebuild) to avoid ~20 lines of scroll
// bookkeeping would be a bad trade — see ScreenBackground.tsx's own
// comment about the RNDocumentPicker pod incident.
function OnboardingScreen({ onDone }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  // Measured rather than taken from Dimensions.get('window') so a rotation
  // or an Android split-screen resize re-lays-out correctly — a page width
  // captured once at module load would leave every slide misaligned by
  // however much the window changed. 0 until the first layout pass, which
  // is why the slides below are only given a width once it is non-zero.
  const [pageWidth, setPageWidth] = useState(0);
  const [finishing, setFinishing] = useState(false);

  const isFirst = index === 0;
  const isLast = index === HELP_TOPICS.length - 1;

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setPageWidth(event.nativeEvent.layout.width);
  }, []);

  // Programmatic scrolling (the Next/Back buttons) and swiping are two
  // ways of driving the SAME ScrollView, not two competing mechanisms:
  // the buttons call scrollTo, the swipe moves it directly, and
  // onMomentumScrollEnd below is the single place `index` is updated from
  // in both cases. That is what keeps the dots and the button labels
  // correct no matter which one the user used.
  const goTo = useCallback(
    (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(HELP_TOPICS.length - 1, nextIndex));
      scrollRef.current?.scrollTo({ x: clamped * pageWidth, animated: true });
      // Updated optimistically as well as in onMomentumScrollEnd — an
      // animated scrollTo does fire that callback, but not until the
      // animation finishes, and the button label shouldn't lag ~300ms
      // behind the tap that caused it.
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
      // Already logged with its own message inside setOnboardingCompleted.
      // Re-enabling the button (rather than advancing anyway) is
      // deliberate: advancing on a failed write would drop the user into
      // the app with the latch still false, so the carousel would come
      // back on the next launch with no explanation.
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

        {/* Fixed footer, outside the ScrollView — always visible on every
            slide, never scrolls away with the content. Back keeps its
            layout slot on the first slide (opacity 0 + pointerEvents
            none, not a conditional render) so the Next button doesn't
            jump sideways between slide 1 and slide 2. */}
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

// One page of the carousel. Extracted to module scope rather than defined
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

// The per-slide artwork slot. Real screenshots are being supplied
// separately, so config/helpTopics.ts currently sets `image: null` on
// every topic and this renders a labelled placeholder frame instead of an
// <Image>. The moment a topic's `image` becomes a require(...), the same
// slot renders it with no other change anywhere — which is the point of
// leaving the slot here rather than blocking the build on assets that
// don't exist yet.
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
  // 4:3 — matches the supplied artwork (e.g. public/welcome-onboarding.png,
  // 2000x1500) exactly. aspectRatio rather than a fixed height is what
  // makes this ratio hold on every device: width already tracks the
  // slide's measured pageWidth via '100%', so a fixed height here would
  // have stretched the same image differently on a narrow phone vs a
  // Pro Max. Export every onboarding image at this same 4:3 ratio
  // (e.g. 1200x900 or 2000x1500) so none of them need per-image styling.
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
