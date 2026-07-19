// Phase 4 logic tests: streaks (day boundaries), streak maintenance, weekly
// reset, and leaderboard rebuild — against the Firestore emulator.
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.GCLOUD_PROJECT ||= 'demo-reading-streak';
process.env.GOOGLE_CLOUD_PROJECT ||= 'demo-reading-streak';

const {
  computeStreakUpdate, addDaysToDateStr, slugifySchool,
  runStreakMaintenance, runWeeklyReset, runRebuildLeaderboards,
} = await import('./index.js');
const { getFirestore } = await import('firebase-admin/firestore');
const db = getFirestore();

let failures = 0;
const check = (c, m) => { console.log(c ? `  ✅ ${m}` : `  ❌ ${m}`); if (!c) failures++; };

console.log('\ncomputeStreakUpdate (day boundaries):');
{
  const T = '2026-07-18';
  const yday = addDaysToDateStr(T, -1);
  check(computeStreakUpdate({}, T, 25).currentStreak === 1, 'first qualifying day → streak 1');
  check(computeStreakUpdate({ currentStreak: 3, lastReadDate: yday }, T, 25).currentStreak === 4, 'read yesterday → streak extends to 4');
  check(computeStreakUpdate({ currentStreak: 5, lastReadDate: '2026-07-10' }, T, 25).currentStreak === 1, 'gap → streak resets to 1');
  check(computeStreakUpdate({ currentStreak: 2, lastReadDate: T }, T, 40).currentStreak === 2, 'already counted today → unchanged');
  check(computeStreakUpdate({ currentStreak: 4, lastReadDate: yday }, T, 15).currentStreak === 4, 'under 20 min today → no change yet');
  check(computeStreakUpdate({ currentStreak: 1, lastReadDate: yday }, T, 25).longestStreak === 2, 'longest tracks the peak');
}

console.log('\nslugifySchool:');
{
  check(slugifySchool('LASUSTECH — Lagos State University') === 'lasustech', 'code before em dash');
  check(slugifySchool('My Cool School') === 'my-cool-school', 'plain name slugified');
}

console.log('\nrunStreakMaintenance (breaks missed streaks):');
{
  const today = '2026-07-18';
  const now = new Date(`${today}T00:05:00+01:00`);
  const yday = addDaysToDateStr(today, -1);
  await db.collection('users').doc('keep').set({ currentStreak: 5, lastReadDate: yday });
  await db.collection('users').doc('break').set({ currentStreak: 9, lastReadDate: '2026-07-14' });
  await runStreakMaintenance(now);
  check((await db.collection('users').doc('keep').get()).data().currentStreak === 5, 'read yesterday → streak kept');
  check((await db.collection('users').doc('break').get()).data().currentStreak === 0, 'missed a day → streak broken');
}

console.log('\nrunWeeklyReset:');
{
  await db.collection('users').doc('wk').set({ weeklyMinutes: 320, totalMinutes: 320 });
  await runWeeklyReset();
  const u = (await db.collection('users').doc('wk').get()).data();
  check(u.weeklyMinutes === 0 && u.totalMinutes === 320, 'weeklyMinutes reset, totalMinutes untouched');
}

console.log('\nrunRebuildLeaderboards (precompute):');
{
  // Clean slate for deterministic assertions.
  for (const id of ['lb1', 'lb2', 'lb3']) await db.collection('users').doc(id).delete().catch(() => {});
  await db.collection('users').doc('lb1').set({ displayName: 'Ada', school: 'UNILAG — x', totalMinutes: 500, weeklyMinutes: 50, isPremium: true });
  await db.collection('users').doc('lb2').set({ displayName: 'Bola', school: 'UNILAG — x', totalMinutes: 300, weeklyMinutes: 200, isPremium: false });
  await db.collection('users').doc('lb3').set({ displayName: 'Chidi', school: 'OAU — y', totalMinutes: 900, weeklyMinutes: 10, isPremium: true });

  const res = await runRebuildLeaderboards();
  check(res.global >= 2, 'global board built (premium users)');

  const global = (await db.collection('leaderboards').doc('global').get()).data();
  check(global.entries[0].uid === 'lb3' && global.entries[0].isPremium, 'global sorted by totalMinutes, premium-only (Chidi #1)');
  check(!global.entries.some((e) => e.uid === 'lb2'), 'non-premium excluded from global');

  const unilag = (await db.collection('leaderboards').doc(slugifySchool('UNILAG — x')).get()).data();
  check(unilag.entries[0].uid === 'lb1' && unilag.entries[1].uid === 'lb2', 'school board includes all + sorted');

  const weekly = (await db.collection('leaderboards').doc('weekly').get()).data();
  check(weekly.entries[0].uid === 'lb2', 'weekly sorted by weeklyMinutes (Bola #1)');
}

console.log(`\n${failures === 0 ? '🎉 ALL PHASE 4 TESTS PASSED' : `❌ ${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
