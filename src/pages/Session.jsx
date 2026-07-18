// The reading-session screen. Dark by default (it's on-screen for hours), calm,
// minimal chrome. It renders one of four states: idle (start), active (timer +
// controls), ended (result), or a full-screen loading/error.
//
// This screen deliberately does NOT use the app's light Layout — it manages its
// own dark full-screen surface.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSession } from '../hooks/useSession';
import { formatClock, formatMinutes } from '../lib/formatters';
import { MIN_SESSION_MINUTES } from '../lib/sessionConstants';
import { ROUTES } from '../lib/constants';

function Shell({ children }) {
  // A dedicated dark surface, regardless of system theme.
  return (
    <div className="dark flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-6">{children}</div>
    </div>
  );
}

export default function Session() {
  const { emailVerified } = useAuth();
  const {
    phase,
    activeSeconds,
    pauseReason,
    checkinPrompt,
    result,
    error,
    start,
    end,
    acknowledgeCheckin,
    wakeLockSupported,
  } = useSession();
  const [bookTitle, setBookTitle] = useState('');

  // Reading sessions require a verified email (enforced again on the server).
  if (!emailVerified) {
    return (
      <Shell>
        <div className="m-auto text-center">
          <p className="text-2xl">✉️</p>
          <h1 className="mt-3 text-xl font-semibold">Verify your email first</h1>
          <p className="mt-2 text-slate-400">
            Reading sessions unlock once your email is verified.
          </p>
          <Link
            to={ROUTES.DASHBOARD}
            className="mt-6 inline-block rounded-lg bg-accent-600 px-4 py-3 font-semibold text-white"
          >
            Back to dashboard
          </Link>
        </div>
      </Shell>
    );
  }

  // --- Ended: show the result ------------------------------------------------
  if (phase === 'ended' && result) {
    const counted = result.qualifies && result.verifiedMinutes > 0;
    return (
      <Shell>
        <div className="m-auto text-center">
          <p className="text-4xl">{counted ? '🎉' : '📖'}</p>
          {counted ? (
            <>
              <h1 className="mt-4 text-2xl font-bold">Nice work!</h1>
              <p className="mt-2 text-lg text-slate-300">
                You read {formatMinutes(result.verifiedMinutes)} — and it all counts.
              </p>
            </>
          ) : (
            <>
              <h1 className="mt-4 text-2xl font-bold">Session ended</h1>
              <p className="mt-2 text-slate-300">
                That was under {MIN_SESSION_MINUTES} minutes, so it doesn’t count this time.
                Give it a proper go next round!
              </p>
            </>
          )}
          <div className="mt-8 flex flex-col gap-3">
            <Link
              to={ROUTES.DASHBOARD}
              className="rounded-lg bg-accent-600 px-4 py-3 font-semibold text-white"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  // --- Idle: start a session -------------------------------------------------
  if (phase === 'idle' || phase === 'error') {
    return (
      <Shell>
        <header className="flex items-center justify-between">
          <Link to={ROUTES.DASHBOARD} className="text-sm text-slate-400 hover:text-slate-200">
            ← Dashboard
          </Link>
        </header>
        <div className="m-auto w-full text-center">
          <h1 className="text-2xl font-bold">Ready to read?</h1>
          <p className="mt-2 text-slate-400">
            Sessions count from {MIN_SESSION_MINUTES} minutes. Keep the app open — we pause
            the timer if you switch away.
          </p>

          <label htmlFor="book" className="sr-only">
            What are you reading?
          </label>
          <input
            id="book"
            type="text"
            value={bookTitle}
            onChange={(e) => setBookTitle(e.target.value)}
            placeholder="What are you reading? (optional)"
            className="mt-6 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3
                       text-slate-100 placeholder-slate-500 focus:border-accent-500
                       focus:outline-none focus:ring-2 focus:ring-accent-500/30"
          />

          {error && (
            <p role="alert" className="mt-4 text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => start(bookTitle.trim())}
            className="mt-6 w-full rounded-lg bg-accent-600 px-4 py-4 text-lg font-semibold
                       text-white hover:bg-accent-700 focus:outline-none focus-visible:ring-2
                       focus-visible:ring-accent-400"
          >
            Start reading
          </button>
          {!wakeLockSupported && (
            <p className="mt-3 text-xs text-slate-500">
              Heads up: your browser may dim the screen during long sessions.
            </p>
          )}
        </div>
      </Shell>
    );
  }

  // --- Starting / ending spinner --------------------------------------------
  if (phase === 'starting' || phase === 'ending') {
    return (
      <Shell>
        <div className="m-auto text-center text-slate-400">
          <div
            className="mx-auto h-8 w-8 animate-spin motion-reduce:animate-none rounded-full
                       border-2 border-slate-700 border-t-accent-500"
            aria-hidden="true"
          />
          <p className="mt-4">{phase === 'starting' ? 'Starting your session…' : 'Wrapping up…'}</p>
        </div>
      </Shell>
    );
  }

  // --- Active session --------------------------------------------------------
  const paused = pauseReason !== null;
  return (
    <Shell>
      <header className="flex items-center justify-between">
        <span className="text-sm text-slate-400">Reading session</span>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            paused ? 'bg-amber-500/15 text-amber-300' : 'bg-accent-500/15 text-accent-300'
          }`}
        >
          {paused ? 'Paused' : 'Active'}
        </span>
      </header>

      <div className="m-auto text-center">
        <div
          className="font-mono text-6xl font-bold tabular-nums"
          role="timer"
          aria-live="off"
          aria-label={`Reading time: ${formatClock(activeSeconds)}`}
        >
          {formatClock(activeSeconds)}
        </div>

        {pauseReason === 'hidden' && (
          <p className="mt-4 text-amber-300">Paused — return to the app to keep counting.</p>
        )}
        {pauseReason === 'checkin' && (
          <div className="mt-6">
            <p className="text-amber-300">Paused — are you still reading?</p>
            <button
              type="button"
              onClick={acknowledgeCheckin}
              className="mt-3 rounded-lg bg-accent-600 px-5 py-3 font-semibold text-white"
            >
              Yes, resume
            </button>
          </div>
        )}
      </div>

      {/* Gentle, non-blocking check-in prompt (session keeps counting while shown). */}
      {checkinPrompt && pauseReason !== 'checkin' && (
        <div
          role="status"
          className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-slate-700
                     bg-slate-900 px-4 py-3"
        >
          <span className="text-sm text-slate-200">Still reading?</span>
          <button
            type="button"
            onClick={acknowledgeCheckin}
            className="rounded-md bg-accent-600 px-3 py-2 text-sm font-semibold text-white"
          >
            Yep 👍
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={end}
        className="w-full rounded-lg border border-slate-700 px-4 py-4 text-lg font-semibold
                   text-slate-200 hover:bg-slate-900 focus:outline-none focus-visible:ring-2
                   focus-visible:ring-slate-500"
      >
        End session
      </button>
    </Shell>
  );
}
