// Placeholder for Stage 18a's iOS session storage. This stage only builds
// Android sign-in (Firebase manages Android's session natively via
// onAuthStateChanged — see contexts/AuthContext.tsx), but AuthContext.tsx
// still needs an iOS-side session source so the app doesn't crash or hang
// on iOS while Stage 18a (Sign in with Apple + iOS Google Sign-In) hasn't
// been built yet. Every function here is a no-op stub that reports
// "signed out" — swap these bodies for a real react-native-keychain (or
// equivalent) implementation once Stage 18a lands, without needing to
// touch AuthContext.tsx's call sites.
export type AuthSession = {
  uid: string;
  email: string | null;
  displayName: string | null;
};

// TODO(Stage 18a): this whole file is a placeholder. Replace this warning
// (and the null/no-op bodies below) with real react-native-keychain reads
// and writes once iOS Sign in with Apple / Google is actually built.
function warnNotImplemented(op: string): void {
  console.warn(`[authStorage] ${op}: Stage 18a not implemented yet — iOS reports signed-out.`);
}

export async function getStoredSession(): Promise<AuthSession | null> {
  try {
    warnNotImplemented('getStoredSession');
    return null;
  } catch (error) {
    console.error('[authStorage] getStoredSession failed (iOS stub, not yet implemented):', error);
    return null;
  }
}

export async function setStoredSession(_session: AuthSession): Promise<void> {
  try {
    warnNotImplemented('setStoredSession');
  } catch (error) {
    console.error('[authStorage] setStoredSession failed (iOS stub, not yet implemented):', error);
  }
}

export async function clearStoredSession(): Promise<void> {
  try {
    warnNotImplemented('clearStoredSession');
  } catch (error) {
    console.error('[authStorage] clearStoredSession failed (iOS stub, not yet implemented):', error);
  }
}
