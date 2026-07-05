import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, Crown, X } from 'lucide-react-native';
import { usePaywall } from '../contexts/PaywallContext';
import {
  PLACEHOLDER_PRICING,
  YEARLY_DISCOUNT_MULTIPLIER,
} from '../config/entitlements';
import { useTheme } from '../contexts/ThemeContext';
import { scaleFont, typography } from '../theme/typography';
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

  const monthly = PLACEHOLDER_PRICING.monthlyAmount;
  const undiscountedYearly = monthly * 12;
  const discountedYearly = undiscountedYearly * YEARLY_DISCOUNT_MULTIPLIER;
  const savingsPercent = Math.round((1 - YEARLY_DISCOUNT_MULTIPLIER) * 100);

  const handlePurchase = (_plan: 'monthly' | 'yearly') => {
    // Real purchase flow (Apple IAP / Google Play Billing) lands in
    // Stage 19. On success there, this handler becomes the place that
    // calls request.onPurchaseSuccess() before closing — completing
    // whatever the user was doing without making them re-enter it. There
    // is no real purchase to succeed yet, so onPurchaseSuccess is
    // deliberately never called from here.
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
      statusBarTranslucent
      onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            hitSlop={12}
            style={[styles.closeIconButton, { backgroundColor: colors.neutralSoft }]}
            onPress={handleClose}>
            <X size={18} color={colors.text} />
          </Pressable>

          <View style={[styles.crownBadge, { backgroundColor: colors.primarySoft }]}>
            <Crown size={24} color={colors.primary} strokeWidth={2.2} />
          </View>

          <Text style={[typography.screenTitle, styles.title, { color: colors.text }]}>
            Go Premium
          </Text>

          {request?.reason && (
            <View style={[styles.reasonBanner, { backgroundColor: colors.primarySoft }]}>
              <Text style={[styles.reasonText, { color: colors.primary }]}>
                {request.reason}
              </Text>
            </View>
          )}

          <View style={styles.features}>
            {PREMIUM_FEATURES.map(feature => (
              <View key={feature} style={styles.featureRow}>
                <View style={[styles.featureCheck, { backgroundColor: colors.successSoft }]}>
                  <Check size={12} color={colors.success} strokeWidth={3} />
                </View>
                <Text style={[styles.featureText, { color: colors.text }]}>
                  {feature}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.plans}>
            <Pressable
              style={({ pressed }) => [
                styles.planCard,
                { borderColor: colors.border, backgroundColor: colors.card },
                pressed && styles.planCardPressed,
              ]}
              onPress={() => handlePurchase('monthly')}>
              <Text style={[typography.eyebrow, styles.planLabel, { color: colors.textSecondary }]}>
                Monthly
              </Text>
              <Text style={[styles.planPrice, { color: colors.text }]}>
                {formatAmount(monthly, PLACEHOLDER_PRICING.currencyCode)}
              </Text>
              <View style={[styles.planButton, { backgroundColor: colors.neutralSoft }]}>
                <Text style={[styles.planButtonText, { color: colors.text }]}>
                  Choose
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.planCard,
                styles.planCardFeatured,
                { borderColor: colors.primary, backgroundColor: colors.card },
                pressed && styles.planCardPressed,
              ]}
              onPress={() => handlePurchase('yearly')}>
              <View style={[styles.bestValueBadge, { backgroundColor: colors.primary }]}>
                <Text style={[styles.bestValueBadgeText, { color: colors.primaryText }]}>
                  BEST VALUE
                </Text>
              </View>
              <Text style={[typography.eyebrow, styles.planLabel, { color: colors.textSecondary }]}>
                Yearly
              </Text>
              <Text style={[styles.planPrice, { color: colors.text }]}>
                {formatAmount(discountedYearly, PLACEHOLDER_PRICING.currencyCode)}
              </Text>
              <View style={styles.planStrikeRow}>
                <Text style={[styles.planStrike, { color: colors.textSecondary }]}>
                  {formatAmount(undiscountedYearly, PLACEHOLDER_PRICING.currencyCode)}
                </Text>
                <View style={[styles.savingsPill, { backgroundColor: colors.successSoft }]}>
                  <Text style={[styles.savingsPillText, { color: colors.success }]}>
                    Save {savingsPercent}%
                  </Text>
                </View>
              </View>
              <View style={[styles.planButton, { backgroundColor: colors.primary }]}>
                <Text style={[styles.planButtonText, { color: colors.primaryText }]}>
                  Choose
                </Text>
              </View>
            </Pressable>
          </View>

          {purchaseMessage && (
            <Text style={[styles.purchaseMessage, { color: colors.textSecondary }]}>
              {purchaseMessage}
            </Text>
          )}

          <Pressable style={styles.maybeLater} onPress={handleClose}>
            <Text style={[styles.maybeLaterText, { color: colors.textSecondary }]}>
              Maybe later
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  card: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    paddingBottom: 32,
  },
  closeIconButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  crownBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: scaleFont(24),
    marginBottom: 12,
  },
  reasonBanner: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  reasonText: {
    fontSize: scaleFont(13.5),
    fontWeight: '600',
  },
  features: {
    marginBottom: 18,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  featureCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  featureText: {
    fontSize: scaleFont(14),
    fontWeight: '500',
  },
  plans: {
    flexDirection: 'row',
    gap: 12,
  },
  planCard: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 14,
  },
  planCardFeatured: {
    borderWidth: 1.5,
  },
  planCardPressed: {
    opacity: 0.7,
  },
  bestValueBadge: {
    position: 'absolute',
    top: -10,
    alignSelf: 'center',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  bestValueBadgeText: {
    fontSize: scaleFont(9.5),
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  planLabel: {
    marginBottom: 6,
  },
  planPrice: {
    fontSize: scaleFont(19),
    fontWeight: '800',
  },
  planStrikeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  planStrike: {
    fontSize: scaleFont(12),
    textDecorationLine: 'line-through',
  },
  savingsPill: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  savingsPillText: {
    fontSize: scaleFont(10.5),
    fontWeight: '700',
  },
  planButton: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  planButtonText: {
    fontSize: scaleFont(13.5),
    fontWeight: '700',
  },
  purchaseMessage: {
    fontSize: scaleFont(13),
    marginTop: 16,
    textAlign: 'center',
  },
  maybeLater: {
    alignItems: 'center',
    marginTop: 16,
  },
  maybeLaterText: {
    fontSize: scaleFont(13.5),
    fontWeight: '600',
  },
});

export default PaywallModal;
