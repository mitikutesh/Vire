import { X } from 'lucide-react';
import { t } from '@/content/strings';

/**
 * A single transient message, pinned above the bottom nav.
 *
 * `role="alert"` rather than a polite live region: it appears when a tap the user
 * just made has been undone, which they need to know now rather than whenever the
 * screen reader next pauses.
 *
 * Berry, because every rolled-back write is a failure — this is not a
 * general-purpose notification surface, and it should not become one.
 */
export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className="bg-berry-soft border-berry fixed inset-x-0 z-30 mx-auto flex max-w-md items-center gap-3 rounded-2xl border px-4 py-3"
      // Above the fixed bottom nav, not behind it.
      style={{ bottom: 78 }}
    >
      <p className="text-berry flex-1 text-sm font-medium">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t.log.dismiss}
        className="border-berry rounded-full border p-1"
      >
        <X size={14} className="text-berry" aria-hidden="true" />
      </button>
    </div>
  );
}
