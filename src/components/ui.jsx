// Small shared UI building blocks. Having these from day one means every
// screen gets consistent buttons, cards, inputs, and — importantly — the
// loading / empty / error states the brief insists on.

// A primary/secondary button with a built-in busy state.
// Touch target is >=44px tall (py-3 + text) for thumbs on small phones.
export function Button({ variant = 'primary', busy = false, children, className = '', ...props }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold ' +
    'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ' +
    'focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';
  const variants = {
    primary: 'bg-accent-600 text-white hover:bg-accent-700',
    secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
    ghost: 'text-slate-600 hover:bg-slate-100',
  };
  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      disabled={busy || props.disabled}
      {...props}
    >
      {busy && (
        <span
          className="h-4 w-4 animate-spin motion-reduce:animate-none rounded-full border-2 border-white/40 border-t-white"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}

// A labelled text input. Ties the <label> to the <input> for accessibility.
export function Field({ id, label, hint, ...props }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        className="w-full rounded-lg border border-slate-300 px-3 py-3 text-slate-900 shadow-sm
                   focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
        {...props}
      />
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

// A simple content card.
export function Card({ children, className = '' }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

// A plain-English error banner with an optional recovery action.
export function ErrorMessage({ message, onRetry, retryLabel = 'Try again' }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
    >
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="self-start font-semibold underline underline-offset-2"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}

// A helpful empty state — icon/emoji, a title, a line of copy, optional action.
export function EmptyState({ emoji = '📖', title, children, action }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <div className="text-3xl" aria-hidden="true">
        {emoji}
      </div>
      <h3 className="text-base font-semibold text-slate-800">{title}</h3>
      {children && <p className="max-w-sm text-sm text-slate-500">{children}</p>}
      {action}
    </div>
  );
}
