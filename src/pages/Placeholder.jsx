// A single reusable "coming soon" page for routes that get built in later
// phases. Keeping them as real, reachable routes now means the navigation and
// route guards are fully wired and testable from Phase 1.
import { EmptyState } from '../components/ui';

export default function Placeholder({ title, phase, emoji = '🚧' }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <EmptyState emoji={emoji} title="Coming soon">
        This screen is planned for {phase}. The navigation and access rules around it are
        already working.
      </EmptyState>
    </div>
  );
}
