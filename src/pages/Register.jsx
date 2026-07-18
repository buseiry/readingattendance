// Register page: Google first, then email/password with a display name.
// After a successful email signup we send a verification email and move the
// user into onboarding. (Email verification is only *enforced* when they try
// to start a reading session — see the dashboard banner and Phase 2.)
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { friendlyAuthError } from '../lib/authErrors';
import { ROUTES } from '../lib/constants';
import { Button, Card, Field, ErrorMessage } from '../components/ui';

export default function Register() {
  const { user, register, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={ROUTES.ONBOARDING} replace />;

  async function handleRegister(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register({ email: email.trim(), password, displayName: displayName.trim() });
      navigate(ROUTES.ONBOARDING, { replace: true });
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
      navigate(ROUTES.ONBOARDING, { replace: true });
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
        <h1 className="mt-4 text-2xl font-bold">Create your account</h1>
        <p className="text-slate-600">It’s free. Start reading in two minutes.</p>
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

        <form onSubmit={handleRegister} className="space-y-4">
          <Field
            id="displayName"
            label="Display name"
            type="text"
            autoComplete="name"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
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
            autoComplete="new-password"
            required
            minLength={6}
            hint="At least 6 characters."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <ErrorMessage message={error} />
          <Button type="submit" busy={busy} className="w-full">
            Create account
          </Button>
        </form>
      </Card>

      <p className="text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link to={ROUTES.LOGIN} className="font-semibold text-accent-700 underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
