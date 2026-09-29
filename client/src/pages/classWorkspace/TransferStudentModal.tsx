import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClassDTO } from '@platform/shared';
import Modal from '../../components/Modal';
import { ApiError } from '../../lib/apiClient';
import { teacherApi } from '../../lib/teacherApi';

interface TransferStudentModalProps {
  classId: string;
  student: { id: string; name: string; email: string };
  onClose: () => void;
  /** Called once the transfer has actually succeeded, with the destination class's name — the
   * caller closes this modal itself and shows its own brief success message + reloads the roster
   * (same shape as `AddStudentsModal`'s `onChanged`). */
  onTransferred: (destinationClassName: string) => void;
}

const PRIMARY_BUTTON_CLASS =
  'min-h-[2.5rem] rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60';
const SECONDARY_BUTTON_CLASS =
  'min-h-[2.5rem] rounded-md border border-primary-300 px-4 py-2 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-60';

/**
 * "Chuyển lớp" for ONE student of the class (Học sinh tab, T-118C) — self-service replacement
 * for the old "ask an admin" note. Fetches the teacher's other classes via the same
 * `teacherApi.listClasses()` the class-card home uses, excludes the current class, and:
 * - no other class → a short explanation, no picker, no confirm button (just Close);
 * - otherwise a `<select>` of destinations + a plain-language line naming the effect, then
 *   `POST .../transfer` (`teacherApi.transferClassStudent`). On success this modal does NOT show
 *   its own "done" screen (unlike `ResetStudentPasswordModal`, which must show the one-time
 *   password) — it simply reports up to `onTransferred` so the parent can close it, show a brief
 *   success message, and refresh the roster in one place.
 */
function TransferStudentModal({ classId, student, onClose, onTransferred }: TransferStudentModalProps) {
  const { t } = useTranslation();
  const [otherClasses, setOtherClasses] = useState<ClassDTO[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [destinationId, setDestinationId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    teacherApi
      .listClasses()
      .then((classes) => {
        if (cancelled) return;
        const others = classes.filter((cls) => cls.id !== classId);
        setOtherClasses(others);
        if (others.length > 0) setDestinationId(others[0].id);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  const destination = otherClasses?.find((cls) => cls.id === destinationId) ?? null;
  const hasDestinations = (otherClasses?.length ?? 0) > 0;

  async function handleTransfer() {
    if (submitting || !destination) return;
    setSubmitting(true);
    setError(null);
    try {
      await teacherApi.transferClassStudent(classId, student.id, destination.id);
      onTransferred(destination.name);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? t('classStudents.transfer.notFound')
          : t('classStudents.transfer.failed'),
      );
      setSubmitting(false);
    }
  }

  const footer =
    otherClasses !== null && !hasDestinations ? (
      <button key="close" type="button" onClick={onClose} className={PRIMARY_BUTTON_CLASS}>
        {t('classStudents.transfer.close')}
      </button>
    ) : (
      <>
        <button
          key="cancel"
          type="button"
          onClick={onClose}
          disabled={submitting}
          className={SECONDARY_BUTTON_CLASS}
        >
          {t('classStudents.transfer.cancel')}
        </button>
        <button
          key="confirm"
          type="button"
          onClick={() => void handleTransfer()}
          disabled={submitting || !destination}
          className={PRIMARY_BUTTON_CLASS}
        >
          {submitting ? t('classStudents.transfer.working') : t('classStudents.transfer.confirm')}
        </button>
      </>
    );

  return (
    <Modal
      title={t('classStudents.transfer.title', { name: student.name })}
      onClose={onClose}
      busy={submitting}
      closeLabel={t('classStudents.transfer.close')}
      footer={footer}
    >
      <div className="flex flex-col gap-3">
        {otherClasses === null && !loadFailed && (
          <p className="text-sm text-base-black/60">{t('common.loading')}</p>
        )}
        {loadFailed && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {t('classStudents.transfer.failed')}
          </p>
        )}
        {otherClasses !== null && !hasDestinations && (
          <p className="text-sm text-base-black">{t('classStudents.transfer.onlyOneClass')}</p>
        )}
        {otherClasses !== null && hasDestinations && (
          <>
            <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
              {t('classStudents.transfer.destinationLabel')}
              <select
                data-autofocus
                value={destinationId}
                onChange={(event) => setDestinationId(event.target.value)}
                disabled={submitting}
                className="w-full max-w-full rounded-md border border-primary-200 bg-base-white px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              >
                {otherClasses.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </select>
            </label>
            {destination && (
              <p className="text-sm text-base-black/70">
                {t('classStudents.transfer.confirmText', {
                  name: student.name,
                  className: destination.name,
                })}
              </p>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

export default TransferStudentModal;
