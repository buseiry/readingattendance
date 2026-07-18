// Firebase initialisation — MODULAR SDK ONLY.
//
// We never import from 'firebase/compat/*'. The whole app uses the tree-shakeable
// modular API (e.g. `import { getAuth } from 'firebase/auth'`). Mixing the two
// SDKs was one of the bugs in the old version; we don't repeat it.
//
// All config comes from Vite env vars (VITE_*). See .env.example.

import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

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
export const db = getFirestore(app);

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
  // eslint-disable-next-line no-console
  console.info('[ReadingStreak] Connected to Firebase emulators.');
}
