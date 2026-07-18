// useSession — the client half of the reading-session engine.
//
// Responsibilities (the server half lives in /functions):
//   - accumulate `activeSeconds` ONLY while the tab is visible and not paused
//   - sync activeSeconds + heartbeat to Firestore every 30s
//   - pause on tab-hide (Page Visibility), resume on return
//   - gentle, non-blocking check-ins: a prompt appears; tap to keep counting,
//     ignore it for 90s and accrual pauses until you tap "resume"
//   - keep the screen awake via the Wake Lock hook
//   - survive a refresh (even offline) by mirroring activeSeconds to IndexedDB
//     and rehydrating from whichever source is freshest
//
// IMPORTANT: the on-screen timer is client-derived (activeSeconds). The minutes
// that actually COUNT are decided by the Cloud Function on end/abandon, which
// caps them at the real server wall-clock. So a tampered client can make the
// on-screen number lie, but not the leaderboard.
import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import { useWakeLock } from './useWakeLock';
import { startReadingSession, endReadingSession } from '../lib/functions';
import {
  ACTIVE_SYNC_INTERVAL_MS,
  CHECKIN_RESPONSE_MS,
  nextCheckinDelay,
} from '../lib/sessionConstants';
import {
  saveLocalSession,
  loadLocalSession,
  clearLocalSession,
} from '../lib/localSessionStore';

// phase: 'idle' | 'starting' | 'active' | 'ending' | 'ended' | 'error'
export function useSession() {
  const { user, profile } = useAuth();
  const wakeLock = useWakeLock();

  const [phase, setPhase] = useState('idle');
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [pauseReason, setPauseReason] = useState(null); // null | 'hidden' | 'checkin'
  const [checkinPrompt, setCheckinPrompt] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // Mutable values the interval callbacks read, kept in refs to avoid stale
  // closures (React state would be a snapshot inside setInterval).
  const secondsRef = useRef(0);
  const pausedRef = useRef(false); // is accrual currently paused?
  const sessionIdRef = useRef(null);
  const timers = useRef({ tick: null, sync: null, checkin: null, checkinResponse: null });
  const resumeAttempted = useRef(false);

  const setSeconds = useCallback((n) => {
    secondsRef.current = n;
    setActiveSeconds(n);
  }, []);

  // --- Firestore sync ---------------------------------------------------------
  const syncToFirestore = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id) return;
    try {
      // One write covers both jobs: freshest activeSeconds AND a heartbeat.
      // (Writing every 30s means heartbeats are more frequent than the 60s
      // minimum — strictly safer against false "abandoned" sweeps.)
      await updateDoc(doc(db, 'sessions', id), {
        activeSeconds: secondsRef.current,
        lastHeartbeat: serverTimestamp(),
      });
    } catch {
      // Offline? Firestore's persistent cache queues this write and flushes it
      // on reconnect. Nothing to do here.
    }
  }, []);

  // --- Timer lifecycle --------------------------------------------------------
  const clearAllTimers = useCallback(() => {
    Object.values(timers.current).forEach((t) => t && clearInterval(t));
    Object.keys(timers.current).forEach((k) => {
      timers.current[k] = null;
    });
  }, []);

  const scheduleCheckin = useCallback(() => {
    if (timers.current.checkin) clearTimeout(timers.current.checkin);
    timers.current.checkin = setTimeout(() => {
      // Gentle: show the prompt but keep counting for now.
      setCheckinPrompt(true);
      timers.current.checkinResponse = setTimeout(async () => {
        // Ignored for 90s → pause accrual (not the session) and record a miss.
        pausedRef.current = true;
        setPauseReason('checkin');
        const id = sessionIdRef.current;
        if (id) {
          try {
            await updateDoc(doc(db, 'sessions', id), { checkInsFailed: increment(1) });
          } catch {
            /* queued offline */
          }
        }
      }, CHECKIN_RESPONSE_MS);
    }, nextCheckinDelay());
  }, []);

  const startEngine = useCallback(() => {
    clearAllTimers();

    // 1-second accrual tick. Only counts while visible AND not paused.
    timers.current.tick = setInterval(() => {
      if (pausedRef.current || document.visibilityState !== 'visible') return;
      const next = secondsRef.current + 1;
      setSeconds(next);
      // Mirror to IndexedDB every 5s so a refresh recovers a fresh count.
      if (next % 5 === 0) {
        saveLocalSession({ sessionId: sessionIdRef.current, activeSeconds: next });
      }
    }, 1000);

    // Periodic Firestore sync + heartbeat.
    timers.current.sync = setInterval(syncToFirestore, ACTIVE_SYNC_INTERVAL_MS);

    scheduleCheckin();
    wakeLock.acquire();
  }, [clearAllTimers, setSeconds, syncToFirestore, scheduleCheckin, wakeLock]);

  // --- Visibility: pause when hidden, resume when back ------------------------
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        // Persist progress the moment we lose focus.
        saveLocalSession({ sessionId: sessionIdRef.current, activeSeconds: secondsRef.current });
        syncToFirestore();
        if (phase === 'active') setPauseReason((r) => r || 'hidden');
      } else if (document.visibilityState === 'visible') {
        // Only auto-resume a "hidden" pause; a check-in pause needs a tap.
        setPauseReason((r) => (r === 'hidden' ? null : r));
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [phase, syncToFirestore]);

  // Keep the accrual-paused ref in step with the reason shown in the UI.
  useEffect(() => {
    pausedRef.current = pauseReason !== null;
  }, [pauseReason]);

  // --- Public actions ---------------------------------------------------------
  const start = useCallback(
    async (bookTitle) => {
      setError('');
      setPhase('starting');
      try {
        const { sessionId } = await startReadingSession(bookTitle);
        sessionIdRef.current = sessionId;
        setSeconds(0);
        setPauseReason(null);
        await clearLocalSession();
        await saveLocalSession({ sessionId, activeSeconds: 0 });
        setPhase('active');
        startEngine();
      } catch (err) {
        setError(err?.message || 'Could not start your session. Please try again.');
        setPhase('error');
      }
    },
    [setSeconds, startEngine],
  );

  const end = useCallback(async () => {
    if (!sessionIdRef.current) return;
    setPhase('ending');
    clearAllTimers();
    await wakeLock.release();
    await syncToFirestore();
    try {
      const res = await endReadingSession(sessionIdRef.current, secondsRef.current);
      setResult(res);
      setPhase('ended');
      await clearLocalSession();
      sessionIdRef.current = null;
    } catch (err) {
      // Let the reader try again without losing their time.
      setError(err?.message || 'Could not end your session. Check your connection and retry.');
      setPhase('active');
      startEngine();
    }
  }, [clearAllTimers, wakeLock, syncToFirestore, startEngine]);

  // Reader tapped "I'm still here".
  const acknowledgeCheckin = useCallback(async () => {
    if (timers.current.checkinResponse) clearTimeout(timers.current.checkinResponse);
    setCheckinPrompt(false);
    setPauseReason((r) => (r === 'checkin' ? null : r));
    const id = sessionIdRef.current;
    if (id) {
      try {
        await updateDoc(doc(db, 'sessions', id), { checkInsPassed: increment(1) });
      } catch {
        /* queued offline */
      }
    }
    scheduleCheckin();
  }, [scheduleCheckin]);

  // --- Resume an in-progress session after a refresh --------------------------
  useEffect(() => {
    if (resumeAttempted.current) return;
    if (!user || !profile) return;
    resumeAttempted.current = true;

    const id = profile.activeSessionId;
    if (!id) return;

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'sessions', id));
        if (!snap.exists() || snap.data().status !== 'active') return;

        // Rehydrate from whichever source has the freshest count: the synced
        // doc value or the local IndexedDB mirror (which can be up to ~30s
        // ahead of the last sync, and survives offline refreshes).
        const docSeconds = snap.data().activeSeconds || 0;
        const local = await loadLocalSession();
        const localSeconds = local && local.sessionId === id ? local.activeSeconds || 0 : 0;

        sessionIdRef.current = id;
        setSeconds(Math.max(docSeconds, localSeconds));
        setPauseReason(null);
        setPhase('active');
        startEngine();
      } catch {
        // If resume fails, the reader can just start a new session.
      }
    })();
  }, [user, profile, setSeconds, startEngine]);

  // Clean up timers on unmount (does NOT end the session — the reader may be
  // navigating away briefly; the server sweep handles truly-gone sessions).
  useEffect(() => () => clearAllTimers(), [clearAllTimers]);

  return {
    phase,
    activeSeconds,
    pauseReason,
    checkinPrompt,
    result,
    error,
    start,
    end,
    acknowledgeCheckin,
    wakeLockSupported: wakeLock.supported,
  };
}
