// The route map. Read it top-to-bottom as three tiers:
//
//   1. Public routes    — anyone: landing, login, register.
//   2. RequireAuth      — must be logged in: onboarding lives here.
//   3. RequireOnboarding + Layout — logged in AND onboarded: the real app,
//      wrapped in the nav shell.
//
// Route-level code splitting (React.lazy) is a Phase 5 optimisation; for now we
// import directly so the flow is easy to follow.
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { RequireAuth, RequireOnboarding } from './components/ProtectedRoute';
import Layout from './components/Layout';
import { ROUTES } from './lib/constants';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Placeholder from './pages/Placeholder';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* 1. Public */}
          <Route path={ROUTES.HOME} element={<Landing />} />
          <Route path={ROUTES.LOGIN} element={<Login />} />
          <Route path={ROUTES.REGISTER} element={<Register />} />

          {/* 2. Logged in */}
          <Route element={<RequireAuth />}>
            <Route path={ROUTES.ONBOARDING} element={<Onboarding />} />

            {/* 3. Logged in + onboarded, inside the app shell */}
            <Route element={<RequireOnboarding />}>
              <Route element={<Layout />}>
                <Route path={ROUTES.DASHBOARD} element={<Dashboard />} />
                <Route
                  path={ROUTES.SESSION}
                  element={<Placeholder title="Reading session" phase="Phase 2" emoji="⏱️" />}
                />
                <Route
                  path={ROUTES.LEADERBOARD}
                  element={<Placeholder title="Leaderboards" phase="Phase 4" emoji="🏆" />}
                />
                <Route
                  path={ROUTES.PROFILE}
                  element={<Placeholder title="Your profile" phase="Phase 4" emoji="👤" />}
                />
                <Route
                  path={ROUTES.PREMIUM}
                  element={<Placeholder title="Go Premium" phase="Phase 3" emoji="⭐" />}
                />
                <Route
                  path={ROUTES.GROUPS}
                  element={<Placeholder title="Study groups" phase="Phase 4" emoji="👥" />}
                />
              </Route>
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
