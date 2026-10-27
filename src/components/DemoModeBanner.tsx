import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

/** A notice only: dismissing it does not change any server security setting. */
export function DemoModeBanner() {
  const [demoMode, setDemoMode] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/runtime-config', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((config) => {
        if (active && config?.demoMode === true) setDemoMode(true);
      })
      .catch(() => {
        // A missing runtime-config response must never enable the client UI toggle.
      });
    return () => { active = false; };
  }, []);

  if (!demoMode || dismissed) return null;

  return (
    <aside
      role="status"
      aria-label="Demo database security notice"
      className="sticky top-0 z-[100] flex items-start gap-3 border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm sm:px-6"
    >
      <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
      <p className="min-w-0 flex-1 text-sm leading-5">
        <strong className="font-bold">Demo mode:</strong> The database role bypasses PostgreSQL row-level security (RLS).
        This notice can be dismissed, but that does not change database security. Configure a properly restricted
        database role before using real school data or production.
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss demo database security notice"
        className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-amber-900 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </aside>
  );
}
