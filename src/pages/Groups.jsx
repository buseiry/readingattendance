// Study groups (premium): create a group, share the 6-char invite code, join by
// code, and see a private leaderboard among members. Group create/join go
// through Cloud Functions (which enforce premium + manage membership); the page
// just reads groups the user belongs to.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { createGroup, joinGroup } from '../lib/functions';
import { formatMinutes } from '../lib/formatters';
import { ROUTES } from '../lib/constants';
import { Button, Card, Field, EmptyState, ErrorMessage } from '../components/ui';
import Spinner from '../components/Spinner';

// Fetches and shows a group's members ranked by total minutes.
function GroupLeaderboard({ memberIds }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const members = await Promise.all(
        memberIds.slice(0, 50).map(async (uid) => {
          const s = await getDoc(doc(db, 'users', uid));
          const u = s.exists() ? s.data() : {};
          return { uid, name: u.displayName || 'Reader', minutes: u.totalMinutes || 0 };
        }),
      );
      if (!cancelled) setRows(members.sort((a, b) => b.minutes - a.minutes));
    })();
    return () => {
      cancelled = true;
    };
  }, [memberIds]);

  if (!rows) return <Spinner label="Loading members" />;
  return (
    <ol className="space-y-1">
      {rows.map((r, i) => (
        <li key={r.uid} className="flex items-center gap-3 px-1 py-1 text-sm">
          <span className="w-6 text-right tabular-nums text-slate-400">{i + 1}</span>
          <span className="flex-1 truncate">{r.name}</span>
          <span className="font-semibold tabular-nums">{formatMinutes(r.minutes)}</span>
        </li>
      ))}
    </ol>
  );
}

function GroupCard({ group }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <p className="font-semibold">{group.name}</p>
          <p className="text-xs text-slate-500">
            {group.memberIds.length} member{group.memberIds.length === 1 ? '' : 's'} · code{' '}
            <span className="font-mono font-semibold text-slate-700">{group.inviteCode}</span>
          </p>
        </div>
        <span className="text-slate-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <GroupLeaderboard memberIds={group.memberIds} />
        </div>
      )}
    </Card>
  );
}

export default function Groups() {
  const { user, profile } = useAuth();
  const [groups, setGroups] = useState(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Live list of the groups this user belongs to.
  useEffect(() => {
    if (!user) return undefined;
    const q = query(collection(db, 'groups'), where('memberIds', 'array-contains', user.uid));
    return onSnapshot(
      q,
      (snap) => setGroups(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setGroups([]),
    );
  }, [user]);

  if (!profile?.isPremium) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Study groups</h1>
        <EmptyState emoji="👥" title="Groups are a premium feature">
          Go premium to create private study groups and compete with your friends.{' '}
          <Link to={ROUTES.PREMIUM} className="font-semibold text-accent-700 underline">
            See premium
          </Link>
        </EmptyState>
      </div>
    );
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const { inviteCode } = await createGroup(name.trim());
      setName('');
      setNotice(`Group created! Share code ${inviteCode} with friends.`);
    } catch (err) {
      setError(err?.message || 'Could not create the group.');
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const { name: joined } = await joinGroup(code.trim());
      setCode('');
      setNotice(`Joined ${joined}!`);
    } catch (err) {
      setError(err?.message || 'Could not join — check the code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Study groups</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <form onSubmit={handleCreate} className="space-y-3">
            <Field
              id="group-name"
              label="Create a group"
              placeholder="e.g. EEE 300L Grind"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Button type="submit" busy={busy} className="w-full">
              Create
            </Button>
          </form>
        </Card>
        <Card>
          <form onSubmit={handleJoin} className="space-y-3">
            <Field
              id="join-code"
              label="Join with a code"
              placeholder="ABC123"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
            />
            <Button type="submit" variant="secondary" busy={busy} className="w-full">
              Join
            </Button>
          </form>
        </Card>
      </div>

      {notice && <p className="text-sm font-medium text-accent-700">{notice}</p>}
      <ErrorMessage message={error} />

      {groups === null ? (
        <Spinner label="Loading your groups" />
      ) : groups.length === 0 ? (
        <EmptyState emoji="✨" title="No groups yet">
          Create one above and share the code, or join a friend’s group.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}
