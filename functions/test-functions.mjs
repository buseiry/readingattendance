// Integration/unit tests for the crediting logic, run against the Firestore
// emulator. Proves the anti-cheat ceiling and caps actually hold.
//
// Run with the emulator up:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-reading-streak \
//     node test-functions.mjs
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.GCLOUD_PROJECT ||= 'demo-reading-streak';
process.env.GOOGLE_CLOUD_PROJECT ||= 'demo-reading-streak';

const { computeCredit, lagosDateString, runAbandonSweep } = await import('./index.js');
const { getFirestore, Timestamp } = await import('firebase-admin/firestore');
const db = getFirestore();

let failures = 0;
function check(cond, msg) {
  console.log(cond ? `  ✅ ${msg}` : `  ❌ ${msg}`);
  if (!cond) failures++;
}
const ts = (secondsFromNow) => ({ seconds: Math.floor(Date.now() / 1000) + secondsFromNow });

console.log('\ncomputeCredit (pure ceiling/caps):');
{
  // client 20m, wall 30m -> ceiling doesn't bite, 20m counts
  let r = computeCredit({ activeSeconds: 1200, startTime: ts(-1800), endTime: ts(0), user: {} });
  check(r.creditedMinutes === 20 && r.qualifies, 'client<wall: 20 min credited');

  // client claims a huge number, wall is 30m -> capped at 30 (the ceiling)
  r = computeCredit({ activeSeconds: 999999, startTime: ts(-1800), endTime: ts(0), user: {} });
  check(r.creditedMinutes === 30, 'tampered client capped to wall-clock (30 min)');

  // wall is 6 hours -> per-session max 180
  r = computeCredit({ activeSeconds: 999999, startTime: ts(-21600), endTime: ts(0), user: {} });
  check(r.cappedMinutes === 180, 'per-session max caps at 180 min');

  // 8 minutes -> below the 10-min minimum, doesn't count
  r = computeCredit({ activeSeconds: 480, startTime: ts(-600), endTime: ts(0), user: {} });
  check(r.creditedMinutes === 0 && !r.qualifies, 'under 10 min does not count');

  // daily cap: already 475 today -> only 5 more allowed
  const today = lagosDateString(new Date());
  r = computeCredit({
    activeSeconds: 1200,
    startTime: ts(-1800),
    endTime: ts(0),
    user: { dailyMinutes: 475, dailyDate: today },
  });
  check(r.creditedMinutes === 5, 'daily cap limits credit to remaining 5 min');
}

console.log('\nlagosDateString (WAT = UTC+1):');
{
  const d = new Date('2026-01-01T23:30:00Z'); // 00:30 next day in Lagos
  check(lagosDateString(d) === '2026-01-02', 'shifts across midnight into Lagos day');
}

console.log('\nrunAbandonSweep (DB): credits up to last heartbeat, idempotent:');
{
  const uid = 'test-abandon-user';
  const userRef = db.collection('users').doc(uid);
  await userRef.set({
    totalMinutes: 0, weeklyMinutes: 0, dailyMinutes: 0, dailyDate: '',
    sessionsCompleted: 0, activeSession: true, activeSessionId: 's-abandon',
  });
  const sRef = db.collection('sessions').doc('s-abandon');
  await sRef.set({
    userId: uid,
    startTime: Timestamp.fromMillis(Date.now() - 25 * 60 * 1000), // 25 min ago
    lastHeartbeat: Timestamp.fromMillis(Date.now() - 15 * 60 * 1000), // 15 min ago (stale)
    activeSeconds: 900, // client says 15 min
    status: 'active',
  });

  const res = await runAbandonSweep();
  check(res.swept >= 1, 'sweep found the stale session');

  const s = (await sRef.get()).data();
  const u = (await userRef.get()).data();
  // endTime = lastHeartbeat, so wall = 25-15 = 10 min; active=15 min; min=10 min.
  check(s.status === 'abandoned', 'session marked abandoned');
  check(s.verifiedMinutes === 10, 'credited only up to last heartbeat (10 min)');
  check(u.totalMinutes === 10, 'user totalMinutes credited 10');
  check(u.activeSession === false && u.activeSessionId === '', 'user active flags cleared');

  // Run again — must not double-credit.
  await runAbandonSweep();
  const u2 = (await userRef.get()).data();
  check(u2.totalMinutes === 10, 'idempotent: not credited twice');
}

console.log(`\n${failures === 0 ? '🎉 ALL FUNCTION TESTS PASSED' : `❌ ${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
