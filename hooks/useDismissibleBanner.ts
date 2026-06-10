import { useState } from 'react';

export interface UseDismissibleBannerResult {
  dismissed: boolean;
  dismiss: () => void;
}

// Session-only — resets to false on every fresh app launch (a plain
// useState has no persistence of its own), which is exactly what makes
// "dismissible for the session, but reappears next launch while
// anything is still pending" true without writing anything to disk.
// Dashboard's balancesHidden toggle stays as plain local screen state —
// too small on its own to be worth a matching hook.
export function useDismissibleBanner(): UseDismissibleBannerResult {
  const [dismissed, setDismissed] = useState(false);
  const dismiss = () => setDismissed(true);
  return { dismissed, dismiss };
}
