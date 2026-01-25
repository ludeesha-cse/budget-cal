import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useEntitlement } from '../hooks/useEntitlement';
import { usePaywall } from '../contexts/PaywallContext';

type PremiumGateProps = {
  children: React.ReactNode;
  // What's being gated — shown as the paywall's reason. Falls back to a
  // generic label if omitted.
  label?: string;
};

// For features with no meaningful "try it" flow — everywhere a form or
// multi-step interaction exists (adding an account, a category, a
// liability), prefer gating on submit instead (see AccountsScreen,
// CategoriesScreen, LiabilitiesReceivablesScreen) so users experience
// the feature before a paywall ever appears. This component is for the
// remaining case: content with nothing to fill in or step through, where
// gating can only ever happen at the entry point.
function PremiumGate({ children, label }: PremiumGateProps): React.JSX.Element {
  const { isPremium } = useEntitlement();
  const { openPaywall } = usePaywall();

  if (isPremium) {
    return <>{children}</>;
  }

  return (
    <Pressable
      onPress={() =>
        openPaywall({
          reason: label ?? 'This feature requires Premium.',
          onPurchaseSuccess: () => {},
        })
      }
      style={styles.wrapper}>
      {/* pointerEvents="none" makes the real content non-interactive
          while staying fully visible — the point of gating this way is
          that a free user can see what they'd get, not that it vanishes. */}
      <View pointerEvents="none" style={styles.dimmed}>
        {children}
      </View>
      <View style={styles.lockBadge}>
        <Text style={styles.lockText}>🔒 Premium</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  dimmed: {
    opacity: 0.45,
  },
  lockBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  lockText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
});

export default PremiumGate;
