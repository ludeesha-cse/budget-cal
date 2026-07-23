import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { Platform } from 'react-native';
import {
  getAuth,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithCredential,
  type User as FirebaseUser,
} from '@react-native-firebase/auth';
import {
  GoogleOneTapSignIn,
  isNoSavedCredentialFoundResponse,
  isSuccessResponse,
  isCancelledResponse,
} from 'react-native-nitro-google-signin';
import {
  getStoredSession,
  clearStoredSession,
  type AuthSession,
} from '../utils/authStorage';

// Web OAuth client ID (client_type: 3) from android/app/google-services.json
// — this is deliberately the Web client, not the Android client. Google's
// Credential Manager / GoogleOneTapSignIn always exchanges tokens against
// the Web client even when the app itself is Android; passing the Android
// client ID here fails with DEVELOPER_ERROR.
//
const GOOGLE_WEB_CLIENT_ID =
  '610731283609-t1rgu2o4tnc55m073hi8dam56ss3d475.apps.googleusercontent.com';

// configure() must run exactly once before any sign-in call. Guarded with
// a module-level flag rather than calling it unconditionally on every
// AuthProvider mount, since React can mount this provider more than once
// (fast refresh, remounts) and re-configuring mid-session isn't documented
// as safe.
let googleSignInConfigured = false;
function ensureGoogleSignInConfigured(): void {
  if (googleSignInConfigured) return;
  try {
    console.log('[AuthContext] Configuring GoogleOneTapSignIn with webClientId:', GOOGLE_WEB_CLIENT_ID);
    GoogleOneTapSignIn.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
    googleSignInConfigured = true;
    console.log('[AuthContext] GoogleOneTapSignIn configured successfully');
  } catch (error) {
    console.error('[AuthContext] GoogleOneTapSignIn.configure failed:', error);
  }
}

function firebaseUserToSession(user: FirebaseUser): AuthSession {
  return { uid: user.uid, email: user.email, displayName: user.displayName };
}

type AuthContextValue = {
  session: AuthSession | null;
  isSignedIn: boolean;
  // True until the first auth state resolves (Android: first
  // onAuthStateChanged callback; iOS: the stub's first read) — lets a
  // caller avoid flashing a "signed out" state before the real answer is
  // known.
  isInitializing: boolean;
  signInWithGoogleAndroid: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Android and iOS deliberately diverge here instead of sharing one code
  // path. Android's source of truth is Firebase's own onAuthStateChanged —
  // Firebase Auth persists its session natively on-device, so there is
  // nothing else to read on launch. iOS has no sign-in implementation yet
  // (Stage 18a — Sign in with Apple + iOS Google Sign-In — hasn't been
  // built), so it falls back to the authStorage.ts stub, which always
  // reports signed-out. Do NOT collapse this into a single path: doing so
  // now would either invent an iOS session source that doesn't exist, or
  // make Android depend on a storage layer it doesn't use — a future
  // reader "simplifying" this back into one branch will break whichever
  // platform loses its real logic.
  useEffect(() => {
    if (Platform.OS === 'android') {
      ensureGoogleSignInConfigured();
      const authInstance = getAuth();
      const unsubscribe = onAuthStateChanged(authInstance, firebaseUser => {
        try {
          setSession(firebaseUser ? firebaseUserToSession(firebaseUser) : null);
        } catch (error) {
          console.error('[AuthContext] onAuthStateChanged handler failed:', error);
        } finally {
          setIsInitializing(false);
        }
      });
      return unsubscribe;
    }

    // iOS — Stage 18a stub path, not a real session source yet.
    let cancelled = false;
    (async () => {
      try {
        const stored = await getStoredSession();
        if (!cancelled) setSession(stored);
      } catch (error) {
        console.error('[AuthContext] iOS getStoredSession failed:', error);
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signInWithGoogleAndroid = useCallback(async () => {
    if (Platform.OS !== 'android') {
      console.error(
        '[AuthContext] signInWithGoogleAndroid called on a non-Android platform — iOS Google Sign-In is not implemented in this stage.',
      );
      return;
    }
    try {
      ensureGoogleSignInConfigured();
      await GoogleOneTapSignIn.checkPlayServices();
      console.log('[AuthContext] Play Services check passed, starting sign-in');

      // Cascade: try a silent/saved-credential sign-in first, then fall
      // back to progressively more interactive UI — matches the current
      // library's documented recommended flow.
      let response = await GoogleOneTapSignIn.signIn();
      console.log('[AuthContext] signIn() response type:', response.type);
      if (isNoSavedCredentialFoundResponse(response)) {
        response = await GoogleOneTapSignIn.createAccount();
        console.log('[AuthContext] createAccount() response type:', response.type);
      }
      if (isNoSavedCredentialFoundResponse(response)) {
        response = await GoogleOneTapSignIn.presentExplicitSignIn();
        console.log('[AuthContext] presentExplicitSignIn() response type:', response.type);
      }

      if (isCancelledResponse(response)) {
        // Note: Android's Credential Manager reports this same "cancelled"
        // type both for a genuine user back-out AND for a rejected request
        // (e.g. the app's SHA-1 / webClientId isn't registered as an OAuth
        // client for this Firebase project) — it does not distinguish them.
        // If this fires on every attempt, including immediately after
        // tapping an account, check the Firebase/Google Cloud OAuth client
        // config before assuming it's user behavior.
        console.warn(
          '[AuthContext] Google Sign-In returned "cancelled" — if this happens even when you pick an account, this usually means the OAuth client (SHA-1 fingerprint / webClientId) is misconfigured for this Firebase project, not an actual user cancel.',
        );
        return;
      }
      if (!isSuccessResponse(response) || !response.data?.idToken) {
        console.error('[AuthContext] Sign-in did not return a usable ID token. Full response:', JSON.stringify(response));
        throw new Error('Google Sign-In did not return a usable ID token');
      }

      console.log('[AuthContext] Got ID token, exchanging for Firebase credential');
      const credential = GoogleAuthProvider.credential(response.data.idToken);
      await signInWithCredential(getAuth(), credential);
      console.log('[AuthContext] signInWithCredential succeeded');
      // Deliberately not setting session here — the onAuthStateChanged
      // subscription above is the single source of truth for Android's
      // signed-in state, so there is only ever one place that can get it
      // out of sync with what Firebase actually thinks.
    } catch (error) {
      console.error('[AuthContext] signInWithGoogleAndroid failed:', error);
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      if (Platform.OS === 'android') {
        // Only clears the Firebase/Google session. The local SQLite
        // database is not user-scoped and has no relationship to auth
        // state at all — signing out must never read, hide, or modify
        // any transaction, balance, account, or other financial record.
        await firebaseSignOut(getAuth());
        try {
          await GoogleOneTapSignIn.signOut();
        } catch (error) {
          // Non-fatal: Firebase is already signed out by this point, so
          // the user is functionally signed out even if clearing the
          // cached Google credential state fails.
          console.error('[AuthContext] GoogleOneTapSignIn.signOut failed:', error);
        }
      } else {
        await clearStoredSession();
        setSession(null);
      }
    } catch (error) {
      console.error('[AuthContext] signOut failed:', error);
      throw error;
    }
  }, []);

  const value: AuthContextValue = {
    session,
    isSignedIn: session !== null,
    isInitializing,
    signInWithGoogleAndroid,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
