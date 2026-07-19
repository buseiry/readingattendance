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

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import crypto from 'node:crypto';

initializeApp();
const db = getFirestore();

// Premium price in kobo (₦1,000). Paystack works in the smallest currency unit.
const PREMIUM_AMOUNT_KOBO = 100000;

// A day "counts" toward a streak once the user logs this many verified minutes.
const STREAK_MIN_MINUTES = 20;
// How many entries each leaderboard holds.
const LEADERBOARD_SIZE = 100;
// How many users we scan when rebuilding leaderboards (cheap at this scale).
const LEADERBOARD_SCAN = 1000;

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

// Add (or subtract) whole days from a "YYYY-MM-DD" string. Used for streak
// "was yesterday?" checks. Works on the UTC calendar of the date string, which
// is fine because our date strings are already Lagos-local.
export function addDaysToDateStr(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// A stable, doc-id-safe slug for a school leaderboard. Uses the short code
// before the em dash (e.g. "LASUSTECH — ..." -> "lasustech"); otherwise
// slugifies the whole name. Client and server must agree — see src/lib/slug.js.
export function slugifySchool(school) {
  if (!school) return 'unknown';
  const head = school.split('—')[0].trim() || school;
  return (
    head
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'unknown'
  );
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

// Pure streak update. Given the user's current streak state, today's Lagos
// date, and today's running verified-minute total, returns the new streak
// fields. A day counts once it reaches STREAK_MIN_MINUTES.
export function computeStreakUpdate(user, today, newDailyTotal) {
  let currentStreak = user.currentStreak || 0;
  let longestStreak = user.longestStreak || 0;
  let lastReadDate = user.lastReadDate || '';
  if (newDailyTotal >= STREAK_MIN_MINUTES && lastReadDate !== today) {
    const yesterday = addDaysToDateStr(today, -1);
    currentStreak = lastReadDate === yesterday ? currentStreak + 1 : 1;
    longestStreak = Math.max(longestStreak, currentStreak);
    lastReadDate = today;
  }
  return { currentStreak, longestStreak, lastReadDate };
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

    // Compute the day's running total explicitly (we need the resulting value
    // for the streak check, so we can't rely on FieldValue.increment here).
    const dailySoFar = user.dailyDate === today ? user.dailyMinutes || 0 : 0;
    const newDailyTotal = dailySoFar + creditedMinutes;

    // Streak: the first time a user crosses 20 verified minutes in a Lagos day,
    // extend (or restart) their streak. lastReadDate marks the last counted day.
    const { currentStreak, longestStreak, lastReadDate } = computeStreakUpdate(
      user,
      today,
      newDailyTotal,
    );

    tx.set(
      userRef,
      {
        totalMinutes: FieldValue.increment(creditedMinutes),
        weeklyMinutes: FieldValue.increment(creditedMinutes),
        dailyMinutes: newDailyTotal,
        dailyDate: today,
        sessionsCompleted: FieldValue.increment(qualifies ? 1 : 0),
        currentStreak,
        longestStreak,
        lastReadDate,
        activeSession: false,
        activeSessionId: '',
        lastSessionEndAt: endTime,
        lastActive: endTime,
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

// ===========================================================================
// PAYMENTS (Paystack)
// ===========================================================================
//
// Trust boundary again: premium is granted ONLY after the server confirms a
// real, successful ₦1,000 payment with Paystack, and each reference can be
// redeemed once. The client can call these, but it cannot set isPremium itself
// (the security rules forbid it).

// When does a purchased premium expire? Configurable via the SEMESTER_END env
// var (e.g. "2026-09-30"). If that date is unset or already past, we fall back
// to 120 days from purchase so a late payer isn't short-changed.
export function computePremiumExpiry(now = new Date()) {
  const cfg = process.env.SEMESTER_END;
  if (cfg) {
    const end = new Date(`${cfg}T23:59:59+01:00`); // end of day, West Africa Time
    if (!Number.isNaN(end.getTime()) && end > now) return end;
  }
  return new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000);
}

// Is a Paystack "verify" data payload a valid premium purchase?
export function evaluateVerification(data) {
  if (!data) return { ok: false, reason: 'No payment data.' };
  if (data.status !== 'success') return { ok: false, reason: 'Payment was not successful.' };
  if (data.amount !== PREMIUM_AMOUNT_KOBO) return { ok: false, reason: 'Wrong payment amount.' };
  if ((data.currency || 'NGN') !== 'NGN') return { ok: false, reason: 'Wrong currency.' };
  return { ok: true };
}

// Grants premium for a verified transaction, once. Idempotent on `reference`.
// Also guards against one user redeeming another user's reference by requiring
// the paying email to match the account email.
export async function grantPremium({ uid, email, reference, data }) {
  const paymentRef = db.collection('payments').doc(reference);
  const userRef = db.collection('users').doc(uid);

  return db.runTransaction(async (tx) => {
    const existing = await tx.get(paymentRef);
    if (existing.exists && existing.data().status === 'success') {
      return { granted: false, alreadyRedeemed: true };
    }

    // The email on the transaction must match the account claiming it.
    const payerEmail = (data.customer?.email || data.email || '').toLowerCase();
    if (email && payerEmail && payerEmail !== email.toLowerCase()) {
      throw new HttpsError('permission-denied', 'This payment belongs to a different account.');
    }

    const now = new Date();
    const expiry = Timestamp.fromDate(computePremiumExpiry(now));

    tx.set(paymentRef, {
      userId: uid,
      email: payerEmail || email || '',
      amount: data.amount,
      currency: data.currency || 'NGN',
      status: 'success',
      paystackData: data,
      verifiedAt: FieldValue.serverTimestamp(),
    });
    tx.set(
      userRef,
      { isPremium: true, paystackRef: reference, premiumExpiresAt: expiry },
      { merge: true },
    );

    return { granted: true, alreadyRedeemed: false, expiresAt: expiry };
  });
}

// Validates a Paystack webhook signature (HMAC-SHA512 of the raw body).
export function verifyPaystackSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const hash = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  // Constant-time compare to avoid timing leaks.
  const a = Buffer.from(hash);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Calls Paystack to verify a transaction by reference. Kept tiny and separate
// so the surrounding logic (evaluate + grant) can be tested without the network.
async function fetchPaystackVerification(reference, secret) {
  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const json = await res.json();
  if (!json.status) throw new HttpsError('unavailable', 'Could not verify with Paystack.');
  return json.data;
}

// --- Callable: verify a payment the client just made ------------------------
// Also serves as the "I paid but it didn't unlock" recovery path — calling it
// again with the same reference is safe (idempotent).
export const verifyPayment = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Please log in.');

  const reference = String(request.data?.reference || '').trim();
  if (!reference) throw new HttpsError('invalid-argument', 'Missing payment reference.');

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new HttpsError('failed-precondition', 'Payments are not configured yet.');

  const data = await fetchPaystackVerification(reference, secret);
  const verdict = evaluateVerification(data);
  if (!verdict.ok) throw new HttpsError('failed-precondition', verdict.reason);

  const result = await grantPremium({
    uid,
    email: request.auth.token.email,
    reference,
    data,
  });
  return { premium: true, alreadyRedeemed: result.alreadyRedeemed };
});

// --- Webhook: Paystack's server-to-server confirmation ----------------------
// The safety net for when a user closes the tab before the callback runs.
export const paystackWebhook = onRequest(async (req, res) => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const signature = req.headers['x-paystack-signature'];

  // req.rawBody is the exact bytes Paystack signed — use it, not the parsed body.
  if (!verifyPaystackSignature(req.rawBody, signature, secret)) {
    res.status(401).send('Invalid signature');
    return;
  }

  const event = req.body;
  if (event?.event === 'charge.success') {
    const data = event.data;
    const verdict = evaluateVerification(data);
    if (verdict.ok) {
      const email = (data.customer?.email || data.email || '').toLowerCase();
      const uid = await findUidByEmail(email);
      if (uid) {
        await grantPremium({ uid, email, reference: data.reference, data });
      }
    }
  }
  // Always 200 so Paystack doesn't keep retrying a handled event.
  res.status(200).send('ok');
});

async function findUidByEmail(email) {
  if (!email) return null;
  const snap = await db.collection('users').where('email', '==', email).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

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

// ===========================================================================
// STREAKS & RETENTION (scheduled, Africa/Lagos)
// ===========================================================================

// Break the streak of anyone who didn't read yesterday. Streaks are EXTENDED
// live in finalizeSession; this nightly job only handles the "missed a day"
// case, which the client can't trigger on its own. Runs at 00:05 Lagos time
// (just after midnight) so "yesterday" is a full, finished day.
export const updateStreaks = onSchedule(
  { schedule: '5 0 * * *', timeZone: 'Africa/Lagos' },
  async () => {
    await runStreakMaintenance();
  },
);

export async function runStreakMaintenance(now = new Date()) {
  const today = lagosDateString(now);
  const yesterday = addDaysToDateStr(today, -1);

  // Only users with a live streak can lose one.
  const snap = await db.collection('users').where('currentStreak', '>', 0).get();
  let broken = 0;
  const batch = db.batch();
  for (const doc of snap.docs) {
    const last = doc.data().lastReadDate || '';
    // If their last counted day is before yesterday, they missed a day.
    if (last < yesterday) {
      batch.update(doc.ref, { currentStreak: 0 });
      broken += 1;
    }
  }
  if (broken > 0) await batch.commit();
  return { broken };
}

// Reset weekly minutes every Monday at 00:00 Lagos time so newcomers can still
// win the weekly board.
export const resetWeeklyMinutes = onSchedule(
  { schedule: '0 0 * * 1', timeZone: 'Africa/Lagos' },
  async () => {
    await runWeeklyReset();
  },
);

export async function runWeeklyReset() {
  const snap = await db.collection('users').where('weeklyMinutes', '>', 0).get();
  let reset = 0;
  // Batch in chunks of 400 (Firestore batch limit is 500).
  let batch = db.batch();
  for (const doc of snap.docs) {
    batch.update(doc.ref, { weeklyMinutes: 0 });
    reset += 1;
    if (reset % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (reset % 400 !== 0) await batch.commit();
  return { reset };
}

// ===========================================================================
// LEADERBOARDS (precomputed — clients never scan the users collection)
// ===========================================================================

function toEntry(doc) {
  const u = doc.data();
  return {
    uid: doc.id,
    displayName: u.displayName || 'Reader',
    school: u.school || '',
    totalMinutes: u.totalMinutes || 0,
    weeklyMinutes: u.weeklyMinutes || 0,
    isPremium: !!u.isPremium,
  };
}

// Rebuilt on a schedule into leaderboards/{global|weekly|<schoolSlug>}. Reading
// these is a single cheap doc read for the client, instead of an orderBy scan
// across every user.
export const rebuildLeaderboards = onSchedule('every 15 minutes', async () => {
  await runRebuildLeaderboards();
});

export async function runRebuildLeaderboards() {
  // All-time board (also feeds the per-school boards).
  const byTotal = await db
    .collection('users')
    .orderBy('totalMinutes', 'desc')
    .limit(LEADERBOARD_SCAN)
    .get();

  const global = [];
  const bySchool = new Map(); // slug -> { school, entries: [] }

  for (const doc of byTotal.docs) {
    const e = toEntry(doc);
    if (e.totalMinutes <= 0) continue;

    // Global board is premium-only.
    if (e.isPremium && global.length < LEADERBOARD_SIZE) global.push(e);

    // Per-school board (free — the free tier's hook).
    const slug = slugifySchool(e.school);
    if (!bySchool.has(slug)) bySchool.set(slug, { school: e.school, entries: [] });
    const bucket = bySchool.get(slug);
    if (bucket.entries.length < LEADERBOARD_SIZE) bucket.entries.push(e);
  }

  // Weekly board (separate ordering).
  const byWeek = await db
    .collection('users')
    .orderBy('weeklyMinutes', 'desc')
    .limit(LEADERBOARD_SIZE)
    .get();
  const weekly = byWeek.docs.map(toEntry).filter((e) => e.weeklyMinutes > 0);

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(db.collection('leaderboards').doc('global'), { entries: global, updatedAt: now });
  batch.set(db.collection('leaderboards').doc('weekly'), { entries: weekly, updatedAt: now });
  for (const [slug, { school, entries }] of bySchool) {
    batch.set(db.collection('leaderboards').doc(slug), { school, entries, updatedAt: now });
  }
  await batch.commit();

  return { global: global.length, weekly: weekly.length, schools: bySchool.size };
}

// ===========================================================================
// STUDY GROUPS (premium)
// ===========================================================================

function makeInviteCode() {
  // 6 unambiguous chars (no 0/O/1/I).
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

async function requirePremium(uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists || !snap.data().isPremium) {
    throw new HttpsError('permission-denied', 'Study groups are a premium feature.');
  }
}

export const createGroup = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Please log in.');
  await requirePremium(uid);

  const name = String(request.data?.name || '').trim().slice(0, 60);
  if (!name) throw new HttpsError('invalid-argument', 'Please give your group a name.');

  // Generate a code that isn't already in use (retry a few times).
  let inviteCode;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    inviteCode = makeInviteCode();
    const clash = await db.collection('groups').where('inviteCode', '==', inviteCode).limit(1).get();
    if (clash.empty) break;
    inviteCode = null;
  }
  if (!inviteCode) throw new HttpsError('internal', 'Could not create a group code, try again.');

  const ref = await db.collection('groups').add({
    name,
    ownerId: uid,
    inviteCode,
    memberIds: [uid],
    createdAt: FieldValue.serverTimestamp(),
  });
  return { groupId: ref.id, inviteCode };
});

export const joinGroup = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Please log in.');
  await requirePremium(uid);

  const code = String(request.data?.inviteCode || '').trim().toUpperCase();
  if (!code) throw new HttpsError('invalid-argument', 'Enter an invite code.');

  const found = await db.collection('groups').where('inviteCode', '==', code).limit(1).get();
  if (found.empty) throw new HttpsError('not-found', 'No group has that code.');

  const groupRef = found.docs[0].ref;
  await groupRef.update({ memberIds: FieldValue.arrayUnion(uid) });
  return { groupId: groupRef.id, name: found.docs[0].data().name };
});
