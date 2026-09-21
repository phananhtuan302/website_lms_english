import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../../components/Modal';
import { ApiError } from '../../lib/apiClient';
import { teacherApi } from '../../lib/teacherApi';

interface ResetStudentPasswordModalProps {
  classId: string;
  student: { id: string; name: string; email: string };
  onClose: () => void;
}

type CopyState = 'idle' | 'copied' | 'failed';

const PRIMARY_BUTTON_CLASS =
  'min-h-[2.5rem] rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60';
const SECONDARY_BUTTON_CLASS =
  'min-h-[2.5rem] rounded-md border border-primary-300 px-4 py-2 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-60';

/** Copies `text` to the clipboard: the async Clipboard API where the page is allowed to use it,
 * otherwise the old select-and-copy trick. Resolves `false` when neither worked. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      document.body.removeChild(field);
    }
  }
}

/**
 * "Đặt lại mật khẩu" for ONE student of the class (Học sinh tab). Two steps: a plain-language
 * confirmation, then — after `POST /api/teacher/classes/:classId/students/:studentId/reset-password`
 * — the new password, shown once with a Copy button. The server only stores the password's hash,
 * so once this dialog is closed the password can only be replaced, never looked up again; the
 * dialog says so next to the password.
 */
function ResetStudentPasswordModal({ classId, student, onClose }: ResetStudentPasswordModalProps) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');

  async function handleReset() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await teacherApi.resetClassStudentPassword(classId, student.id);
      setNewPassword(response.generatedPassword);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? t('classResetPassword.notFound')
          : t('classResetPassword.failed'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (newPassword === null) return;
    setCopyState((await copyText(newPassword)) ? 'copied' : 'failed');
  }

  const footer =
    newPassword === null ? (
      <>
        <button
          key="cancel"
          type="button"
          onClick={onClose}
          disabled={submitting}
          className={SECONDARY_BUTTON_CLASS}
        >
          {t('classResetPassword.cancel')}
        </button>
        <button
          key="confirm"
          type="button"
          onClick={() => void handleReset()}
          disabled={submitting}
          className={PRIMARY_BUTTON_CLASS}
        >
          {submitting ? t('classResetPassword.working') : t('classResetPassword.confirm')}
        </button>
      </>
    ) : (
      <button key="done" type="button" onClick={onClose} className={PRIMARY_BUTTON_CLASS}>
        {t('classResetPassword.done')}
      </button>
    );

  return (
    <Modal
      title={t('classResetPassword.title', { name: student.name })}
      onClose={onClose}
      busy={submitting}
      closeLabel={t('classResetPassword.close')}
      footer={footer}
    >
      {newPassword === null ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-base-black">
            {t('classResetPassword.question', { name: student.name, email: student.email })}
          </p>
          <p className="text-sm text-base-black/70">{t('classResetPassword.explain')}</p>
          {error && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p role="status" className="text-sm font-medium text-base-black">
            {t('classResetPassword.newPasswordFor', { name: student.name })}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <code
              data-testid="new-password"
              className="select-all rounded-md bg-primary-50 px-3 py-2 font-mono text-xl font-semibold tracking-wide text-base-black"
            >
              {newPassword}
            </code>
            <button type="button" onClick={() => void handleCopy()} className={SECONDARY_BUTTON_CLASS}>
              {copyState === 'copied' ? t('classResetPassword.copied') : t('classResetPassword.copy')}
            </button>
          </div>
          {copyState === 'failed' && (
            <p role="alert" className="text-sm text-red-700">
              {t('classResetPassword.copyFailed')}
            </p>
          )}
          <p
            role="alert"
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-base font-semibold text-amber-900"
          >
            {t('classResetPassword.warning')}
          </p>
          <p className="text-sm text-base-black/70">
            {t('classResetPassword.loginHint', { email: student.email })}
          </p>
          <p className="text-sm text-base-black/70">{t('classResetPassword.oldFileHint')}</p>
        </div>
      )}
    </Modal>
  );
}

export default ResetStudentPasswordModal;
