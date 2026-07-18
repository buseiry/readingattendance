// Small formatting helpers, shared across screens.

// Seconds -> "MM:SS" for the live timer (minutes can go past 60, e.g. "182:04").
export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

// Minutes -> friendly "2h 14m" / "45m", the warm phrasing the brief asks for.
export function formatMinutes(totalMinutes) {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
}
