import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  /** Visible heading; also the dialog's accessible name (`aria-labelledby`). */
  title: string;
  onClose: () => void;
  /** When true the dialog cannot be dismissed (Escape / backdrop / close button all ignored) —
   * used while a multi-step save is in flight so the teacher can't walk away mid-request. */
  busy?: boolean;
  /** Label for the ✕ button in the header. */
  closeLabel: string;
  children: ReactNode;
  /** Sticky footer (action buttons). */
  footer?: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Minimal accessible modal dialog (T-103; the codebase has no dialog library). Renders into
 * `document.body` through a portal so it can never be clipped by a layout container, and:
 * - `role="dialog"` + `aria-modal` + `aria-labelledby` pointing at its heading;
 * - focus moves into the dialog on open (first focusable element, else the panel) and is
 *   TRAPPED there (Tab / Shift+Tab wrap), then restored to whatever opened it on close;
 * - Escape and a backdrop click close it (unless `busy`);
 * - the page behind stops scrolling while it is open.
 */
function Modal({ title, onClose, busy = false, closeLabel, children, footer }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Latest values without re-running the mount-only effect below.
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => {
    onCloseRef.current = onClose;
    busyRef.current = busy;
  });

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = () =>
      panel ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];

    // Prefer a field in the body over the header's ✕ button so typing can start at once.
    const first = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0] ?? panel;
    first?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (!busyRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        panel?.focus();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === firstItem || !panel?.contains(active))) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && (active === lastItem || !panel?.contains(active))) {
        event.preventDefault();
        firstItem.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-base-black/50 p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        // Only a press that STARTS on the backdrop itself counts (not a drag that ends there).
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-base-white shadow-xl focus:outline-none sm:max-w-2xl sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-primary-100 px-5 py-4">
          <h2 id={titleId} className="text-lg font-bold text-primary-700">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={closeLabel}
            className="-my-2 -mr-2 rounded-md px-3 py-3 text-lg leading-none sm:my-0 sm:-mr-1 sm:px-2 sm:py-1 text-base-black/60 transition-colors hover:bg-primary-50 hover:text-base-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-primary-100 bg-primary-50 px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default Modal;
