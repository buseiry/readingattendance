// Leaderboards: School (free), Weekly (free), Global (premium-only). Reads the
// precomputed doc via useLeaderboard, highlights the current user, and shows
// their own rank even when they're outside the top 100.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { formatMinutes } from '../lib/formatters';
import { ROUTES } from '../lib/constants';
import { Card, EmptyState, ErrorMessage } from '../components/ui';
import Spinner from '../components/Spinner';

const TABS = [
  { key: 'school', label: 'My School' },
  { key: 'weekly', label: 'This Week' },
  { key: 'global', label: 'Global' },
];

function Row({ rank, entry, me, weekly }) {
  const minutes = weekly ? entry.weeklyMinutes : entry.totalMinutes;
  return (
    <li
      className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
        me ? 'bg-accent-50 ring-1 ring-accent-200' : ''
      }`}
    >
      <span className="w-8 text-right font-semibold tabular-nums text-slate-500">{rank}</span>
      <span className="flex-1 truncate">
        {entry.displayName} {entry.isPremium && <span title="Premium">✨</span>}
        {me && <span className="ml-1 text-xs text-accent-700">(you)</span>}
      </span>
      <span className="font-semibold tabular-nums">{formatMinutes(minutes)}</span>
    </li>
  );
}

export default function Leaderboard() {
  const { user, profile } = useAuth();
  const [scope, setScope] = useState('school');
  const { entries, ownRank, error } = useLeaderboard(scope);
  const weekly = scope === 'weekly';

  const inTop = entries?.some((e) => e.uid === user?.uid);
  const premiumLocked = scope === 'global' && !profile?.isPremium;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Leaderboard</h1>

      <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={scope === t.key}
            onClick={() => setScope(t.key)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
              scope === t.key ? 'bg-white text-accent-700 shadow-sm' : 'text-slate-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {scope === 'school' && profile?.school && (
        <p className="text-sm text-slate-500">{profile.school.split(' — ')[0]}</p>
      )}

      <ErrorMessage message={error} />

      {premiumLocked ? (
        <EmptyState emoji="✨" title="Global board is premium">
          Go premium to compete nationwide and enter the monthly prize draw.{' '}
          <Link to={ROUTES.PREMIUM} className="font-semibold text-accent-700 underline">
            See premium
          </Link>
        </EmptyState>
      ) : entries === null ? (
        <div className="py-10">
          <Spinner label="Loading leaderboard" />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState emoji="🏁" title="No rankings yet">
          Be the first to log some reading time and claim the top spot!
        </EmptyState>
      ) : (
        <Card>
          <ol className="space-y-1">
            {entries.map((e, i) => (
              <Row key={e.uid} rank={i + 1} entry={e} me={e.uid === user?.uid} weekly={weekly} />
            ))}
          </ol>
        </Card>
      )}

      {/* Your own rank, when you're not already shown in the list above. */}
      {!premiumLocked && entries?.length > 0 && !inTop && ownRank && (
        <Card className="bg-accent-50">
          <div className="flex items-center gap-3 px-1">
            <span className="w-8 text-right font-semibold tabular-nums text-accent-700">
              {ownRank}
            </span>
            <span className="flex-1">You</span>
            <span className="font-semibold tabular-nums">
              {formatMinutes(weekly ? profile?.weeklyMinutes : profile?.totalMinutes)}
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
