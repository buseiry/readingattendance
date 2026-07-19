// Rank badges by total hours read. We show the highest tier a reader has
// reached. Kept simple and encouraging.
export const BADGES = [
  { name: 'Seedling', emoji: '🌱', minHours: 0 },
  { name: 'Reader', emoji: '📖', minHours: 5 },
  { name: 'Bookworm', emoji: '🐛', minHours: 20 },
  { name: 'Scholar', emoji: '🎓', minHours: 50 },
  { name: 'Sage', emoji: '🦉', minHours: 100 },
];

export function badgeForMinutes(totalMinutes) {
  const hours = (totalMinutes || 0) / 60;
  let current = BADGES[0];
  for (const b of BADGES) if (hours >= b.minHours) current = b;
  return current;
}
