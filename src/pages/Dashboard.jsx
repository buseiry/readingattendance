// Dashboard — the landing screen after login/onboarding.
// In Phase 1 it's intentionally sparse: a greeting, the email-verification
// gate, and placeholders for stats that Phases 2 & 4 will fill in.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ROUTES } from '../lib/constants';
import { Button, Card, EmptyState } from '../components/ui';

// A banner shown until the user verifies their email. Reading sessions stay
// locked until then (enforced properly in Phase 2). Google users skip this
// because Google has already verified their email.
function VerifyEmailBanner() {
  const { resendVerification, reloadUser } = useAuth();
  const [status, setStatus] = useState(''); // '', 'sent', 'checking', 'still-unverified'
  const [busy, setBusy] = useState(false);

  async function handleResend() {
    setBusy(true);
    try {
      await resendVerification();
      setStatus('sent');
    } finally {
      setBusy(false);
    }
  }

  async function handleCheck() {
    setBusy(true);
    setStatus('checking');
    try {
      await reloadUser();
      // If still unverified after reload, the banner stays and we say so.
      setStatus('still-unverified');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="status"
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <p className="font-semibold">Verify your email to start reading sessions.</p>
      <p className="mt-1 text-amber-800">
        We sent a link to your inbox. Click it, then come back and tap “I’ve verified”.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={handleCheck} busy={busy}>
          I’ve verified
        </Button>
        <Button variant="ghost" onClick={handleResend} busy={busy}>
          Resend email
        </Button>
      </div>
      {status === 'sent' && <p className="mt-2 text-amber-800">Sent! Check your inbox (and spam).</p>}
      {status === 'still-unverified' && (
        <p className="mt-2 text-amber-800">Not verified yet — click the link in your email first.</p>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user, profile, emailVerified } = useAuth();

  // Prefer the display name; fall back to the part before "@" in the email.
  const name = profile?.displayName || user?.email?.split('@')[0] || 'reader';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hi {name} 👋</h1>
        <p className="text-slate-600">
          {profile?.school ? `Reading for ${profile.school.split(' — ')[0]}.` : 'Ready to read?'}
        </p>
      </div>

      {!emailVerified && <VerifyEmailBanner />}

      {/* Stats placeholders — real numbers land in Phase 4. */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">Total time</p>
          <p className="text-2xl font-bold">0h 0m</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Current streak</p>
          <p className="text-2xl font-bold">0 days</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Sessions</p>
          <p className="text-2xl font-bold">0</p>
        </Card>
      </div>

      <EmptyState
        emoji="📚"
        title="No sessions yet"
        action={
          emailVerified ? (
            <Link to={ROUTES.SESSION}>
              <Button>Start your first session</Button>
            </Link>
          ) : (
            <Button disabled title="Verify your email first">
              Verify your email to start
            </Button>
          )
        }
      >
        Your reading time and streak will show up here once you finish your first session.
      </EmptyState>
    </div>
  );
}
