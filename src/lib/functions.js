// Thin wrappers around our callable Cloud Functions, so components call
// startReadingSession(...) instead of wiring httpsCallable everywhere.
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

const _startSession = httpsCallable(functions, 'startSession');
const _endSession = httpsCallable(functions, 'endSession');
const _verifyPayment = httpsCallable(functions, 'verifyPayment');

// Returns { sessionId }.
export async function startReadingSession(bookTitle = '') {
  const res = await _startSession({ bookTitle });
  return res.data;
}

// Returns { qualifies, verifiedMinutes, cappedMinutes, wallClockSeconds, ... }.
export async function endReadingSession(sessionId, clientActiveSeconds) {
  const res = await _endSession({ sessionId, clientActiveSeconds });
  return res.data;
}

// Confirms a Paystack payment server-side and unlocks premium.
// Safe to call again with the same reference (idempotent) — this doubles as the
// "I paid but it didn't unlock" recovery path. Returns { premium, alreadyRedeemed }.
export async function verifyPayment(reference) {
  const res = await _verifyPayment({ reference });
  return res.data;
}
