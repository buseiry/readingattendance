"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.endSessionSimple = exports.resumeSessionSimple = exports.pauseSessionSimple = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
function nowTimestamp() {
    return admin.firestore.FieldValue.serverTimestamp();
}
function isTimestamp(val) {
    return val && typeof val.toDate === 'function';
}
exports.pauseSessionSimple = functions.https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    const userId = context.auth.uid;
    const { sessionId } = data;
    if (!sessionId)
        throw new functions.https.HttpsError('invalid-argument', 'sessionId is required');
    try {
        const sessionRef = db.collection('sessions').doc(sessionId);
        const snap = await sessionRef.get();
        if (!snap.exists)
            throw new functions.https.HttpsError('not-found', 'Session not found');
        const s = snap.data();
        if (s.userId !== userId)
            throw new functions.https.HttpsError('permission-denied', 'Session does not belong to user');
        if (s.completed || s.status === 'ended')
            throw new functions.https.HttpsError('failed-precondition', 'Session already ended');
        if (s.status === 'paused')
            return { success: true, message: 'Session already paused' };
        await sessionRef.update({
            status: 'paused',
            pausedAt: nowTimestamp(),
            lastPausedAtBy: userId
        });
        return { success: true, message: 'Session paused' };
    }
    catch (err) {
        console.error('pauseSessionSimple error:', err);
        throw new functions.https.HttpsError('internal', err?.message || 'Failed to pause session');
    }
});
exports.resumeSessionSimple = functions.https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    const userId = context.auth.uid;
    const { sessionId } = data;
    if (!sessionId)
        throw new functions.https.HttpsError('invalid-argument', 'sessionId is required');
    try {
        const sessionRef = db.collection('sessions').doc(sessionId);
        const snap = await sessionRef.get();
        if (!snap.exists)
            throw new functions.https.HttpsError('not-found', 'Session not found');
        const s = snap.data();
        if (s.userId !== userId)
            throw new functions.https.HttpsError('permission-denied', 'Session does not belong to user');
        if (s.completed || s.status === 'ended')
            throw new functions.https.HttpsError('failed-precondition', 'Session already ended');
        if (s.status !== 'paused')
            throw new functions.https.HttpsError('failed-precondition', 'Session is not paused');
        // calculate paused duration
        let pausedAccum = s.pausedAccumMillis || 0;
        const pausedAt = s.pausedAt;
        if (!pausedAt) {
            console.warn('resumeSessionSimple: pausedAt missing, treating as zero paused duration');
        }
        else {
            const pausedDate = isTimestamp(pausedAt) ? pausedAt.toDate() : new Date(pausedAt);
            const delta = Date.now() - pausedDate.getTime();
            if (delta > 0)
                pausedAccum += delta;
        }
        await sessionRef.update({
            status: 'active',
            pausedAt: admin.firestore.FieldValue.delete(),
            pausedAccumMillis: pausedAccum,
            lastResumedAt: nowTimestamp()
        });
        return { success: true, message: 'Session resumed', pausedAccumMillis: pausedAccum };
    }
    catch (err) {
        console.error('resumeSessionSimple error:', err);
        throw new functions.https.HttpsError('internal', err?.message || 'Failed to resume session');
    }
});
exports.endSessionSimple = functions.https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    const userId = context.auth.uid;
    const { sessionId } = data;
    if (!sessionId)
        throw new functions.https.HttpsError('invalid-argument', 'sessionId is required');
    try {
        const sessionRef = db.collection('sessions').doc(sessionId);
        const snap = await sessionRef.get();
        if (!snap.exists)
            throw new functions.https.HttpsError('not-found', 'Session not found');
        const s = snap.data();
        if (s.userId !== userId)
            throw new functions.https.HttpsError('permission-denied', 'Session does not belong to user');
        if (s.completed || s.status === 'ended')
            return { success: true, message: 'Session already ended' };
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
    }
    catch (err) {
        console.error('endSessionSimple error:', err);
        throw new functions.https.HttpsError('internal', err?.message || 'Failed to end session');
    }
});
