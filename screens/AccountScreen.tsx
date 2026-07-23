import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { CircleUser } from 'lucide-react-native';
import ScreenBackground from '../components/ScreenBackground';
import Card from '../components/Card';
import ActionButtons from '../components/common/ActionButtons';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { typography, scaleFont } from '../theme/typography';

// Stage 18 (Android only). Sign-in here is purely account/identity — it
// never gates any other screen and the local database is completely
// unaffected by sign-in state (see AuthContext.tsx's signOut comment).
// This screen exists so the user has *somewhere* to sign in/out from, not
// because anything else in the app currently depends on it.
function AccountScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const { session, isSignedIn, isInitializing, signInWithGoogleAndroid, signOut } =
    useAuth();
  const [busy, setBusy] = useState(false);

  const handleSignIn = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await signInWithGoogleAndroid();
    } catch (error) {
      console.error('Sign-in failed', error);
      Alert.alert(
        'Sign-in failed',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await signOut();
    } catch (error) {
      Alert.alert(
        'Sign-out failed',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenBackground colors={colors}>
      <View style={styles.container}>
        <Text style={[typography.eyebrow, styles.sectionLabel, { color: colors.textSecondary }]}>
          Account
        </Text>
        <Card colors={colors} style={styles.card}>
          {isInitializing ? (
            <View style={styles.centerRow}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : Platform.OS === 'android' ? (
            <AndroidAccountSection
              isSignedIn={isSignedIn}
              email={session?.email ?? null}
              displayName={session?.displayName ?? null}
              busy={busy}
              onSignIn={handleSignIn}
              onSignOut={handleSignOut}
            />
          ) : (
            <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
              Sign-in isn't available on iOS yet.
            </Text>
          )}
        </Card>
        <Text style={[styles.footnote, { color: colors.textSecondary }]}>
          Signing in or out never changes anything in your budget data — your
          accounts, transactions, and balances stay exactly as they are
          either way.
        </Text>
      </View>
    </ScreenBackground>
  );
}

function AndroidAccountSection({
  isSignedIn,
  email,
  displayName,
  busy,
  onSignIn,
  onSignOut,
}: {
  isSignedIn: boolean;
  email: string | null;
  displayName: string | null;
  busy: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();

  if (!isSignedIn) {
    return (
      <View>
        <View style={styles.centerRow}>
          <CircleUser color={colors.textSecondary} size={40} />
        </View>
        <Text style={[styles.bodyText, styles.centerText, { color: colors.textSecondary }]}>
          Not signed in.
        </Text>
        <ActionButtons
          variant="pill"
          equalWidth
          items={[
            {
              key: 'signIn',
              label: busy ? 'Signing in…' : 'Sign in with Google',
              tone: 'primary',
              solid: true,
              onPress: onSignIn,
            },
          ]}
        />
      </View>
    );
  }

  return (
    <View>
      <View style={styles.centerRow}>
        <CircleUser color={colors.primary} size={40} />
      </View>
      <Text style={[styles.nameText, styles.centerText, { color: colors.text }]}>
        {displayName ?? 'Signed in'}
      </Text>
      {email && (
        <Text style={[styles.bodyText, styles.centerText, { color: colors.textSecondary }]}>
          {email}
        </Text>
      )}
      <ActionButtons
        variant="pill"
        equalWidth
        items={[
          {
            key: 'signOut',
            label: busy ? 'Signing out…' : 'Sign out',
            tone: 'danger',
            onPress: onSignOut,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  sectionLabel: {
    marginBottom: 10,
  },
  card: {
    padding: 16,
  },
  centerRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  centerText: {
    textAlign: 'center',
  },
  nameText: {
    fontSize: scaleFont(16),
    fontWeight: '700',
    marginBottom: 2,
  },
  bodyText: {
    fontSize: scaleFont(13),
    marginBottom: 14,
  },
  footnote: {
    fontSize: scaleFont(12),
    marginTop: 14,
  },
});

export default AccountScreen;
