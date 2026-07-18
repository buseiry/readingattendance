// A tiny IndexedDB store that mirrors the *current* session's accumulated
// active seconds locally, every tick.
//
// Why: Firestore's offline cache already queues our writes, but it only holds
// what was last synced (up to ~30s old). This mirror lets a page refresh —
// even while completely offline — recover the exact local count so the timer
// doesn't jump backwards. It's one small record: { sessionId, activeSeconds,
// updatedAt }.
//
// We keep the API promise-based and dead simple. If IndexedDB is unavailable
// (rare, private-mode edge cases), every call resolves harmlessly so the app
// still works — it just loses this extra layer of recovery.

const DB_NAME = 'readingstreak';
const STORE = 'activeSession';
const KEY = 'current';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  let database;
  try {
    database = await openDb();
  } catch {
    return undefined; // IndexedDB not available — degrade gracefully.
  }
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const result = fn(store);
    tx.oncomplete = () => {
      database.close();
      resolve(result?.result ?? result);
    };
    tx.onerror = () => {
      database.close();
      reject(tx.error);
    };
  });
}

export async function saveLocalSession({ sessionId, activeSeconds }) {
  try {
    await withStore('readwrite', (store) =>
      store.put({ sessionId, activeSeconds, updatedAt: Date.now() }, KEY),
    );
  } catch {
    /* ignore — mirror is best-effort */
  }
}

export async function loadLocalSession() {
  try {
    return (await withStore('readonly', (store) => store.get(KEY))) || null;
  } catch {
    return null;
  }
}

export async function clearLocalSession() {
  try {
    await withStore('readwrite', (store) => store.delete(KEY));
  } catch {
    /* ignore */
  }
}
