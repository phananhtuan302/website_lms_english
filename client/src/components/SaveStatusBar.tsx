import { useTranslation } from 'react-i18next';
import type { EditorSaveStatus } from '../lib/editorSave';

interface SaveStatusBarProps {
  status: EditorSaveStatus;
}

function formatClock(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * The always-visible "is my work safe?" line of the test editor (sticks to the top of the
 * screen while scrolling). One of: nothing edited yet, "Đang lưu…", "Đã lưu lúc 14:05", a calm
 * hint that something is not ready to save (an empty answer box), or "Chưa lưu được — bấm để
 * thử lại" with a short plain reason.
 */
function SaveStatusBar({ status }: SaveStatusBarProps) {
  const { t } = useTranslation();

  let tone = 'border-primary-100 bg-base-white text-base-black/70';
  let icon = '✓';
  let text = t('editorSave.idle');
  if (status.phase === 'saving') {
    tone = 'border-primary-200 bg-primary-50 text-primary-700';
    icon = '…';
    text = t('editorSave.saving');
  } else if (status.phase === 'saved' && status.lastSavedAt) {
    tone = 'border-green-200 bg-green-50 text-green-800';
    text = t('editorSave.savedAt', { time: formatClock(status.lastSavedAt) });
  } else if (status.phase === 'held') {
    tone = 'border-amber-300 bg-amber-50 text-amber-900';
    icon = '✎';
    text = status.message ?? t('editorSave.held');
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="editor-save-status"
      data-phase={status.phase}
      className="sticky top-0 z-30 -mx-4 bg-base-white/95 px-4 py-1.5 backdrop-blur-sm sm:-mx-6 sm:px-6"
    >
      {status.phase === 'failed' ? (
        <button
          type="button"
          onClick={status.retry}
          title={status.detail}
          className="flex w-full flex-col items-start gap-0.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-left text-sm font-semibold text-red-800 shadow-sm hover:bg-red-100 sm:flex-row sm:items-center sm:gap-3"
        >
          <span>⚠ {t('editorSave.failed')}</span>
          {status.message && <span className="text-xs font-normal">{status.message}</span>}
        </button>
      ) : (
        <p className={`inline-flex max-w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-sm shadow-sm ${tone}`}>
          <span aria-hidden="true">{icon}</span>
          <span>{text}</span>
        </p>
      )}
    </div>
  );
}

export default SaveStatusBar;
