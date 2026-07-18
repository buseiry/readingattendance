// AuthContext — the single place that knows "who is logged in".
//
// It exposes:
//   - user            the raw Firebase Auth user (or null)
//   - profile         the user's Firestore document (or null while loading)
//   - loading         true until we've resolved the initial auth state
//   - emailVerified   convenience flag (Google users are always verified)
//   - register / login / signInWithGoogle / logout / resendVerification / reloadUser
//
// Any component can read this with the useAuth() hook instead of talking to
// Firebase directly. That keeps auth logic in one place and the rest of the
// app simple.

import { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendEmailVerification,
  updateProfile,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

const AuthContext = createContext(null);

// Creates the users/{uid} document the first time we see a user, seeded with
// the defaults from our data model. Scoring fields (totalMinutes, streaks,
// isPremium, …) start at safe zero/false values. From Phase 3 on, security
// rules will forbid the client from ever changing those fields again — only
// Cloud Functions may. Creating them here is fine.
async function ensureUserProfile(user, extra = {}) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;

  await setDoc(ref, {
    email: user.email,
    displayName: user.displayName || extra.displayName || '',
    photoURL: user.photoURL || '',
    // Onboarding fills these in. Empty string = onboarding not done yet.
    school: '',
    department: '',
    level: '',
    // Server-writable scoring fields — defaults only.
    isPremium: false,
    paystackRef: '',
    premiumExpiresAt: null,
    totalMinutes: 0,
    weeklyMinutes: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastReadDate: '',
    sessionsCompleted: 0,
    createdAt: serverTimestamp(),
  });
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  // Two separate "have we resolved this yet?" flags. We must not let route
  // guards decide anything until BOTH auth state and (for a logged-in user)
  // the profile document have loaded — otherwise they act on stale data and
  // bounce the user to the wrong screen. This is what fixes the onboarding race.
  const [authResolved, setAuthResolved] = useState(false);
  const [profileResolved, setProfileResolved] = useState(false);

  // Subscribe to auth state once, on mount.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthResolved(true);
    });
    return unsubscribe;
  }, []);

  // Whenever the user changes, live-subscribe to their profile document.
  // It's a single-document listener, so it's cheap and stays in sync when
  // onboarding (or later, a Cloud Function) updates the doc.
  useEffect(() => {
    // New user (or logout): the profile is unknown again until proven otherwise.
    setProfileResolved(false);
    setProfile(null);

    if (!user) {
      setProfileResolved(true);
      return undefined;
    }

    const ref = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setProfileResolved(true);
      },
      () => {
        // On a read error, don't hang the whole app on a spinner forever.
        setProfileResolved(true);
      },
    );
    return unsubscribe;
  }, [user]);

  // The app is "loading" until auth resolves, and — if someone is logged in —
  // until their profile has loaded too.
  const loading = !authResolved || (Boolean(user) && !profileResolved);

  async function register({ email, password, displayName }) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(cred.user, { displayName });
    }
    await ensureUserProfile(cred.user, { displayName });
    await sendEmailVerification(cred.user);
    return cred.user;
  }

  async function login({ email, password }) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  }

  async function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    await ensureUserProfile(cred.user);
    return cred.user;
  }

  async function logout() {
    await signOut(auth);
  }

  async function resendVerification() {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
    }
  }

  // After a user clicks the verification link in their email, they come back
  // to a still-"unverified" session. Calling reload() refreshes the flag.
  async function reloadUser() {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      setUser({ ...auth.currentUser });
    }
  }

  const value = {
    user,
    profile,
    loading,
    // Google sign-in accounts are verified by Google, so treat them as verified.
    emailVerified: Boolean(user?.emailVerified),
    // Onboarding is "done" once a school has been chosen.
    onboardingComplete: Boolean(profile?.school),
    register,
    login,
    signInWithGoogle,
    logout,
    resendVerification,
    reloadUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// The hook the rest of the app uses. Throwing here catches the mistake of
// using it outside the provider early, instead of a confusing null error later.
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
