import { Link } from 'react-router-dom';
import { ROUTES } from '../lib/constants';
import { Button, EmptyState } from '../components/ui';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <EmptyState
        emoji="🔍"
        title="Page not found"
        action={
          <Link to={ROUTES.HOME}>
            <Button>Back home</Button>
          </Link>
        }
      >
        The page you’re looking for doesn’t exist.
      </EmptyState>
    </div>
  );
}
