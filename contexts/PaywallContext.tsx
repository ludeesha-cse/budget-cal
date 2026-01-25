import React, { createContext, useCallback, useContext, useState } from 'react';

export type PaywallRequest = {
  // What's being gated — shown in PaywallModal and useful once real
  // purchases exist for knowing what triggered the intent.
  reason: string;
  // Re-runs the original action after a successful purchase. Stored now,
  // even though nothing calls it yet (purchases are non-functional this
  // stage) — retrofitting Stage 19's real purchase flow means calling
  // this from PaywallModal's success handler, not touching every gated
  // screen again to add it.
  onPurchaseSuccess: () => void;
};

type PaywallContextValue = {
  isOpen: boolean;
  request: PaywallRequest | null;
  openPaywall: (request: PaywallRequest) => void;
  closePaywall: () => void;
};

const PaywallContext = createContext<PaywallContextValue | null>(null);

type PaywallProviderProps = {
  children: React.ReactNode;
};

// Wraps the app once, near the root (see App.tsx), alongside
// EntitlementProvider. A single global paywall — rather than each screen
// owning its own modal — is what lets it overlay whatever the user was
// doing and dismiss back to exactly that, since the underlying screen's
// own state is never touched by opening or closing this.
export function PaywallProvider({
  children,
}: PaywallProviderProps): React.JSX.Element {
  const [request, setRequest] = useState<PaywallRequest | null>(null);

  const openPaywall = useCallback((next: PaywallRequest) => {
    setRequest(next);
  }, []);

  const closePaywall = useCallback(() => {
    setRequest(null);
  }, []);

  return (
    <PaywallContext.Provider
      value={{ isOpen: request != null, request, openPaywall, closePaywall }}>
      {children}
    </PaywallContext.Provider>
  );
}

export function usePaywall(): PaywallContextValue {
  const context = useContext(PaywallContext);
  if (!context) {
    throw new Error('usePaywall must be used within a PaywallProvider');
  }
  return context;
}
