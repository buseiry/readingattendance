// Session rules, in one place. These are the product decisions from the brief.
//
// A few of these values are ALSO enforced server-side in /functions (the client
// copy is for UX only — showing the right messages and timers). The server is
// always the real authority. Where a value must match, both files say so.

// Verified-minute rules (server-enforced in functions/index.js — keep in sync).
export const MIN_SESSION_MINUTES = 10; // shorter sessions don't count
export const MAX_SESSION_MINUTES = 180; // credit is capped here
export const DAILY_CAP_MINUTES = 480; // max verified minutes per Lagos day

// Cadence of background sync while a session runs.
export const HEARTBEAT_INTERVAL_MS = 60_000; // write lastHeartbeat every 60s
export const ACTIVE_SYNC_INTERVAL_MS = 30_000; // write activeSeconds every 30s

// Gentle, non-blocking check-ins (the option chosen for this project).
// A prompt appears at a random time in this window. If ignored, we PAUSE
// accrual (we do NOT end the session) until the reader taps to resume.
export const CHECKIN_MIN_MS = 25 * 60_000;
export const CHECKIN_MAX_MS = 40 * 60_000;
export const CHECKIN_RESPONSE_MS = 90_000; // 90s to acknowledge before pausing

// Grace-window offline resume: if the connection drops, we keep timing locally
// and can rejoin the SAME session within this window. It is deliberately
// shorter than the server's abandonment threshold so a reconnecting client
// finds its session still open.
export const GRACE_WINDOW_MS = 10 * 60_000;

// Pick a random check-in delay in the configured window.
export function nextCheckinDelay() {
  return CHECKIN_MIN_MS + Math.random() * (CHECKIN_MAX_MS - CHECKIN_MIN_MS);
}
