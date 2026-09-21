import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TestClassScheduleDTO, TestGradingStatusDTO } from '@platform/shared';
import Modal from './Modal';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';

interface ScoreReleaseDialogProps {
  testId: string;
  classId: string;
  onClose: () => void;
  /** Called with the saved schedule once the scores were released (the caller closes the dialog). */
  onReleased: (schedule: TestClassScheduleDTO) => void;
}

/**
 * "Cho {N} học sinh xem điểm bài này bây giờ?" — the confirmation in front of every "let students
 * see their scores" button (the class Bài tập tab, the schedule panel, the class results page).
 * Releasing scores cannot be taken back from the student's point of view (they may already have
 * read the number), so the click never applies straight away: the dialog says how many students it
 * concerns and, when some written answers are still ungraded, warns in amber that those students'
 * scores are only provisional ("tạm tính"). The counts come from `GET .../grading-status`.
 *
 * "Chưa, quay lại" takes focus first, so an accidental Enter never releases anything. Hiding scores
 * needs no confirmation and does not use this dialog.
 */
function ScoreReleaseDialog({ testId, classId, onClose, onReleased }: ScoreReleaseDialogProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<TestGradingStatusDTO | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    teacherApi
      .getTestGradingStatus(testId, classId)
      .then((res) => {
        if (!cancelled) setStatus(res);
      })
      .catch(() => {
        if (!cancelled) setStatusFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [testId, classId]);

  const ready = status !== null || statusFailed;

  function handleConfirm() {
    setWorking(true);
    setError(null);
    teacherApi
      .updateTestClassSchedule(testId, { classId, published: true })
      .then((schedule) => onReleased(schedule))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : t('teacherTestReport.publishFailed'));
        setWorking(false);
      });
  }

  return (
    <Modal
      title={t('scoring.release.title')}
      onClose={onClose}
      busy={working}
      closeLabel={t('scoring.release.close')}
      footer={
        <>
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            disabled={working}
            className="rounded-md border border-primary-300 bg-base-white px-5 py-3 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100 disabled:opacity-60"
          >
            {t('scoring.release.cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={working || !ready}
            className="rounded-md bg-primary-500 px-5 py-3 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {working ? t('scoring.release.working') : t('scoring.release.confirm')}
          </button>
        </>
      }
    >
      {!ready && <p className="text-sm text-base-black/60">{t('scoring.release.checking')}</p>}
      {status && (
        <p className="text-base font-medium text-base-black">
          {status.submittedStudentCount > 0
            ? t('scoring.release.question', { count: status.submittedStudentCount })
            : t('scoring.release.questionNone')}
        </p>
      )}
      {status && status.ungradedStudentCount > 0 && (
        <p
          role="status"
          className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"
        >
          {t('scoring.release.ungradedWarning', { count: status.ungradedStudentCount })}
        </p>
      )}
      {statusFailed && (
        <>
          <p className="text-base font-medium text-base-black">{t('scoring.release.questionGeneric')}</p>
          <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {t('scoring.release.checkFailed')}
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </Modal>
  );
}

export default ScoreReleaseDialog;
