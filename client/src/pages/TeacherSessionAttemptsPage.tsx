import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AttemptSummaryDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';

/** `null` (never submitted — see `AttemptSummaryDTO.timeTakenSeconds`'s doc comment,
 * T-017) renders as an em dash rather than "0:00", so an abandoned attempt reads as
 * "no data" instead of implying it took zero time. */
function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

/**
 * Teacher's per-session attempt list (T-014), reachable at
 * `/teacher/sessions/:sessionId/attempts` from the session panel in the test editor.
 * Ownership of the session (and therefore the test) is enforced server-side
 * (`GET /api/teacher/sessions/:sessionId/attempts` 404s for a session the calling
 * teacher doesn't own), so a teacher can never browse another teacher's attempts here.
 */
function TeacherSessionAttemptsPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [attempts, setAttempts] = useState<AttemptSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    teacherApi
      .listSessionAttempts(sessionId)
      .then(setAttempts)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('teacherSessionAttempts.loadFailed')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const testTitle = attempts?.[0]?.testTitle;
  const testId = attempts?.[0]?.testId;

  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => (testId ? navigate(`/teacher/tests/${testId}`) : navigate(-1))}
          className="text-sm text-primary-600 hover:underline"
        >
          {t('teacherSessionAttempts.backToTest')}
        </button>
        {sessionId && (
          <Link
            to={`/teacher/sessions/${sessionId}/live`}
            className="text-sm font-medium text-primary-600 hover:underline"
          >
            {t('teacherSessionAttempts.liveMonitor')}
          </Link>
        )}
      </div>

      <h1 className="mt-2 text-2xl font-bold text-primary-700">
        {t('teacherSessionAttempts.heading')}
        {testTitle ? ` — ${testTitle}` : ''}
      </h1>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {attempts === null && !error && <p className="mt-4 text-sm text-base-black/60">{t('common.loading')}</p>}

      {attempts?.length === 0 && (
        <p className="mt-4 text-sm text-base-black/60">{t('teacherSessionAttempts.noAttempts')}</p>
      )}

      {attempts && attempts.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-xl border border-primary-200">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-primary-50 text-xs font-semibold uppercase text-primary-700">
              <tr>
                <th className="px-4 py-3">{t('teacherSessionAttempts.columns.student')}</th>
                <th className="px-4 py-3">{t('teacherSessionAttempts.columns.status')}</th>
                <th className="px-4 py-3">{t('teacherSessionAttempts.columns.score')}</th>
                <th className="px-4 py-3">{t('teacherSessionAttempts.columns.timeTaken')}</th>
                <th className="px-4 py-3">{t('teacherSessionAttempts.columns.started')}</th>
                <th className="px-4 py-3">{t('teacherSessionAttempts.columns.flags')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {attempts.map((attempt) => (
                <tr key={attempt.attemptId} className="border-t border-primary-100">
                  <td className="px-4 py-3">
                    <p className="font-medium text-base-black">{attempt.studentName}</p>
                    <p className="text-xs text-base-black/50">{attempt.studentEmail}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        attempt.status === 'submitted' ? 'text-green-700' : 'text-primary-600'
                      }
                    >
                      {attempt.status === 'submitted'
                        ? t('teacherSessionAttempts.status.submitted')
                        : t('teacherSessionAttempts.status.inProgress')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {attempt.scorePercent !== null
                      ? `${attempt.scorePercent}% (${attempt.correctCount}/${attempt.totalCount})`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-base-black/70">
                    {formatDuration(attempt.timeTakenSeconds)}
                  </td>
                  <td className="px-4 py-3 text-base-black/70">
                    {new Date(attempt.startedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {attempt.tabSwitchCount > 0 ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                        {t('teacherSessionAttempts.tabSwitchCount', { count: attempt.tabSwitchCount })}
                      </span>
                    ) : (
                      <span className="text-xs text-base-black/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/teacher/attempts/${attempt.attemptId}`}
                      className="font-medium text-primary-600 hover:underline"
                    >
                      {t('teacherSessionAttempts.viewDetail')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default TeacherSessionAttemptsPage;
