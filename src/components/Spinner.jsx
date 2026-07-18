// A small, accessible loading spinner.
// `role="status"` + the visually-hidden label mean screen readers announce
// "Loading" instead of silence. `motion-reduce` respects prefers-reduced-motion.
export default function Spinner({ label = 'Loading' }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 text-slate-500">
      <span
        className="h-5 w-5 animate-spin motion-reduce:animate-none rounded-full border-2 border-slate-300 border-t-accent-600"
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}

// Full-screen version, used while we resolve the initial auth state so the
// app never flashes a wrong screen.
export function FullPageSpinner({ label = 'Loading' }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <Spinner label={label} />
    </div>
  );
}
