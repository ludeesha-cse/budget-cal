import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AlertTriangle, Check, Crown, X } from 'lucide-react-native';
import { usePaywall } from '../contexts/PaywallContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useAuth } from '../contexts/AuthContext';
import { PLANS, type PlanDefinition, type PlanId } from '../config/entitlements';
import { useTheme } from '../contexts/ThemeContext';
import { scaleFont, typography } from '../theme/typography';
import type { ThemeColors } from '../theme/palettes';

const PREMIUM_FEATURES = [
  'Credit cards',
  'Liabilities & receivables',
  'Installments',
  'Unlimited accounts',
  'Unlimited categories',
];

// Which plan gets the BEST VALUE badge. A constant rather than "whichever
// is cheapest per month", because the badge is a merchandising choice and
// should not silently move if store pricing changes in one country.
const FEATURED_PLAN: PlanId = 'yearly';

function PaywallModal(): React.JSX.Element {
  const { colors } = useTheme();
  const { isOpen, request, closePaywall } = usePaywall();
  const { isSignedIn, signInWithGoogleAndroid } = useAuth();
  const {
    isEntitled,
    canPurchase,
    products,
    productForPlan,
    isLoadingProducts,
    purchaseActivity,
    isRestoring,
    lastError,
    clearError,
    purchase,
    restorePurchases,
  } = useSubscription();
  const [signingIn, setSigningIn] = useState(false);

  // Clear a stale error from a previous visit whenever the sheet opens,
  // so a failure the user has already read and moved on from doesn't
  // reappear on top of a fresh attempt.
  useEffect(() => {
    if (isOpen) {
      clearError();
    }
  }, [isOpen, clearError]);

  // A purchase that succeeds while this sheet is open should hand the
  // user straight back to whatever they were doing — the point of
  // onPurchaseSuccess is that they never re-enter the form the paywall
  // interrupted. Keyed on isEntitled rather than on purchase()'s return
  // value so a restore, or an entitlement arriving from the Firestore
  // listener (bought on another device), closes the sheet too.
  useEffect(() => {
    if (isOpen && isEntitled) {
      const onSuccess = request?.onPurchaseSuccess;
      closePaywall();
      onSuccess?.();
    }
  }, [isOpen, isEntitled, request, closePaywall]);

  const handleClose = () => {
    clearError();
    request?.onDismiss?.();
    closePaywall();
  };

  const handleSignIn = async () => {
    if (signingIn) {
      return;
    }
    setSigningIn(true);
    try {
      await signInWithGoogleAndroid();
    } catch (error) {
      console.error('[PaywallModal] sign-in failed:', error);
    } finally {
      setSigningIn(false);
    }
  };

  const busy = purchaseActivity != null || isRestoring;
  const isAndroid = Platform.OS === 'android';

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}>
          <Pressable
            hitSlop={12}
            style={[
              styles.closeIconButton,
              { backgroundColor: colors.neutralSoft },
            ]}
            onPress={handleClose}>
            <X size={18} color={colors.text} />
          </Pressable>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}>
            <View
              style={[
                styles.crownBadge,
                { backgroundColor: colors.primarySoft },
              ]}>
              <Crown size={24} color={colors.primary} strokeWidth={2.2} />
            </View>

            <Text
              style={[
                typography.screenTitle,
                styles.title,
                { color: colors.text },
              ]}>
              Go Premium
            </Text>

            {request?.reason && (
              <View
                style={[
                  styles.reasonBanner,
                  { backgroundColor: colors.primarySoft },
                ]}>
                <Text style={[styles.reasonText, { color: colors.primary }]}>
                  {request.reason}
                </Text>
              </View>
            )}

            <View style={styles.features}>
              {PREMIUM_FEATURES.map(feature => (
                <View key={feature} style={styles.featureRow}>
                  <View
                    style={[
                      styles.featureCheck,
                      { backgroundColor: colors.successSoft },
                    ]}>
                    <Check size={12} color={colors.success} strokeWidth={3} />
                  </View>
                  <Text style={[styles.featureText, { color: colors.text }]}>
                    {feature}
                  </Text>
                </View>
              ))}
            </View>

            {/* Sign-in comes before any plan card rather than after a tap.
                A purchase is recorded against a Firebase uid — without
                one, verifyGooglePurchase throws unauthenticated and the
                user has paid for an entitlement with nowhere to live.
                Better to ask for the account first than to take money and
                then explain. */}
            {isAndroid && !isSignedIn && (
              <SignInPrompt
                colors={colors}
                busy={signingIn}
                onPress={handleSignIn}
              />
            )}

            {!isAndroid ? (
              <Text style={[styles.notice, { color: colors.textSecondary }]}>
                Purchases aren't available on iOS yet.
              </Text>
            ) : isLoadingProducts ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.notice, { color: colors.textSecondary }]}>
                  Loading plans…
                </Text>
              </View>
            ) : (
              <View style={styles.plans}>
                {PLANS.map(plan => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    colors={colors}
                    priceText={
                      productForPlan(plan.id)?.priceText ??
                      plan.fallbackPriceText
                    }
                    hasPrice={productForPlan(plan.id) != null}
                    featured={plan.id === FEATURED_PLAN}
                    disabled={!canPurchase || !isSignedIn || busy}
                    phase={
                      purchaseActivity?.planId === plan.id
                        ? purchaseActivity.phase
                        : 'idle'
                    }
                    onPress={() => purchase(plan.id)}
                  />
                ))}
              </View>
            )}

            {isAndroid && !canPurchase && (
              <Text style={[styles.notice, { color: colors.textSecondary }]}>
                Purchases aren't available in this build yet.
              </Text>
            )}

            {isAndroid && canPurchase && products.length === 0 && !isLoadingProducts && (
              <Text style={[styles.notice, { color: colors.textSecondary }]}>
                Plan prices couldn't be loaded from Google Play. Check your
                connection and reopen this screen.
              </Text>
            )}

            {lastError && (
              <View
                style={[
                  styles.errorBanner,
                  { backgroundColor: colors.dangerSoft },
                ]}>
                <AlertTriangle size={14} color={colors.danger} />
                <Text style={[styles.errorText, { color: colors.danger }]}>
                  {lastError}
                </Text>
              </View>
            )}

            {isAndroid && (
              <Pressable
                style={styles.secondaryAction}
                disabled={busy}
                onPress={() => restorePurchases()}>
                <Text
                  style={[
                    styles.secondaryActionText,
                    { color: busy ? colors.textSecondary : colors.primary },
                  ]}>
                  {isRestoring ? 'Restoring…' : 'Restore purchases'}
                </Text>
              </Pressable>
            )}

            <Pressable style={styles.maybeLater} onPress={handleClose}>
              <Text
                style={[
                  styles.maybeLaterText,
                  { color: colors.textSecondary },
                ]}>
                Maybe later
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SignInPrompt({
  colors,
  busy,
  onPress,
}: {
  colors: ThemeColors;
  busy: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <View
      style={[
        styles.signInBox,
        { backgroundColor: colors.neutralSoft, borderColor: colors.border },
      ]}>
      <Text style={[styles.signInTitle, { color: colors.text }]}>
        Sign in to continue
      </Text>
      <Text style={[styles.signInBody, { color: colors.textSecondary }]}>
        Your subscription is tied to your account, so it follows you if you
        change phones. Signing in never changes your budget data.
      </Text>
      <Pressable
        disabled={busy}
        onPress={onPress}
        style={({ pressed }) => [
          styles.signInButton,
          { backgroundColor: colors.primary },
          (pressed || busy) && styles.pressed,
        ]}>
        <Text style={[styles.signInButtonText, { color: colors.primaryText }]}>
          {busy ? 'Signing in…' : 'Sign in with Google'}
        </Text>
      </Pressable>
    </View>
  );
}

function PlanCard({
  plan,
  colors,
  priceText,
  hasPrice,
  featured,
  disabled,
  phase,
  onPress,
}: {
  plan: PlanDefinition;
  colors: ThemeColors;
  priceText: string;
  hasPrice: boolean;
  featured: boolean;
  disabled: boolean;
  phase: 'idle' | 'purchasing' | 'verifying';
  onPress: () => void;
}): React.JSX.Element {
  const isBusy = phase !== 'idle';
  // A plan with no store price is not purchasable — tapping it could only
  // open a sheet for a product the store doesn't know about.
  const isDisabled = disabled || !hasPrice;

  const buttonLabel = (() => {
    switch (phase) {
      case 'purchasing':
        return 'Opening Google Play…';
      case 'verifying':
        return 'Confirming…';
      default:
        return plan.isSubscription ? 'Subscribe' : 'Buy';
    }
  })();

  return (
    <Pressable
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.planCard,
        { borderColor: featured ? colors.primary : colors.border, backgroundColor: colors.card },
        featured && styles.planCardFeatured,
        isDisabled && styles.planCardDisabled,
        pressed && styles.pressed,
      ]}>
      {featured && (
        <View
          style={[styles.bestValueBadge, { backgroundColor: colors.primary }]}>
          <Text
            style={[
              styles.bestValueBadgeText,
              { color: colors.primaryText },
            ]}>
            BEST VALUE
          </Text>
        </View>
      )}
      <View style={styles.planTop}>
        <Text
          style={[
            typography.eyebrow,
            styles.planLabel,
            { color: colors.textSecondary },
          ]}>
          {plan.label}
        </Text>
        <Text style={[styles.planPrice, { color: colors.text }]}>
          {priceText}
        </Text>
        <Text style={[styles.planTerm, { color: colors.textSecondary }]}>
          {plan.isSubscription
            ? plan.id === 'yearly'
              ? 'per year, cancel anytime'
              : 'per month, cancel anytime'
            : 'one-time payment'}
        </Text>
      </View>
      <View
        style={[
          styles.planButton,
          {
            backgroundColor: featured ? colors.primary : colors.neutralSoft,
          },
        ]}>
        {isBusy && (
          <ActivityIndicator
            size="small"
            color={featured ? colors.primaryText : colors.text}
          />
        )}
        <Text
          style={[
            styles.planButtonText,
            { color: featured ? colors.primaryText : colors.text },
          ]}>
          {buttonLabel}
        </Text>
      </View>
    </Pressable>
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
    paddingHorizontal: 20,
    paddingTop: 20,
    // flexShrink rather than a measured maxHeight — the sheet takes the
    // space its content needs and no more, and shrinks instead of
    // overflowing when the content is taller than the screen.
    flexShrink: 1,
  },
  scrollContent: {
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
  signInBox: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 16,
  },
  signInTitle: {
    fontSize: scaleFont(14.5),
    fontWeight: '700',
    marginBottom: 4,
  },
  signInBody: {
    fontSize: scaleFont(12.5),
    lineHeight: scaleFont(18),
    marginBottom: 12,
  },
  signInButton: {
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  signInButtonText: {
    fontSize: scaleFont(13.5),
    fontWeight: '700',
  },
  plans: {
    gap: 10,
  },
  planCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  planCardFeatured: {
    borderWidth: 1.5,
    marginTop: 8,
  },
  planCardDisabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
  planTop: {
    flexShrink: 1,
  },
  bestValueBadge: {
    position: 'absolute',
    top: -9,
    left: 14,
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
    marginBottom: 4,
  },
  planPrice: {
    fontSize: scaleFont(19),
    fontWeight: '800',
  },
  planTerm: {
    fontSize: scaleFont(11.5),
    marginTop: 2,
  },
  planButton: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  planButtonText: {
    fontSize: scaleFont(13),
    fontWeight: '700',
  },
  loadingRow: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  notice: {
    fontSize: scaleFont(12.5),
    marginTop: 12,
    textAlign: 'center',
    lineHeight: scaleFont(18),
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
  },
  errorText: {
    flex: 1,
    fontSize: scaleFont(12.5),
    lineHeight: scaleFont(18),
    fontWeight: '600',
  },
  secondaryAction: {
    alignItems: 'center',
    marginTop: 16,
  },
  secondaryActionText: {
    fontSize: scaleFont(13.5),
    fontWeight: '700',
  },
  maybeLater: {
    alignItems: 'center',
    marginTop: 12,
  },
  maybeLaterText: {
    fontSize: scaleFont(13.5),
    fontWeight: '600',
  },
});

export default PaywallModal;
