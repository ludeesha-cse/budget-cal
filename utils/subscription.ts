// Pure domain logic for the subscription/entitlement model the auth
// backend writes (Firebase project penny-worth-budget-cal).
//
// Deliberately has no Firebase, React or React Native imports: every
// rule about "what does this tier mean" lives here so it can be reasoned
// about — and dry-run tested in plain Node — without a device. The
// Firebase-facing code is services/subscriptionClient.ts; the UI reads
// contexts/SubscriptionContext.tsx. Both defer to this file for meaning.

import { ENTITLEMENT_GRACE_DAYS } from '../config/entitlements';

// The exact string set the backend stores in users/{uid}.tier and mirrors
// into the Firebase Auth custom claims. Anything else on the wire is
// treated as 'free' (see normalizeBackendTier) rather than trusted — a
// value this client doesn't recognise is not something it can safely
// grant premium for.
export type BackendTier =
  | 'free'
  | 'premium_monthly'
  | 'premium_yearly'
  | 'premium_lifetime';

export type PurchaseStore = 'google_play' | 'app_store';

// Where a snapshot came from, which is what the UI needs to say something
// honest about staleness. 'claims' is the offline-capable path (decoded
// from the cached Firebase ID token, works with no network at all);
// 'firestore' is the live users/{uid} document, only present when online
// and signed in; 'none' means we have no entitlement information at all
// yet (signed out, or the very first launch before auth resolves).
export type SubscriptionSource = 'none' | 'claims' | 'firestore';

export type SubscriptionSnapshot = {
  tier: BackendTier;
  store: PurchaseStore | null;
  // Epoch milliseconds. null for 'free' and for 'premium_lifetime' —
  // lifetime has no expiry by definition, and free has nothing to expire.
  expiryDate: number | null;
  // Epoch milliseconds of the backend's last verification against the
  // store (users/{uid}.lastVerifiedAt). null when reading from claims,
  // which don't carry it.
  lastVerifiedAt: number | null;
  source: SubscriptionSource;
};

export const SIGNED_OUT_SNAPSHOT: SubscriptionSnapshot = {
  tier: 'free',
  store: null,
  expiryDate: null,
  lastVerifiedAt: null,
  source: 'none',
};

const KNOWN_TIERS: BackendTier[] = [
  'free',
  'premium_monthly',
  'premium_yearly',
  'premium_lifetime',
];

export function normalizeBackendTier(value: unknown): BackendTier {
  return KNOWN_TIERS.includes(value as BackendTier)
    ? (value as BackendTier)
    : 'free';
}

// The backend writes expiryDate as a Firestore timestamp, and mirrors it
// into custom claims as whatever JSON survives setCustomUserClaims —
// which in practice is a number (epoch ms or seconds) or an ISO string
// depending on how it was serialized. Rather than assume one shape and
// silently produce NaN for the others, accept all three and reject
// anything that doesn't parse.
export function toEpochMs(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Seconds vs milliseconds: any real expiry is far in the future of
    // 1970, so a value small enough to be a plausible *seconds* stamp
    // (< ~Sep 2001 in ms) is a seconds stamp.
    return value < 1e11 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  // Firestore Timestamp-like: { seconds, nanoseconds } or a toDate().
  if (typeof value === 'object') {
    const candidate = value as {
      seconds?: unknown;
      _seconds?: unknown;
      toDate?: () => Date;
    };
    if (typeof candidate.toDate === 'function') {
      const date = candidate.toDate();
      return date instanceof Date && !Number.isNaN(date.getTime())
        ? date.getTime()
        : null;
    }
    const seconds = candidate.seconds ?? candidate._seconds;
    if (typeof seconds === 'number' && Number.isFinite(seconds)) {
      return seconds * 1000;
    }
  }
  return null;
}

export function isPremiumTier(tier: BackendTier): boolean {
  return tier !== 'free';
}

// The single answer to "does this person get premium features right now".
//
// Lifetime never expires. A monthly/yearly tier stays entitled until its
// expiry PLUS a grace window, and the grace window is the point: a
// renewal that Google has taken payment for can take hours to show up in
// a refreshed token, and a genuinely offline device may be reading a
// token minted before the renewal happened at all. Cutting someone off at
// the exact millisecond of expiry would revoke features from a paying
// subscriber for a reason that has nothing to do with them. The daily
// reconciliation function is what eventually pushes a real lapse through
// (tier -> 'free'), and a free tier is never entitled regardless of dates.
export function isEntitled(
  snapshot: SubscriptionSnapshot,
  now: number = Date.now(),
): boolean {
  if (snapshot.tier === 'free') {
    return false;
  }
  if (snapshot.tier === 'premium_lifetime') {
    return true;
  }
  if (snapshot.expiryDate == null) {
    // A premium subscription tier with no expiry is a backend bug, not a
    // free pass. Treat it as not entitled rather than granting an
    // unbounded premium on malformed data.
    return false;
  }
  const graceMs = ENTITLEMENT_GRACE_DAYS * 24 * 60 * 60 * 1000;
  return now <= snapshot.expiryDate + graceMs;
}

// True when the subscription's own expiry has passed but the grace window
// hasn't — the UI says "renewing" rather than either "active" or
// "expired", because at this point we genuinely don't know which it is.
export function isInGracePeriod(
  snapshot: SubscriptionSnapshot,
  now: number = Date.now(),
): boolean {
  if (snapshot.tier === 'free' || snapshot.tier === 'premium_lifetime') {
    return false;
  }
  if (snapshot.expiryDate == null) {
    return false;
  }
  return now > snapshot.expiryDate && isEntitled(snapshot, now);
}

// A premium tier the grace window can no longer save. Distinct from
// "tier is free": this is the state where the stored tier still claims
// premium but the dates say otherwise, which is exactly when the app
// should tell the user to reconnect rather than silently downgrading
// them with no explanation.
export function isLapsed(
  snapshot: SubscriptionSnapshot,
  now: number = Date.now(),
): boolean {
  return isPremiumTier(snapshot.tier) && !isEntitled(snapshot, now);
}

export function planLabel(tier: BackendTier): string {
  switch (tier) {
    case 'premium_monthly':
      return 'Premium — Monthly';
    case 'premium_yearly':
      return 'Premium — Yearly';
    case 'premium_lifetime':
      return 'Premium — Lifetime';
    default:
      return 'Free';
  }
}

export type SubscriptionStatusKind =
  | 'free'
  | 'active'
  | 'lifetime'
  | 'renewing'
  | 'lapsed';

export function statusKind(
  snapshot: SubscriptionSnapshot,
  now: number = Date.now(),
): SubscriptionStatusKind {
  if (snapshot.tier === 'free') {
    return 'free';
  }
  if (snapshot.tier === 'premium_lifetime') {
    return 'lifetime';
  }
  if (isLapsed(snapshot, now)) {
    return 'lapsed';
  }
  if (isInGracePeriod(snapshot, now)) {
    return 'renewing';
  }
  return 'active';
}

export function formatSubscriptionDate(epochMs: number | null): string {
  if (epochMs == null) {
    return '—';
  }
  const date = new Date(epochMs);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  // Fixed "D Mon YYYY" rather than toLocaleDateString, for the same
  // reason utils/formatAmount.ts avoids Intl: Hermes' locale data isn't
  // guaranteed to be complete on every device this ships to.
  const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

// One sentence the Account screen can show verbatim under the plan name.
export function describeStatus(
  snapshot: SubscriptionSnapshot,
  now: number = Date.now(),
): string {
  switch (statusKind(snapshot, now)) {
    case 'lifetime':
      return 'Yours permanently — nothing to renew.';
    case 'active':
      return `Renews on ${formatSubscriptionDate(snapshot.expiryDate)}.`;
    case 'renewing':
      return `Renewal is still being confirmed with Google Play. Your premium features stay on in the meantime (until ${formatSubscriptionDate(
        (snapshot.expiryDate ?? now) +
          ENTITLEMENT_GRACE_DAYS * 24 * 60 * 60 * 1000,
      )}).`;
    case 'lapsed':
      return `This subscription ended on ${formatSubscriptionDate(
        snapshot.expiryDate,
      )}.`;
    default:
      return 'You are on the free plan.';
  }
}
