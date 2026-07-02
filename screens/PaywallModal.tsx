import React, { useState } from 'react';
import { Button, Modal, StyleSheet, Text, View } from 'react-native';
import { usePaywall } from '../contexts/PaywallContext';
import {
  PLACEHOLDER_PRICING,
  YEARLY_DISCOUNT_MULTIPLIER,
} from '../config/entitlements';
import { useTheme } from '../contexts/ThemeContext';
import { formatAmount } from '../utils/formatAmount';

const PREMIUM_FEATURES = [
  'Credit cards',
  'Liabilities & receivables',
  'Installments',
  'Unlimited accounts',
  'Unlimited categories',
];


function PaywallModal(): React.JSX.Element {
  const { colors } = useTheme();
  const { isOpen, request, closePaywall } = usePaywall();
  const [purchaseMessage, setPurchaseMessage] = useState<string | null>(null);

  console.log('[PaywallModal] render, isOpen =', isOpen, 'reason =', request?.reason);

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
    request?.onDismiss?.();
    closePaywall();
  };

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.text }]}>
            Go Premium
          </Text>
          {request?.reason && (
            <Text style={[styles.reason, { color: colors.textSecondary }]}>
              {request.reason}
            </Text>
          )}

          <Text style={[styles.sectionLabel, { color: colors.text }]}>
            Premium unlocks
          </Text>
          {PREMIUM_FEATURES.map(feature => (
            <Text key={feature} style={[styles.featureRow, { color: colors.text }]}>
              • {feature}
            </Text>
          ))}

          <View style={styles.plans}>
            <View style={[styles.planCard, { borderColor: colors.border }]}>
              <Text style={[styles.planTitle, { color: colors.text }]}>
                Monthly
              </Text>
              <Text style={[styles.planPrice, { color: colors.text }]}>
                {formatAmount(monthly, PLACEHOLDER_PRICING.currencyCode)}
              </Text>
              <Button
                title="Choose Monthly"
                color={colors.primary}
                onPress={() => handlePurchase('monthly')}
              />
            </View>
            <View style={[styles.planCard, { borderColor: colors.border }]}>
              <Text style={[styles.planTitle, { color: colors.text }]}>
                Yearly
              </Text>
              <Text style={[styles.planPrice, { color: colors.text }]}>
                {formatAmount(discountedYearly, PLACEHOLDER_PRICING.currencyCode)}
              </Text>
              <Text style={[styles.planStrike, { color: colors.textSecondary }]}>
                {formatAmount(undiscountedYearly, PLACEHOLDER_PRICING.currencyCode)}
              </Text>
              <Text style={[styles.planSavings, { color: colors.success }]}>
                Save {savingsPercent}%
              </Text>
              <Button
                title="Choose Yearly"
                color={colors.primary}
                onPress={() => handlePurchase('yearly')}
              />
            </View>
          </View>

          {purchaseMessage && (
            <Text style={[styles.purchaseMessage, { color: colors.textSecondary }]}>
              {purchaseMessage}
            </Text>
          )}

          <View style={styles.closeButton}>
            <Button title="Not now" color={colors.primary} onPress={handleClose} />
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
    textDecorationLine: 'line-through',
    marginTop: 2,
  },
  planSavings: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 8,
  },
  purchaseMessage: {
    fontSize: 13,
    marginTop: 16,
    textAlign: 'center',
  },
  closeButton: {
    marginTop: 16,
  },
});

export default PaywallModal;
