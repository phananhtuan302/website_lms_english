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

  let tone = 'border-slate-200 bg-slate-50 text-slate-600';
  let icon = '✓';
  let text = t('editorSave.idle');
  if (status.phase === 'saving') {
    tone = 'border-primary-200 bg-primary-50 text-primary-700';
    icon = '…';
    text = t('editorSave.saving');
  } else if (status.phase === 'saved' && status.lastSavedAt) {
    tone = 'border-emerald-200 bg-emerald-50 text-emerald-800';
    text = t('editorSave.savedAt', { time: formatClock(status.lastSavedAt) });
  } else if (status.phase === 'held') {
    tone = 'border-amber-200 bg-amber-50 text-amber-900';
    icon = '✎';
    text = status.message ?? t('editorSave.held');
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="editor-save-status"
      data-phase={status.phase}
      className="flex items-center"
    >
      {status.phase === 'failed' ? (
        <button
          type="button"
          onClick={status.retry}
          title={status.detail}
          className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-1 text-xs font-semibold text-red-800 shadow-2xs hover:bg-red-100"
        >
          <span>⚠ {t('editorSave.failed')}</span>
          {status.message && <span className="text-[11px] font-normal">{status.message}</span>}
        </button>
      ) : (
        <p className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1 text-xs font-semibold shadow-2xs ${tone}`}>
          <span aria-hidden="true">{icon}</span>
          <span>{text}</span>
        </p>
      )}
    </div>
  );
}

export default SaveStatusBar;
