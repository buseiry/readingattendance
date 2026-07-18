// The public home page at "/". Warm, student-native copy; one clear action.
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ROUTES } from '../lib/constants';
import { Button } from '../components/ui';

export default function Landing() {
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4">
        <span className="text-lg font-bold text-accent-700">ReadingStreak</span>
        {user ? (
          <Link to={ROUTES.DASHBOARD}>
            <Button variant="secondary">Go to app</Button>
          </Link>
        ) : (
          <Link to={ROUTES.LOGIN}>
            <Button variant="ghost">Log in</Button>
          </Link>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-10">
        <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
          Read more. Prove it. <span className="text-accent-600">Climb your school’s ranks.</span>
        </h1>
        <p className="max-w-xl text-lg text-slate-600">
          Start a session, read for real, and watch your minutes stack up. Build a streak,
          top the leaderboard at your school, and keep yourself accountable — one page at a time.
        </p>
        <div className="flex flex-wrap gap-3">
          {user ? (
            <Link to={ROUTES.DASHBOARD}>
              <Button>Open your dashboard</Button>
            </Link>
          ) : (
            <>
              <Link to={ROUTES.REGISTER}>
                <Button>Get started — it’s free</Button>
              </Link>
              <Link to={ROUTES.LOGIN}>
                <Button variant="secondary">I already have an account</Button>
              </Link>
            </>
          )}
        </div>
      </main>

      <footer className="mx-auto w-full max-w-3xl px-4 py-6 text-sm text-slate-400">
        Built for Nigerian students. 🇳🇬
      </footer>
    </div>
  );
}
