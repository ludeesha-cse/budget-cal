import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

export interface UseDismissibleBannerResult {
  dismissed: boolean;
  dismiss: () => void;
}

// A banner the user can close, which comes back the next time they open
// the screen.
//
// WHY THIS ISN'T JUST useState: React Navigation keeps screens mounted
// when you navigate away from them, so a plain useState would make
// "dismissed" last until the app is killed — closing a note once would
// hide it for the rest of the session, including on a visit an hour
// later where it might be exactly what the user needed to see. Resetting
// on BLUR (the cleanup of useFocusEffect, i.e. the moment the screen
// stops being the one on screen) gives the intended behaviour precisely:
// closed for as long as you are looking at it, back again next time you
// come to the screen.
//
// Reset on blur rather than on focus on purpose — resetting on focus
// would also fire on the focus event that happens while the user is
// already there (returning from a modal, say), popping the banner back
// up in the middle of the same visit they just dismissed it in.
//
// Nothing is written to disk: this is a per-visit convenience, not a
// preference. A note worth suppressing permanently belongs in Settings,
// not behind an X.
export function useDismissibleBanner(): UseDismissibleBannerResult {
  const [dismissed, setDismissed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      return () => setDismissed(false);
    }, []),
  );

  const dismiss = useCallback(() => setDismissed(true), []);
  return { dismissed, dismiss };
}
