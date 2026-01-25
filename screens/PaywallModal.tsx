import React, { useState } from 'react';
import { Button, Modal, StyleSheet, Text, View } from 'react-native';
import { usePaywall } from '../contexts/PaywallContext';
import {
  PLACEHOLDER_PRICING,
  YEARLY_DISCOUNT_MULTIPLIER,
} from '../config/entitlements';

const PREMIUM_FEATURES = [
  'Credit cards',
  'Liabilities & receivables',
  'Installments',
  'Unlimited accounts',
  'Unlimited categories',
];

// Rendered once at the root (see App.tsx), driven entirely by
// PaywallContext — there is exactly one of these for the whole app, so
// it can overlay whatever screen is currently active as a true modal
// rather than a pushed route, and dismissing it never navigates anywhere.
function PaywallModal(): React.JSX.Element {
  const { isOpen, request, closePaywall } = usePaywall();
  const [purchaseMessage, setPurchaseMessage] = useState<string | null>(null);

  const monthly = PLACEHOLDER_PRICING.monthlyAmount;
  const undiscountedYearly = monthly * 12;
  const discountedYearly = undiscountedYearly * YEARLY_DISCOUNT_MULTIPLIER;
  const savingsPercent = Math.round((1 - YEARLY_DISCOUNT_MULTIPLIER) * 100);

  const handlePurchase = (plan: 'monthly' | 'yearly') => {
    // Real purchase flow (Apple IAP / Google Play Billing) lands in
    // Stage 19. On success there, this handler becomes the place that
    // calls request.onPurchaseSuccess() before closing — completing
    // whatever the user was doing without making them re-enter it. There
    // is no real purchase to succeed yet, so onPurchaseSuccess is
    // deliberately never called from here.
    console.log('[Paywall] purchase intent (not yet implemented):', {
      plan,
      reason: request?.reason,
    });
    setPurchaseMessage('Purchases are coming soon.');
  };

  const handleClose = () => {
    setPurchaseMessage(null);
    // Just hides the overlay — the screen underneath was never
    // unmounted, so whatever the user had filled in is still there.
    closePaywall();
  };

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Go Premium</Text>
          {request?.reason && (
            <Text style={styles.reason}>{request.reason}</Text>
          )}

          <Text style={styles.sectionLabel}>Premium unlocks</Text>
          {PREMIUM_FEATURES.map(feature => (
            <Text key={feature} style={styles.featureRow}>
              • {feature}
            </Text>
          ))}

          <View style={styles.plans}>
            <View style={styles.planCard}>
              <Text style={styles.planTitle}>Monthly</Text>
              <Text style={styles.planPrice}>
                {PLACEHOLDER_PRICING.currencyCode} {monthly.toFixed(2)}
              </Text>
              <Button
                title="Choose Monthly"
                onPress={() => handlePurchase('monthly')}
              />
            </View>
            <View style={styles.planCard}>
              <Text style={styles.planTitle}>Yearly</Text>
              <Text style={styles.planPrice}>
                {PLACEHOLDER_PRICING.currencyCode}{' '}
                {discountedYearly.toFixed(2)}
              </Text>
              <Text style={styles.planStrike}>
                {PLACEHOLDER_PRICING.currencyCode}{' '}
                {undiscountedYearly.toFixed(2)}
              </Text>
              <Text style={styles.planSavings}>Save {savingsPercent}%</Text>
              <Button
                title="Choose Yearly"
                onPress={() => handlePurchase('yearly')}
              />
            </View>
          </View>

          {purchaseMessage && (
            <Text style={styles.purchaseMessage}>{purchaseMessage}</Text>
          )}

          <View style={styles.closeButton}>
            <Button title="Not now" onPress={handleClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  reason: {
    fontSize: 14,
    color: '#555',
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 6,
  },
  featureRow: {
    fontSize: 14,
    marginTop: 2,
  },
  plans: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  planCard: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  planTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  planPrice: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 6,
  },
  planStrike: {
    fontSize: 13,
    color: '#999',
    textDecorationLine: 'line-through',
    marginTop: 2,
  },
  planSavings: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2e7d32',
    marginTop: 2,
    marginBottom: 8,
  },
  purchaseMessage: {
    fontSize: 13,
    color: '#555',
    marginTop: 16,
    textAlign: 'center',
  },
  closeButton: {
    marginTop: 16,
  },
});

export default PaywallModal;
