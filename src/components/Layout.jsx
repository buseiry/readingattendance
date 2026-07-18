// The shell around the signed-in app: a top nav with links + a logout button,
// and an <Outlet /> where the current page renders.
//
// Mobile-first: the nav is a simple wrapping row that stays usable at 360px.
// We'll refine navigation (e.g. a bottom tab bar) in a later design pass.

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { ROUTES } from '../lib/constants';
import { Button } from './ui';

const NAV_LINKS = [
  { to: ROUTES.DASHBOARD, label: 'Home' },
  { to: ROUTES.SESSION, label: 'Read' },
  { to: ROUTES.LEADERBOARD, label: 'Ranks' },
  { to: ROUTES.GROUPS, label: 'Groups' },
  { to: ROUTES.PROFILE, label: 'Profile' },
];

export default function Layout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      navigate(ROUTES.HOME, { replace: true });
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <NavLink to={ROUTES.DASHBOARD} className="mr-auto text-lg font-bold text-accent-700">
            ReadingStreak
          </NavLink>
          <nav className="flex flex-wrap items-center gap-1" aria-label="Main">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium ${
                    isActive ? 'bg-accent-50 text-accent-700' : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
            <Button variant="ghost" onClick={handleLogout} busy={loggingOut} className="px-3 py-2">
              Log out
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
