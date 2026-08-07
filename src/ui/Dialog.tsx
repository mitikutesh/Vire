import { useEffect, useId, useRef, type ReactNode } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  title: string;
  /** Omitted for a dialog the user may not leave, such as first-run setup. */
  onClose?: (() => void) | undefined;
  children: ReactNode;
  /** Rendered in the header next to the title, e.g. a close button. */
  headerAction?: ReactNode;
}

/**
 * A modal dialog that actually behaves like one (improvement I4).
 *
 * The prototype's settings overlay was a plain absolutely-positioned div: focus
 * stayed behind it, so keyboard and screen-reader users tabbed into the app they
 * could not see, and the page scrolled underneath. This traps focus, restores it
 * on close, locks background scroll, and closes on Escape.
 *
 * Omitting `onClose` makes it non-dismissible, which is what first-run setup
 * needs: the app has no calorie target until the form is saved.
 */
export function Dialog({ title, onClose, children, headerAction }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move focus in, preferring the first control so a keyboard user starts
    // where the work is.
    const focusable = panel?.querySelectorAll<HTMLElement>(FOCUSABLE);
    (focusable?.[0] ?? panel)?.focus();

    // Background scroll would otherwise move under the dialog on iOS.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onClose) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;

      // Cycle within the dialog rather than escaping into the page behind it.
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Return focus to whatever opened the dialog, so the user does not land
      // back at the top of the document.
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      ref={panelRef}
      tabIndex={-1}
      className="bg-paper fixed inset-0 overflow-y-auto"
      style={{ zIndex: 50 }}
    >
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
        <div className="flex items-center justify-between">
          <h1 id={titleId} className="disp text-ink font-extrabold" style={{ fontSize: 22 }}>
            {title}
          </h1>
          {headerAction}
        </div>
        {children}
      </div>
    </div>
  );
}
