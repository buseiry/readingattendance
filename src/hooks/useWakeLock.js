// Keeps the screen awake during a reading session, where supported.
//
// The Screen Wake Lock API isn't on every browser, and the OS drops the lock
// whenever the tab is hidden. So we (a) feature-detect and no-op gracefully,
// and (b) re-acquire the lock when the tab becomes visible again.
import { useCallback, useEffect, useRef } from 'react';

export function useWakeLock() {
  const lockRef = useRef(null);
  const wantedRef = useRef(false); // do we currently WANT the screen awake?

  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  const acquire = useCallback(async () => {
    wantedRef.current = true;
    if (!supported) return;
    try {
      lockRef.current = await navigator.wakeLock.request('screen');
    } catch {
      // e.g. battery-saver mode refuses it — that's fine, just carry on.
    }
  }, [supported]);

  const release = useCallback(async () => {
    wantedRef.current = false;
    try {
      await lockRef.current?.release();
    } catch {
      /* ignore */
    }
    lockRef.current = null;
  }, []);

  // Re-acquire after the tab returns to the foreground (the OS released it).
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && wantedRef.current) {
        acquire();
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [acquire]);

  return { acquire, release, supported };
}
