import React, {
  createContext,
  useContext,
  useMemo,
  useState,
} from 'react';
import { useSubscription } from '../contexts/SubscriptionContext';

// The app's feature gate, in the two values every gated screen actually
// cares about. The backend has four tiers (free, premium_monthly,
// premium_yearly, premium_lifetime) and that distinction matters for what
// the Account screen *says* — but not for what a screen is allowed to do,
// which is why this collapses to free/premium and every call site outside
// the subscription UI keeps reading exactly what it read before.
//
// Real state now comes from SubscriptionContext (custom claims + the
// users/{uid} Firestore document). This provider adds only the __DEV__
// override on top of it.
export type EntitlementTier = 'free' | 'premium';

// 'auto' follows the real entitlement. The two explicit values pin it,
// for exercising a tier you have not bought. Starting in 'auto' (rather
// than in whichever tier a constant said) means a debug build shows the
// same thing a release build would until someone deliberately changes it.
export type DevTierMode = 'auto' | 'free' | 'premium';

type EntitlementContextValue = {
  tier: EntitlementTier;
  isPremium: boolean;
  // True until the first real entitlement answer exists. Gated screens
  // can ignore this; anything that would otherwise render the words
  // "Free" or a paywall on a cold start should wait for it.
  isResolving: boolean;
  devMode: DevTierMode;
  setDevMode: (mode: DevTierMode) => void;
};

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

type EntitlementProviderProps = {
  children: React.ReactNode;
};

// Wraps the app once, inside SubscriptionProvider (see App.tsx). In a
// production build devMode is pinned to 'auto' and setDevMode is a no-op,
// so there is no code path — not even a dev tool left switched on — that
// can make a shipped build report itself as premium.
//
// Written with React.createElement instead of JSX so this file can stay a
// plain .ts file (JSX syntax requires .tsx).
export function EntitlementProvider({
  children,
}: EntitlementProviderProps): React.JSX.Element {
  const { isEntitled, isResolving } = useSubscription();
  const [devMode, setDevModeState] = useState<DevTierMode>('auto');

  const value = useMemo<EntitlementContextValue>(() => {
    const realTier: EntitlementTier = isEntitled ? 'premium' : 'free';
    const effectiveMode: DevTierMode = __DEV__ ? devMode : 'auto';
    const tier: EntitlementTier =
      effectiveMode === 'auto' ? realTier : effectiveMode;
    return {
      tier,
      isPremium: tier === 'premium',
      // An override is an answer, so nothing is still resolving under one.
      isResolving: effectiveMode === 'auto' ? isResolving : false,
      devMode: effectiveMode,
      setDevMode: next => {
        if (__DEV__) {
          setDevModeState(next);
        }
      },
    };
  }, [isEntitled, isResolving, devMode]);

  return React.createElement(
    EntitlementContext.Provider,
    { value },
    children,
  );
}

export function useEntitlement(): {
  tier: EntitlementTier;
  isPremium: boolean;
  isResolving: boolean;
} {
  const context = useContext(EntitlementContext);
  if (!context) {
    throw new Error(
      'useEntitlement must be used within an EntitlementProvider',
    );
  }
  return {
    tier: context.tier,
    isPremium: context.isPremium,
    isResolving: context.isResolving,
  };
}

// Separate from useEntitlement so ordinary call sites never see the
// setter even exists. Returns null outside __DEV__ (and if the provider
// is somehow missing) so callers can just render nothing rather than
// needing their own __DEV__ check.
export function useDevEntitlementToggle(): {
  mode: DevTierMode;
  tier: EntitlementTier;
  cycleMode: () => void;
} | null {
  const context = useContext(EntitlementContext);
  if (!context || !__DEV__) {
    return null;
  }
  const order: DevTierMode[] = ['auto', 'free', 'premium'];
  const next = order[(order.indexOf(context.devMode) + 1) % order.length];
  return {
    mode: context.devMode,
    tier: context.tier,
    cycleMode: () => context.setDevMode(next),
  };
}
