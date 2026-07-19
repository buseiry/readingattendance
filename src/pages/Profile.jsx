// Profile: headline stats, current rank badge, and a 90-day reading heatmap
// (GitHub-style). The heatmap is built from the user's own session docs — a
// single scoped query, allowed by the security rules (owner-read).
import { useEffect, useMemo, useState } from 'react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { formatMinutes } from '../lib/formatters';
import { badgeForMinutes } from '../lib/badges';
import { Card } from '../components/ui';

const DAY_MS = 24 * 60 * 60 * 1000;
const HEATMAP_DAYS = 90;

// Lagos-local date string (WAT = UTC+1, no DST).
function lagosDate(d) {
  return new Date(d.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Colour by minutes read that day; 20 min is the streak threshold.
function cellClass(minutes) {
  if (!minutes) return 'bg-slate-100';
  if (minutes < 20) return 'bg-accent-100';
  if (minutes < 60) return 'bg-accent-300';
  if (minutes < 120) return 'bg-accent-500';
  return 'bg-accent-700';
}

function StatCard({ label, value }) {
  return (
    <Card>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </Card>
  );
}

export default function Profile() {
  const { user, profile } = useAuth();
  const [byDay, setByDay] = useState(null); // Map<dateStr, minutes> | null

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const cutoff = Timestamp.fromMillis(Date.now() - HEATMAP_DAYS * DAY_MS);
        const snap = await getDocs(
          query(collection(db, 'sessions'), where('userId', '==', user.uid), where('endTime', '>=', cutoff)),
        );
        const map = new Map();
        snap.forEach((doc) => {
          const s = doc.data();
          if (!s.endTime || !s.verifiedMinutes) return;
          const key = lagosDate(s.endTime.toDate());
          map.set(key, (map.get(key) || 0) + s.verifiedMinutes);
        });
        if (!cancelled) setByDay(map);
      } catch {
        if (!cancelled) setByDay(new Map());
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user.uid]);

  // Build the last 90 days, padded at the front so each column is a full week.
  const days = useMemo(() => {
    const today = new Date();
    const list = [];
    for (let i = HEATMAP_DAYS - 1; i >= 0; i -= 1) {
      const d = new Date(today.getTime() - i * DAY_MS);
      const key = lagosDate(d);
      list.push({ key, minutes: byDay?.get(key) || 0 });
    }
    // Pad so the first cell lands on the top row (Sunday = 0).
    const firstDow = new Date(`${list[0].key}T00:00:00Z`).getUTCDay();
    return Array.from({ length: firstDow }, () => null).concat(list);
  }, [byDay]);

  const badge = badgeForMinutes(profile?.totalMinutes);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{profile?.displayName || 'Your profile'}</h1>
          <p className="text-slate-500">
            {profile?.school ? profile.school.split(' — ')[0] : ''}
            {profile?.level ? ` · ${profile.level}` : ''}
          </p>
        </div>
        <div className="text-right" title={`${badge.name} — ${formatMinutes(profile?.totalMinutes)} read`}>
          <div className="text-3xl" aria-hidden="true">
            {badge.emoji}
          </div>
          <div className="text-xs font-medium text-slate-500">{badge.name}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total time" value={formatMinutes(profile?.totalMinutes)} />
        <StatCard label="Current streak" value={`${profile?.currentStreak || 0}d`} />
        <StatCard label="Longest streak" value={`${profile?.longestStreak || 0}d`} />
        <StatCard label="Sessions" value={profile?.sessionsCompleted || 0} />
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Last 90 days</h2>
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <span>less</span>
            <span className="h-3 w-3 rounded-sm bg-slate-100" />
            <span className="h-3 w-3 rounded-sm bg-accent-100" />
            <span className="h-3 w-3 rounded-sm bg-accent-300" />
            <span className="h-3 w-3 rounded-sm bg-accent-500" />
            <span className="h-3 w-3 rounded-sm bg-accent-700" />
            <span>more</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div
            className="grid grid-flow-col gap-1"
            style={{ gridTemplateRows: 'repeat(7, minmax(0, 1fr))' }}
          >
            {days.map((cell, i) =>
              cell === null ? (
                <span key={`pad-${i}`} className="h-3 w-3" />
              ) : (
                <span
                  key={cell.key}
                  className={`h-3 w-3 rounded-sm ${cellClass(cell.minutes)}`}
                  title={`${cell.key}: ${formatMinutes(cell.minutes)}`}
                />
              ),
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
