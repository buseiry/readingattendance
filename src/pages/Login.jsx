// Login page: Google sign-in first (least friction), then email/password.
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { friendlyAuthError } from '../lib/authErrors';
import { ROUTES } from '../lib/constants';
import { Button, Card, Field, ErrorMessage } from '../components/ui';

export default function Login() {
  const { user, login, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Where to go after a successful login: back where they came from, or dashboard.
  const dest = location.state?.from?.pathname || ROUTES.DASHBOARD;

  // Already logged in? Don't show the login form.
  if (user) return <Navigate to={dest} replace />;

  async function handleEmailLogin(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login({ email: email.trim(), password });
      navigate(dest, { replace: true });
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError('');
    setBusy(true);
    try {
      await signInWithGoogle();
      navigate(dest, { replace: true });
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 px-4 py-10">
      <div className="text-center">
        <Link to={ROUTES.HOME} className="text-lg font-bold text-accent-700">
          ReadingStreak
        </Link>
        <h1 className="mt-4 text-2xl font-bold">Welcome back</h1>
        <p className="text-slate-600">Log in to keep your streak going.</p>
      </div>

      <Card className="space-y-4">
        <Button variant="secondary" onClick={handleGoogle} busy={busy} className="w-full">
          Continue with Google
        </Button>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          or use email
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={handleEmailLogin} className="space-y-4">
          <Field
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <ErrorMessage message={error} />
          <Button type="submit" busy={busy} className="w-full">
            Log in
          </Button>
        </form>
      </Card>

      <p className="text-center text-sm text-slate-600">
        New here?{' '}
        <Link to={ROUTES.REGISTER} className="font-semibold text-accent-700 underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
