// Route guards, built on react-router's <Outlet /> nesting.
//
// RequireAuth       — must be logged in, else go to /login.
// RequireOnboarding — must have finished onboarding, else go to /onboarding.
//
// We keep them tiny and composable: routes nest inside whichever guards they
// need (see App.jsx).

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { FullPageSpinner } from './Spinner';
import { ROUTES } from '../lib/constants';

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Wait for the initial auth check so we don't bounce a logged-in user to
  // /login for a split second on refresh.
  if (loading) return <FullPageSpinner label="Checking your session" />;

  if (!user) {
    // Remember where they were headed so we can send them back after login.
    return <Navigate to={ROUTES.LOGIN} replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export function RequireOnboarding() {
  const { onboardingComplete, loading } = useAuth();

  if (loading) return <FullPageSpinner label="Loading your profile" />;

  if (!onboardingComplete) {
    return <Navigate to={ROUTES.ONBOARDING} replace />;
  }

  return <Outlet />;
}
