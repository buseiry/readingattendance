import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

const db = admin.firestore();

function nowTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function isTimestamp(val: any) {
  return val && typeof val.toDate === 'function';
}

export const pauseSessionSimple = functions.https.onCall(async (data: any, context: functions.https.CallableContext) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  const userId = context.auth.uid;
  const { sessionId } = data;
  if (!sessionId) throw new functions.https.HttpsError('invalid-argument', 'sessionId is required');

  try {
    const sessionRef = db.collection('sessions').doc(sessionId);
    const snap = await sessionRef.get();
    if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Session not found');
    const s = snap.data() as any;

    if (s.userId !== userId) throw new functions.https.HttpsError('permission-denied', 'Session does not belong to user');
    if (s.completed || s.status === 'ended') throw new functions.https.HttpsError('failed-precondition', 'Session already ended');

    if (s.status === 'paused') return { success: true, message: 'Session already paused' };

    await sessionRef.update({
      status: 'paused',
      pausedAt: nowTimestamp(),
      lastPausedAtBy: userId
    });

    return { success: true, message: 'Session paused' };
  } catch (err: any) {
    console.error('pauseSessionSimple error:', err);
    throw new functions.https.HttpsError('internal', err?.message || 'Failed to pause session');
  }
});

export const resumeSessionSimple = functions.https.onCall(async (data: any, context: functions.https.CallableContext) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  const userId = context.auth.uid;
  const { sessionId } = data;
  if (!sessionId) throw new functions.https.HttpsError('invalid-argument', 'sessionId is required');

  try {
    const sessionRef = db.collection('sessions').doc(sessionId);
    const snap = await sessionRef.get();
    if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Session not found');
    const s = snap.data() as any;

    if (s.userId !== userId) throw new functions.https.HttpsError('permission-denied', 'Session does not belong to user');
    if (s.completed || s.status === 'ended') throw new functions.https.HttpsError('failed-precondition', 'Session already ended');
    if (s.status !== 'paused') throw new functions.https.HttpsError('failed-precondition', 'Session is not paused');

    // calculate paused duration
    let pausedAccum = s.pausedAccumMillis || 0;
    const pausedAt = s.pausedAt;
    if (!pausedAt) {
      console.warn('resumeSessionSimple: pausedAt missing, treating as zero paused duration');
    } else {
      const pausedDate = isTimestamp(pausedAt) ? pausedAt.toDate() : new Date(pausedAt);
      const delta = Date.now() - pausedDate.getTime();
      if (delta > 0) pausedAccum += delta;
    }

    await sessionRef.update({
      status: 'active',
      pausedAt: admin.firestore.FieldValue.delete(),
      pausedAccumMillis: pausedAccum,
      lastResumedAt: nowTimestamp()
    });

    return { success: true, message: 'Session resumed', pausedAccumMillis: pausedAccum };
  } catch (err: any) {
    console.error('resumeSessionSimple error:', err);
    throw new functions.https.HttpsError('internal', err?.message || 'Failed to resume session');
  }
});

export const endSessionSimple = functions.https.onCall(async (data: any, context: functions.https.CallableContext) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  const userId = context.auth.uid;
  const { sessionId } = data;
  if (!sessionId) throw new functions.https.HttpsError('invalid-argument', 'sessionId is required');

  try {
    const sessionRef = db.collection('sessions').doc(sessionId);
    const snap = await sessionRef.get();
    if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Session not found');
    const s = snap.data() as any;

    if (s.userId !== userId) throw new functions.https.HttpsError('permission-denied', 'Session does not belong to user');
    if (s.completed || s.status === 'ended') return { success: true, message: 'Session already ended' };

    // compute duration safely
    const startAt = s.startAt || s.startTime || s.createdAt;
    if (!startAt) {
      console.warn('endSessionSimple: startAt missing, using now - 0');
    }
    const startDate = isTimestamp(startAt) ? startAt.toDate() : new Date(startAt);
    const pausedAccum = s.pausedAccumMillis || 0;
    const totalMillis = Math.max(0, Date.now() - startDate.getTime() - pausedAccum);

    await sessionRef.update({
      status: 'ended',
      completed: true,
      endAt: nowTimestamp(),
      totalTimeMillis: totalMillis,
      autoEnded: false,
      autoEndReason: 'manual_end'
    });

    // update user's activeSession flag
    const userRef = db.collection('users').doc(userId);
    await userRef.update({
      activeSession: false,
      lastSessionEnd: nowTimestamp()
    });

    return { success: true, message: 'Session ended', totalTimeMillis: totalMillis };
  } catch (err: any) {
    console.error('endSessionSimple error:', err);
    throw new functions.https.HttpsError('internal', err?.message || 'Failed to end session');
  }
});
