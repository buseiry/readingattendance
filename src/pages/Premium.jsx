// Premium page: shows benefits, runs Paystack checkout, and unlocks premium
// after the SERVER verifies the payment. Handles the messy real-world paths —
// cancelled, failed, network drop during verify, and "I paid but it didn't
// unlock" (the manual re-verify button).
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { verifyPayment } from '../lib/functions';
import { openCheckout, makeReference, paystackConfigured } from '../lib/paystack';
import { Button, Card, ErrorMessage } from '../components/ui';

const BENEFITS = [
  'Global leaderboard eligibility',
  'Monthly prize-draw entry',
  'Detailed reading analytics',
  'Private study groups',
  'A profile badge',
];

// Remember the last reference locally so the user can re-verify if the callback
// never ran (they closed the tab, network blipped, etc.).
const REF_KEY = 'rs:lastPaymentRef';

function formatDate(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : null;
    return d ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  } catch {
    return null;
  }
}

export default function Premium() {
  const { user, profile } = useAuth();
  const [status, setStatus] = useState('idle'); // idle | paying | verifying | cancelled
  const [error, setError] = useState('');

  const lastRef = typeof localStorage !== 'undefined' ? localStorage.getItem(REF_KEY) : null;

  // Already premium? Celebrate and show the expiry.
  if (profile?.isPremium) {
    const expiry = formatDate(profile.premiumExpiresAt);
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">You’re Premium ✨</h1>
        <Card>
          <p className="text-slate-700">
            Thanks for backing ReadingStreak. All premium features are unlocked.
          </p>
          {expiry && <p className="mt-2 text-sm text-slate-500">Your access runs until {expiry}.</p>}
        </Card>
      </div>
    );
  }

  async function runVerify(reference) {
    setStatus('verifying');
    setError('');
    try {
      await verifyPayment(reference);
      // On success the profile snapshot flips isPremium and this screen
      // re-renders into the "You're Premium" state above.
      localStorage.removeItem(REF_KEY);
    } catch (err) {
      setStatus('idle');
      setError(
        err?.message ||
          'We couldn’t confirm your payment. If you were charged, tap “Verify my payment”.',
      );
    }
  }

  async function handlePay() {
    setError('');
    setStatus('paying');
    const reference = makeReference(user.uid);
    localStorage.setItem(REF_KEY, reference);
    try {
      await openCheckout({
        email: user.email,
        reference,
        onSuccess: (ref) => runVerify(ref),
        onCancel: () => setStatus('cancelled'),
      });
    } catch {
      setStatus('idle');
      setError('We couldn’t open the payment window. Check your connection and try again.');
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Go Premium</h1>
        <p className="text-slate-600">One payment, unlocked for the semester.</p>
      </div>

      <Card className="space-y-4">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-accent-700">₦1,000</span>
          <span className="text-slate-500">one-time</span>
        </div>
        <ul className="space-y-2">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-center gap-2 text-slate-700">
              <span className="text-accent-600" aria-hidden="true">
                ✓
              </span>
              {b}
            </li>
          ))}
        </ul>

        {status === 'cancelled' && (
          <p className="text-sm text-slate-500">Payment cancelled — no charge was made.</p>
        )}
        <ErrorMessage message={error} />

        {paystackConfigured ? (
          <Button
            onClick={handlePay}
            busy={status === 'paying' || status === 'verifying'}
            className="w-full"
          >
            {status === 'verifying' ? 'Confirming payment…' : 'Pay ₦1,000 with Paystack'}
          </Button>
        ) : (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            Payments aren’t switched on yet. Check back soon!
          </p>
        )}

        {/* Recovery path: they paid but it didn't unlock. */}
        {lastRef && paystackConfigured && (
          <button
            type="button"
            onClick={() => runVerify(lastRef)}
            className="text-sm font-medium text-accent-700 underline"
          >
            Already paid? Verify my payment
          </button>
        )}
      </Card>

      <p className="text-xs text-slate-400">
        Payments are processed securely by Paystack. We never see your card details.
      </p>
    </div>
  );
}
