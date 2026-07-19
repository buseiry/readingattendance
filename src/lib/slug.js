// School -> leaderboard doc-id slug. MUST stay in sync with slugifySchool() in
// functions/index.js, so the client reads the same doc the server writes.
export function slugifySchool(school) {
  if (!school) return 'unknown';
  const head = school.split('—')[0].trim() || school;
  return (
    head
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'unknown'
  );
}
