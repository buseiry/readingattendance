// Thin wrappers around our callable Cloud Functions, so components call
// startReadingSession(...) instead of wiring httpsCallable everywhere.
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

const _startSession = httpsCallable(functions, 'startSession');
const _endSession = httpsCallable(functions, 'endSession');

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
