import React from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MessageCircle } from 'lucide-react-native';
import Card from '../components/Card';
import ScreenBackground from '../components/ScreenBackground';
import { useTheme } from '../contexts/ThemeContext';
import { scaleFont, typography } from '../theme/typography';
import { HELP_TOPICS } from '../config/helpTopics';

// TODO: replace with real WhatsApp number before release.
// Digits only, in full international form: country code followed by the
// subscriber number, with no '+', no leading zero and no spaces or
// dashes — that is exactly the format wa.me expects, and the most common
// way these links are shipped broken. The value below is a placeholder
// and is deliberately NOT a plausible real number, so a missed
// replacement fails visibly in testing instead of quietly messaging a
// stranger.
const SUPPORT_WHATSAPP_NUMBER = '00000000000';

// wa.me is the link format that actually opens WhatsApp — a `tel:` link
// hands the number to the phone dialer instead, which is not what anyone
// tapping a "message us on WhatsApp" row expects. Deliberately no
// pre-filled `?text=` body: the user is writing about their own problem,
// and a canned opener just has to be deleted first.
const SUPPORT_WHATSAPP_URL = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}`;

// The reference version of the first-launch carousel. Same topics, same
// order (both read config/helpTopics.ts), but rendering each topic's
// `detail` paragraphs instead of its one-slide `summary` — written for
// someone who arrived here with a specific question rather than someone
// swiping through on their first day.
//
// Reachable from More at any time, independent of onboarding state: this
// is not part of the first-launch flow and never gates anything.
function HelpSupportScreen(): React.JSX.Element {
  const { colors } = useTheme();

  // openURL rather than a raw <Text onPress> so the OS decides what
  // handles the link — WhatsApp if installed, otherwise wa.me in a
  // browser, which is that link format's own documented fallback. This
  // opens an external app via the device's link handler; it is not a
  // network request this app makes, and nothing about the user's data
  // goes with it.
  const handleWhatsAppPress = async () => {
    try {
      await Linking.openURL(SUPPORT_WHATSAPP_URL);
      console.log(`[help] opened WhatsApp link ${SUPPORT_WHATSAPP_URL}`);
    } catch (error) {
      console.error('handleWhatsAppPress: could not open WhatsApp link', error);
      Alert.alert(
        'Could not open WhatsApp',
        'Install WhatsApp, or message us from another device.',
      );
    }
  };

  return (
    <ScreenBackground colors={colors}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          A fuller version of the welcome tour, kept here so you can look
          something up rather than remember it. Each section below covers one
          part of the app.
        </Text>

        {HELP_TOPICS.map(topic => (
          <View key={topic.key}>
            <Text
              style={[
                typography.eyebrow,
                styles.sectionLabel,
                { color: colors.textSecondary },
              ]}>
              {topic.heading}
            </Text>
            <Card colors={colors} style={styles.card}>
              {topic.detail.map((paragraph, index) => (
                <Text
                  key={`${topic.key}-${index}`}
                  style={[
                    styles.paragraph,
                    { color: colors.text },
                    index > 0 && styles.paragraphSpacing,
                  ]}>
                  {paragraph}
                </Text>
              ))}
            </Card>
          </View>
        ))}

        <Text
          style={[
            typography.eyebrow,
            styles.sectionLabel,
            { color: colors.textSecondary },
          ]}>
          Still stuck?
        </Text>
        <Card colors={colors} style={styles.card}>
          <Text style={[styles.paragraph, { color: colors.text }]}>
            If something here didn't answer your question — or the app is doing
            something it shouldn't — message us on WhatsApp and describe what you
            were trying to do.
          </Text>
          <Pressable
            style={[styles.whatsappButton, { backgroundColor: colors.primary }]}
            onPress={handleWhatsAppPress}>
            <MessageCircle size={18} color={colors.primaryText} />
            <Text
              style={[styles.whatsappButtonText, { color: colors.primaryText }]}>
              Message us on WhatsApp
            </Text>
          </Pressable>
          <Text style={[styles.footnote, { color: colors.textSecondary }]}>
            This opens WhatsApp on your phone. Nothing is sent until you send it,
            and none of your financial records leave the app.
          </Text>
        </Card>
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    padding: 16,
    // Clears the floating tab bar pill + FAB (see App.tsx) — same
    // reasoning as SettingsHomeScreen's own container.
    paddingBottom: 120,
  },
  intro: {
    fontSize: scaleFont(14),
    lineHeight: scaleFont(21),
    marginTop: 4,
  },
  sectionLabel: {
    marginTop: 22,
    marginBottom: 10,
  },
  card: {
    padding: 16,
  },
  paragraph: {
    fontSize: scaleFont(14),
    lineHeight: scaleFont(22),
  },
  paragraphSpacing: {
    marginTop: 12,
  },
  whatsappButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 16,
  },
  whatsappButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  footnote: {
    fontSize: scaleFont(12),
    lineHeight: scaleFont(18),
    marginTop: 12,
  },
});

export default HelpSupportScreen;
