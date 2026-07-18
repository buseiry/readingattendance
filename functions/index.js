// ReadingStreak Cloud Functions — the server-side trust boundary.
//
// Everything that decides how many minutes a user earns lives here, NOT on the
// client. The client can be tampered with; these functions run on Google's
// servers and use the Admin SDK, which bypasses security rules. The golden rule:
//
//     verifiedMinutes = min(client-reported active seconds, server wall-clock)
//
// The client can inflate its reported active seconds, but it cannot make real
// time pass faster — so the server wall-clock is an honest ceiling. On top of
// that we enforce a per-session minimum/maximum and a per-day cap.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore();

// --- Rules (keep MIN/MAX/CAP in sync with src/lib/sessionConstants.js) -------
const MIN_SESSION_MINUTES = 10;
const MAX_SESSION_MINUTES = 180;
const DAILY_CAP_MINUTES = 480;
const COOLDOWN_SECONDS = 5 * 60; // 5 minutes between sessions
// Abandonment threshold is intentionally LONGER than the client grace window
// (10 min) so a reconnecting client finds its session still open.
const ABANDON_THRESHOLD_SECONDS = 12 * 60;

// --- Helpers -----------------------------------------------------------------

// Nigeria uses West Africa Time (UTC+1) year-round with no daylight saving,
// so the Lagos calendar day is simply the UTC day shifted by +1 hour.
// Returns "YYYY-MM-DD".
export function lagosDateString(date) {
  const shifted = new Date(date.getTime() + 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

// The shared crediting maths, used by both endSession and the abandonment
// sweeper. Pure function → easy to reason about and to unit-test.
//
//   activeSeconds  – client-reported active seconds (endSession) or the doc's
//                    stored value (sweeper)
//   startTime/endTime – server Timestamps bounding the session
//   user           – current user data (for the daily cap)
// Returns { qualifies, creditedMinutes, cappedMinutes, wallClockSeconds }.
export function computeCredit({ activeSeconds, startTime, endTime, user }) {
  const wallClockSeconds = Math.max(0, endTime.seconds - startTime.seconds);
  const safeActive = Math.max(0, Math.floor(activeSeconds || 0));

  // The ceiling: you cannot earn more than real elapsed time.
  const effectiveSeconds = Math.min(safeActive, wallClockSeconds);
  const rawMinutes = Math.floor(effectiveSeconds / 60);
  const cappedMinutes = Math.min(rawMinutes, MAX_SESSION_MINUTES);

  // Sessions under the minimum simply don't count.
  const qualifies = cappedMinutes >= MIN_SESSION_MINUTES;

  // Apply the per-day cap using counters kept on the user doc.
  const today = lagosDateString(new Date(endTime.seconds * 1000));
  const dailySoFar = user.dailyDate === today ? user.dailyMinutes || 0 : 0;
  const remainingToday = Math.max(0, DAILY_CAP_MINUTES - dailySoFar);

  const creditedMinutes = qualifies ? Math.min(cappedMinutes, remainingToday) : 0;

  return { qualifies, creditedMinutes, cappedMinutes, wallClockSeconds, today };
}

// Applies a completed/abandoned session's credit to the user, transactionally.
// `status` is 'completed' (normal end) or 'abandoned' (swept).
async function finalizeSession(sessionRef, { status, activeSeconds, endTime }) {
  return db.runTransaction(async (tx) => {
    const sessionSnap = await tx.get(sessionRef);
    if (!sessionSnap.exists) throw new HttpsError('not-found', 'Session not found.');
    const session = sessionSnap.data();

    // Idempotency: never credit the same session twice (e.g. endSession racing
    // the sweeper). If it's no longer active, do nothing.
    if (session.status !== 'active') {
      return { alreadyClosed: true, verifiedMinutes: session.verifiedMinutes || 0 };
    }

    const userRef = db.collection('users').doc(session.userId);
    const userSnap = await tx.get(userRef);
    const user = userSnap.exists ? userSnap.data() : {};

    const { qualifies, creditedMinutes, cappedMinutes, wallClockSeconds, today } = computeCredit({
      activeSeconds: activeSeconds ?? session.activeSeconds,
      startTime: session.startTime,
      endTime,
      user,
    });

    tx.update(sessionRef, {
      status,
      endTime,
      verifiedMinutes: creditedMinutes,
      pointsAwarded: creditedMinutes > 0,
    });

    // Roll the daily counter over if we've crossed into a new Lagos day.
    const dailyBase = user.dailyDate === today ? FieldValue.increment(creditedMinutes) : creditedMinutes;

    tx.set(
      userRef,
      {
        totalMinutes: FieldValue.increment(creditedMinutes),
        weeklyMinutes: FieldValue.increment(creditedMinutes),
        dailyMinutes: dailyBase,
        dailyDate: today,
        sessionsCompleted: FieldValue.increment(qualifies ? 1 : 0),
        activeSession: false,
        activeSessionId: '',
        lastSessionEndAt: endTime,
        lastActive: endTime,
        ...(creditedMinutes > 0 ? { lastReadDate: today } : {}),
      },
      { merge: true },
    );

    return { qualifies, verifiedMinutes: creditedMinutes, cappedMinutes, wallClockSeconds, status };
  });
}

// --- Callable: start a session ----------------------------------------------
// Server-authoritative start. Stamping startTime here (not on the client)
// removes the forged-timestamp hole and lets us enforce cooldown + "one active
// session at a time" in a single transaction.
export const startSession = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Please log in.');
  if (request.auth.token.email_verified === false) {
    throw new HttpsError('failed-precondition', 'Please verify your email first.');
  }

  const bookTitle = String(request.data?.bookTitle || '').slice(0, 120);
  const userRef = db.collection('users').doc(uid);

  const sessionId = await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const user = userSnap.exists ? userSnap.data() : {};

    if (user.activeSession) {
      throw new HttpsError('failed-precondition', 'You already have an active session.');
    }

    // Cooldown between sessions.
    const now = Timestamp.now();
    if (user.lastSessionEndAt) {
      const since = now.seconds - user.lastSessionEndAt.seconds;
      if (since < COOLDOWN_SECONDS) {
        const wait = Math.ceil((COOLDOWN_SECONDS - since) / 60);
        throw new HttpsError(
          'failed-precondition',
          `Please wait about ${wait} more minute(s) before starting again.`,
        );
      }
    }

    const sessionRef = db.collection('sessions').doc();
    tx.set(sessionRef, {
      userId: uid,
      startTime: now,
      endTime: null,
      lastHeartbeat: now,
      activeSeconds: 0,
      verifiedMinutes: 0,
      status: 'active',
      checkInsPassed: 0,
      checkInsFailed: 0,
      bookTitle,
      pointsAwarded: false,
    });
    tx.set(
      userRef,
      { activeSession: true, activeSessionId: sessionRef.id, lastActive: now },
      { merge: true },
    );
    return sessionRef.id;
  });

  return { sessionId };
});

// --- Callable: end a session -------------------------------------------------
export const endSession = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Please log in.');

  const { sessionId, clientActiveSeconds } = request.data || {};
  if (!sessionId) throw new HttpsError('invalid-argument', 'Missing sessionId.');

  const sessionRef = db.collection('sessions').doc(String(sessionId));
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) throw new HttpsError('not-found', 'Session not found.');
  if (sessionSnap.data().userId !== uid) {
    throw new HttpsError('permission-denied', 'This session is not yours.');
  }

  const result = await finalizeSession(sessionRef, {
    status: 'completed',
    activeSeconds: clientActiveSeconds,
    endTime: Timestamp.now(),
  });

  return result;
});

// --- Scheduled: close sessions whose client went silent ----------------------
// Runs every 2 minutes. Any active session with no heartbeat past the threshold
// is credited up to its LAST heartbeat and marked abandoned.
export const sweepAbandonedSessions = onSchedule('every 2 minutes', async () => {
  await runAbandonSweep();
});

// Extracted so tests can invoke the logic directly (scheduled triggers don't
// fire on a clock in the emulator).
export async function runAbandonSweep(now = Timestamp.now()) {
  const cutoff = Timestamp.fromMillis((now.seconds - ABANDON_THRESHOLD_SECONDS) * 1000);
  const stale = await db
    .collection('sessions')
    .where('status', '==', 'active')
    .where('lastHeartbeat', '<', cutoff)
    .get();

  let swept = 0;
  for (const doc of stale.docs) {
    // Credit only up to the last heartbeat, not up to "now".
    await finalizeSession(doc.ref, {
      status: 'abandoned',
      activeSeconds: doc.data().activeSeconds,
      endTime: doc.data().lastHeartbeat,
    });
    swept += 1;
  }
  return { swept };
}

// --- Scheduled: flag implausible sessions for review -------------------------
// A light sanity check for now (expanded in a later phase). Flags any completed
// session where reported active seconds wildly exceeds the wall-clock — a sign
// of client tampering that the ceiling already neutralised, but worth flagging.
export const flagAnomalies = onSchedule('every 24 hours', async () => {
  await runAnomalyScan();
});

export async function runAnomalyScan() {
  const recent = await db
    .collection('sessions')
    .where('status', '==', 'completed')
    .orderBy('endTime', 'desc')
    .limit(200)
    .get();

  let flagged = 0;
  for (const doc of recent.docs) {
    const s = doc.data();
    if (!s.startTime || !s.endTime || s.flagged) continue;
    const wall = s.endTime.seconds - s.startTime.seconds;
    if ((s.activeSeconds || 0) > wall * 1.5 + 120) {
      await doc.ref.update({ flagged: true });
      flagged += 1;
    }
  }
  return { flagged };
}
