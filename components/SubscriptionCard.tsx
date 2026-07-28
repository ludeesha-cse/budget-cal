import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AlertTriangle,
  Crown,
  ExternalLink,
  RefreshCw,
  RotateCcw,
} from 'lucide-react-native';
import Card from './Card';
import { useTheme } from '../contexts/ThemeContext';
import { usePaywall } from '../contexts/PaywallContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import {
  describeStatus,
  formatSubscriptionDate,
  planLabel,
} from '../utils/subscription';
import { scaleFont } from '../theme/typography';

// The subscription half of the Account screen: what the person is on,
// what happens next, and the three things they can do about it without
// leaving the app (upgrade, restore, re-check) plus the one they have to
// leave for (cancel/change payment, which only Google Play can do).
function SubscriptionCard(): React.JSX.Element {
  const { colors } = useTheme();
  const { openPaywall } = usePaywall();
  const {
    snapshot,
    status,
    isEntitled,
    isResolving,
    isRestoring,
    isRefreshing,
    lastError,
    restorePurchases,
    refresh,
    openManageSubscription,
  } = useSubscription();

  const statusToneColor = (() => {
    switch (status) {
      case 'lapsed':
        return colors.danger;
      case 'renewing':
        return colors.warning;
      case 'active':
      case 'lifetime':
        return colors.success;
      default:
        return colors.textSecondary;
    }
  })();

  const statusToneSoft = (() => {
    switch (status) {
      case 'lapsed':
        return colors.dangerSoft;
      case 'renewing':
        return colors.primarySoft;
      case 'active':
      case 'lifetime':
        return colors.successSoft;
      default:
        return colors.neutralSoft;
    }
  })();

  const statusWord = (() => {
    switch (status) {
      case 'lapsed':
        return 'ENDED';
      case 'renewing':
        return 'RENEWING';
      case 'lifetime':
        return 'LIFETIME';
      case 'active':
        return 'ACTIVE';
      default:
        return 'FREE';
    }
  })();

  // Deliberately does not render "Free" while the first entitlement
  // answer is still in flight. Showing a paying subscriber the free plan
  // for half a second on every cold start reads as "my subscription is
  // gone", and no amount of it correcting itself afterwards undoes that.
  if (isResolving) {
    return (
      <Card colors={colors} style={styles.card}>
        <View style={styles.resolvingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.statusLine, { color: colors.textSecondary }]}>
            Checking your subscription…
          </Text>
        </View>
      </Card>
    );
  }

  return (
    <Card colors={colors} style={styles.card}>
      <View style={styles.headerRow}>
        <View style={[styles.crownBadge, { backgroundColor: statusToneSoft }]}>
          <Crown size={18} color={statusToneColor} strokeWidth={2.2} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.planName, { color: colors.text }]}>
            {planLabel(snapshot.tier)}
          </Text>
          <Text style={[styles.statusLine, { color: colors.textSecondary }]}>
            {describeStatus(snapshot)}
          </Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: statusToneSoft }]}>
          <Text style={[styles.statusPillText, { color: statusToneColor }]}>
            {statusWord}
          </Text>
        </View>
      </View>

      {status === 'lapsed' && (
        <View
          style={[styles.warningBox, { backgroundColor: colors.dangerSoft }]}>
          <AlertTriangle size={14} color={colors.danger} />
          <Text style={[styles.warningText, { color: colors.danger }]}>
            Premium features are switched off. Nothing in your budget was
            deleted — every account, transaction and balance is exactly where
            you left it, and it all comes straight back if you resubscribe.
          </Text>
        </View>
      )}

      <View style={[styles.detailBlock, { borderTopColor: colors.border }]}>
        {snapshot.store != null && (
          <DetailRow
            label="Billed through"
            value={
              snapshot.store === 'google_play' ? 'Google Play' : 'App Store'
            }
          />
        )}
        {snapshot.expiryDate != null && (
          <DetailRow
            label={status === 'lapsed' ? 'Ended' : 'Next renewal'}
            value={formatSubscriptionDate(snapshot.expiryDate)}
          />
        )}
        <DetailRow
          label="Last checked with the store"
          value={
            snapshot.lastVerifiedAt != null
              ? formatSubscriptionDate(snapshot.lastVerifiedAt)
              : snapshot.source === 'none'
              ? // Signed out: there is no entitlement to have checked.
                // Saying anything else here would imply we looked.
                'Sign in to check'
              : // The offline path: claims carry the tier and expiry but
                // not lastVerifiedAt, so saying "unknown" here would be
                // wrong — this is a device that has an answer, just not a
                // freshly fetched one.
                'Using the copy saved on this device'
          }
        />
      </View>

      {lastError && (
        <View style={[styles.warningBox, { backgroundColor: colors.dangerSoft }]}>
          <AlertTriangle size={14} color={colors.danger} />
          <Text style={[styles.warningText, { color: colors.danger }]}>
            {lastError}
          </Text>
        </View>
      )}

      {!isEntitled && (
        <Pressable
          onPress={() =>
            openPaywall({
              reason:
                status === 'lapsed'
                  ? 'Resubscribe to switch your premium features back on.'
                  : 'Unlock credit cards, liabilities, installments and unlimited accounts.',
              onPurchaseSuccess: () => {},
            })
          }
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.primary },
            pressed && styles.pressed,
          ]}>
          <Text style={[styles.primaryButtonText, { color: colors.primaryText }]}>
            {status === 'lapsed' ? 'Resubscribe' : 'See premium plans'}
          </Text>
        </Pressable>
      )}

      <View style={styles.secondaryRow}>
        <SecondaryButton
          icon={RefreshCw}
          label={isRefreshing ? 'Checking…' : 'Refresh status'}
          disabled={isRefreshing || isRestoring}
          onPress={() => refresh()}
        />
        <SecondaryButton
          icon={RotateCcw}
          label={isRestoring ? 'Restoring…' : 'Restore purchases'}
          disabled={isRefreshing || isRestoring}
          onPress={() => restorePurchases()}
        />
      </View>

      {/* Only Google Play can cancel a subscription or change its payment
          method — an in-app "Cancel" button would be a lie. Shown only
          for an actual store-backed subscription: there is nothing to
          manage for a free user or a lifetime purchase. */}
      {Platform.OS === 'android' &&
        snapshot.store === 'google_play' &&
        snapshot.tier !== 'premium_lifetime' &&
        snapshot.tier !== 'free' && (
          <Pressable
            onPress={() => openManageSubscription()}
            style={({ pressed }) => [
              styles.manageRow,
              pressed && styles.pressed,
            ]}>
            <ExternalLink size={14} color={colors.primary} />
            <Text style={[styles.manageText, { color: colors.primary }]}>
              Manage or cancel in Google Play
            </Text>
          </Pressable>
        )}
    </Card>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <Text style={[styles.detailValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function SecondaryButton({
  icon: Icon,
  label,
  disabled,
  onPress,
}: {
  icon: typeof RefreshCw;
  label: string;
  disabled: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        { borderColor: colors.border },
        (pressed || disabled) && styles.pressed,
      ]}>
      <Icon size={14} color={colors.text} />
      <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
  },
  resolvingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  crownBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  planName: {
    fontSize: scaleFont(15.5),
    fontWeight: '700',
  },
  statusLine: {
    fontSize: scaleFont(12),
    lineHeight: scaleFont(17),
    marginTop: 2,
  },
  statusPill: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPillText: {
    fontSize: scaleFont(9.5),
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
  },
  warningText: {
    flex: 1,
    fontSize: scaleFont(12.5),
    lineHeight: scaleFont(18),
    fontWeight: '600',
  },
  detailBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 14,
    paddingTop: 12,
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  detailLabel: {
    fontSize: scaleFont(12.5),
    flexShrink: 1,
  },
  detailValue: {
    fontSize: scaleFont(12.5),
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },
  primaryButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  primaryButtonText: {
    fontSize: scaleFont(14),
    fontWeight: '700',
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  secondaryButtonText: {
    fontSize: scaleFont(12.5),
    fontWeight: '600',
  },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
  },
  manageText: {
    fontSize: scaleFont(13),
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.6,
  },
});

export default SubscriptionCard;
