// Reads a precomputed leaderboard doc (cheap: one document read) and works out
// the current user's own rank — even when they're outside the top 100 — with a
// single count() aggregation, never a full-collection scan on the client.
import { useEffect, useState } from 'react';
import {
  doc, getDoc, collection, query, where, getCountFromServer,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import { slugifySchool } from '../lib/slug';

// scope: 'school' | 'weekly' | 'global'
export function useLeaderboard(scope) {
  const { user, profile } = useAuth();
  const [entries, setEntries] = useState(null); // null = loading
  const [ownRank, setOwnRank] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setEntries(null);
      setOwnRank(null);
      setError('');
      try {
        const docId = scope === 'school' ? slugifySchool(profile?.school) : scope;
        const snap = await getDoc(doc(db, 'leaderboards', docId));
        const list = snap.exists() ? snap.data().entries || [] : [];
        if (cancelled) return;
        setEntries(list);

        // If we're in the list, our rank is our position.
        const idx = list.findIndex((e) => e.uid === user?.uid);
        if (idx >= 0) {
          setOwnRank(idx + 1);
          return;
        }

        // Global board is premium-only: no rank for free users.
        if (scope === 'global' && !profile?.isPremium) return;

        // Otherwise count how many people are strictly ahead of us.
        const field = scope === 'weekly' ? 'weeklyMinutes' : 'totalMinutes';
        const mine = profile?.[field] || 0;
        const filters = [where(field, '>', mine)];
        if (scope === 'global') filters.push(where('isPremium', '==', true));
        if (scope === 'school') filters.push(where('school', '==', profile?.school || ''));

        const agg = await getCountFromServer(query(collection(db, 'users'), ...filters));
        if (!cancelled) setOwnRank(agg.data().count + 1);
      } catch {
        if (!cancelled) setError('Couldn’t load the leaderboard. Pull to refresh in a moment.');
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // We depend on the specific profile fields we read, not the whole object,
    // so the board doesn't refetch on unrelated profile changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, user?.uid, profile?.school, profile?.totalMinutes, profile?.weeklyMinutes, profile?.isPremium]);

  return { entries, ownRank, error };
}
