import React, {
  createContext,
  useContext,
  useMemo,
  useState,
} from 'react';
import { HARDCODED_ENTITLEMENT } from '../config/entitlements';

export type EntitlementTier = 'free' | 'premium';

type EntitlementContextValue = {
  tier: EntitlementTier;
  isPremium: boolean;
  // Dev-only escape hatch — see setDevTier below for why this can never
  // do anything in a production build.
  setDevTier: (tier: EntitlementTier) => void;
};

const EntitlementContext = createContext<EntitlementContextValue | null>(
  null,
);

type EntitlementProviderProps = {
  children: React.ReactNode;
};

// Wraps the app once, near the root (see App.tsx). Real state only
// exists here in __DEV__ builds; a production build's `tier` always
// resolves to HARDCODED_ENTITLEMENT and setDevTier is a no-op, so there
// is no code path — not even a stray dev tool left enabled — that can
// make a shipped build report itself as premium.
//
// Written with React.createElement instead of JSX so this file can stay
// a plain .ts file (JSX syntax requires .tsx).
export function EntitlementProvider({
  children,
}: EntitlementProviderProps): React.JSX.Element {
  const [devTier, setDevTierState] = useState<EntitlementTier>(
    HARDCODED_ENTITLEMENT,
  );

  const value = useMemo<EntitlementContextValue>(() => {
    const tier = __DEV__ ? devTier : HARDCODED_ENTITLEMENT;
    return {
      tier,
      isPremium: tier === 'premium',
      setDevTier: next => {
        if (__DEV__) {
          setDevTierState(next);
        }
      },
    };
  }, [devTier]);

  return React.createElement(
    EntitlementContext.Provider,
    { value },
    children,
  );
}

// Stable shape on purpose: when Stage 19 replaces the hardcoded value
// with a real stored-token check, this return type doesn't change, so
// nothing consuming it (PremiumGate, AccountsScreen, etc.) needs to.
export function useEntitlement(): {
  tier: EntitlementTier;
  isPremium: boolean;
} {
  const context = useContext(EntitlementContext);
  if (!context) {
    throw new Error(
      'useEntitlement must be used within an EntitlementProvider',
    );
  }
  return { tier: context.tier, isPremium: context.isPremium };
}

// Separate from useEntitlement so ordinary call sites never see the
// setter even exists. Returns null outside __DEV__ (and if the provider
// is somehow missing) so callers can just render nothing rather than
// needing their own __DEV__ check.
export function useDevEntitlementToggle(): {
  tier: EntitlementTier;
  setDevTier: (tier: EntitlementTier) => void;
} | null {
  const context = useContext(EntitlementContext);
  if (!context || !__DEV__) {
    return null;
  }
  return { tier: context.tier, setDevTier: context.setDevTier };
}
