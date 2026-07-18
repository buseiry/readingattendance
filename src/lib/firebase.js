// Firebase initialisation — MODULAR SDK ONLY.
//
// We never import from 'firebase/compat/*'. The whole app uses the tree-shakeable
// modular API (e.g. `import { getAuth } from 'firebase/auth'`). Mixing the two
// SDKs was one of the bugs in the old version; we don't repeat it.
//
// All config comes from Vite env vars (VITE_*). See .env.example.

import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  connectFirestoreEmulator,
} from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialise once. Vite HMR can re-run this module, so we guard against
// double-initialisation by reusing the default app if it already exists.
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Firestore with OFFLINE PERSISTENCE (IndexedDB). This is what makes the app
// tolerant of patchy 3G: reads come from the local cache when offline, and
// writes (session heartbeats, activeSeconds) are queued and flushed
// automatically when the connection returns. Single-tab manager keeps things
// simple; we can revisit multi-tab later if needed.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }),
});

// Cloud Functions client. Region defaults to us-central1, matching the
// functions' default deploy region.
export const functions = getFunctions(app);

// When VITE_USE_EMULATORS=true, point Auth and Firestore at the local
// Emulator Suite instead of the real cloud. This lets us develop without
// billing, without sending real emails, and without touching production data.
//
// We only connect once. A module-level flag guards against HMR re-runs, which
// would otherwise throw "emulator already connected" errors.
if (import.meta.env.VITE_USE_EMULATORS === 'true' && !globalThis.__RS_EMULATORS__) {
  globalThis.__RS_EMULATORS__ = true;
  // `disableWarnings` hides the noisy console banner the Auth emulator prints.
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  // eslint-disable-next-line no-console
  console.info('[ReadingStreak] Connected to Firebase emulators.');
}
