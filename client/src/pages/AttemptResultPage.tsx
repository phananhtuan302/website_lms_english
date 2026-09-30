import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SPEAKING_SCORE_SCALE, type AttemptResultResponseDTO } from '@platform/shared';
import { studentApi } from '../lib/studentApi';
import { ApiError } from '../lib/apiClient';
import { formatPoints, formatScore10 } from '../lib/scoreFormat';

/** T-113: the big solid "← Về Bài cần làm" button a child sees right after finishing a test. */
const BACK_HOME_BUTTON_CLASS =
  'inline-flex min-h-12 items-center justify-center rounded-md bg-primary-500 px-6 py-3 text-base font-semibold text-base-white transition-colors hover:bg-primary-600';

/**
 * Student's own result view (T-014), reachable at `/student/attempts/:attemptId/result`
 * once an attempt has been submitted (T-013 grades it at submit time). The server's
 * `GET /api/attempts/:attemptId/result` only ever returns the CALLING student's own
 * attempt (404 otherwise) — see `attempts.routes.ts` — so there's no separate
 * client-side ownership check needed here.
 *
 * T-092: the server returns a discriminated union (`AttemptResultResponseDTO`) —
 * `scoresPublished: false` (the narrower `AttemptResultPendingDTO`, no score/breakdown
 * fields at all) until the teacher publishes scores for this student's class, or the
 * full `AttemptResultDTO` (`scoresPublished: true`) once released. The early return
 * below on `!result.scoresPublished` narrows `result` to the full DTO for the rest of
 * this component — TypeScript's discriminated-union narrowing, not a runtime cast.
 */
function AttemptResultPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { t } = useTranslation();
  const [result, setResult] = useState<AttemptResultResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!attemptId) return;
    studentApi
      .getResult(attemptId)
      .then(setResult)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : t('attemptResult.loadFailed')),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  if (error) {
    return (
      <p
        role="alert"
        className="mx-auto max-w-md rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        {error}
      </p>
    );
  }

  if (!result) {
    return <p className="text-center text-base-black/60">{t('attemptResult.loadingResult')}</p>;
  }

  // T-092: awaiting publish — narrows `result` to the full `AttemptResultDTO` for
  // everything below this point (see module doc comment).
  if (!result.scoresPublished) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        {/* T-113: a friendly "well done, now wait" box (green, not the yellow of a warning). */}
        <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
          <h1 className="text-xl font-bold text-primary-700">{result.testTitle}</h1>
          <p className="mt-3 text-lg font-semibold text-green-800">
            {t('attemptResult.awaitingPublish')}
          </p>
          <p className="mt-1 text-xs text-base-black/60">
            {t('attemptResult.submittedAt', {
              date: result.submittedAt ? new Date(result.submittedAt).toLocaleString() : '',
            })}
          </p>
        </div>
        <Link to="/student/dashboard" className={`${BACK_HOME_BUTTON_CLASS} self-center`}>
          {t('attemptResult.backToDashboard')}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="rounded-xl border border-primary-200 bg-primary-50 p-6 text-center">
        <h1 className="text-xl font-bold text-primary-700">{result.testTitle}</h1>
        <p className="mt-2 text-4xl font-bold text-primary-700">
          {t('scoring.student.headline', { score: formatScore10(result.scorePercent) })}
        </p>
        {result.provisional && (
          <div className="mt-2">
            <p className="inline-block rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">
              {t('scoring.provisional.studentChip')}
            </p>
            <p className="mt-1 text-sm text-amber-900">
              {t('scoring.provisional.studentNote', { count: result.ungradedCount })}
            </p>
          </div>
        )}
        <p className="mt-1 text-sm text-base-black/70">
          {t('attemptResult.correctOutOf', { correct: result.correctCount, total: result.totalCount })}
        </p>
        <p className="mt-1 text-xs text-base-black/50">
          {t('attemptResult.submittedAt', {
            date: result.submittedAt ? new Date(result.submittedAt).toLocaleString() : '',
          })}
          {result.timeTakenSeconds !== null &&
            t('attemptResult.timeTakenSuffix', {
              time: `${Math.floor(result.timeTakenSeconds / 60)}:${String(result.timeTakenSeconds % 60).padStart(2, '0')}`,
            })}
        </p>
        {/* T-113: the obvious next step, right under the score (the plain link at the bottom stays). */}
        <Link to="/student/dashboard" className={`${BACK_HOME_BUTTON_CLASS} mt-4 w-full sm:w-auto`}>
          {t('attemptResult.backToDashboard')}
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-base-black">{t('attemptResult.questionReview')}</h2>
        {result.questions.map((q) => (
          <div
            key={q.questionId}
            className={`rounded-lg border p-4 ${
              q.type === 'essay' || q.type === 'speaking'
                ? 'border-primary-100 bg-base-white'
                : q.isCorrect
                  ? 'border-green-200 bg-green-50'
                  : 'border-red-200 bg-red-50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-base-black">
                {t('attemptResult.questionNumber', { order: q.order })} {q.prompt}
              </p>
              {q.type === 'essay' ? (
                <span className="shrink-0 rounded-full bg-primary-200 px-3 py-1 text-xs font-bold uppercase text-primary-800">
                  {q.manualScore != null ? `${formatPoints(q.manualScore)} / ${formatPoints(q.essayMaxScore ?? 0)}` : t('attemptResult.awaitingGrading')}
                </span>
              ) : q.type === 'speaking' ? (
                <span className="shrink-0 rounded-full bg-primary-200 px-3 py-1 text-xs font-bold uppercase text-primary-800">
                  {/* Teacher override (T-055) wins once present; otherwise the AI/mock
                      grade (T-054); "Not yet submitted" if the student never recorded
                      an answer for this question. */}
                  {q.manualScore != null
                    ? `${q.manualScore} / ${SPEAKING_SCORE_SCALE}`
                    : q.speakingAiScore != null
                      ? `${q.speakingAiScore} / ${SPEAKING_SCORE_SCALE}`
                      : t('attemptResult.notYetSubmitted')}
                </span>
              ) : (
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold uppercase ${
                    q.isCorrect ? 'bg-green-600 text-base-white' : 'bg-red-600 text-base-white'
                  }`}
                >
                  {q.isCorrect ? t('attemptResult.correct') : t('attemptResult.incorrect')}
                </span>
              )}
            </div>

            {q.type === 'essay' ? (
              <div className="mt-2 flex flex-col gap-2 text-sm text-base-black/80">
                {q.essayTaskType && (
                  <span className="self-start rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700">
                    {t(`attemptResult.essayTaskType.${q.essayTaskType}`)}
                  </span>
                )}
                <div className="whitespace-pre-wrap rounded-md border border-primary-100 bg-primary-50 p-3">
                  {q.textAnswer?.trim() ? q.textAnswer : <em>{t('attemptResult.noAnswerSubmitted')}</em>}
                </div>
                {q.essayUseIeltsCriteria && q.manualScore != null && (
                  <ul className="grid gap-1 rounded-md border border-primary-100 bg-primary-50 p-3 text-xs sm:grid-cols-2">
                    <li>{t('attemptResult.ieltsTaskLabel', { score: formatPoints(q.essayIeltsTaskScore ?? 0) })}</li>
                    <li>{t('attemptResult.ieltsCoherenceLabel', { score: formatPoints(q.essayIeltsCoherenceScore ?? 0) })}</li>
                    <li>{t('attemptResult.ieltsLexicalLabel', { score: formatPoints(q.essayIeltsLexicalScore ?? 0) })}</li>
                    <li>{t('attemptResult.ieltsGrammarLabel', { score: formatPoints(q.essayIeltsGrammarScore ?? 0) })}</li>
                  </ul>
                )}
                {q.manualComment && (
                  <p className="text-xs italic text-base-black/60">
                    {t('attemptResult.teacherCommentLine', { comment: q.manualComment })}
                  </p>
                )}
                {q.manualScore == null && (
                  <p className="text-xs text-base-black/50">
                    {t('attemptResult.essayNotGradedYet')}
                  </p>
                )}
              </div>
            ) : q.type === 'speaking' ? (
              <div className="mt-2 flex flex-col gap-2 text-sm text-base-black/80">
                {q.speakingAudioData ? (
                  <audio controls src={q.speakingAudioData} className="w-full" />
                ) : (
                  <p className="italic text-base-black/50">{t('attemptResult.noRecordingSubmitted')}</p>
                )}
                {/* Teacher override wins once present (T-055); otherwise show the
                    AI/mock feedback (T-054) — same "teacher value wins" rule as the
                    score badge above. */}
                {(q.manualComment ?? q.speakingAiFeedback) && (
                  <p className="rounded-md border border-primary-100 bg-primary-50 p-3 text-xs text-base-black/70">
                    {q.manualComment
                      ? t('attemptResult.teacherFeedbackLine', { feedback: q.manualComment })
                      : t('attemptResult.feedbackLine', { feedback: q.speakingAiFeedback })}
                  </p>
                )}
                {q.speakingAudioData && q.manualScore == null && q.speakingAiScore == null && (
                  <p className="text-xs text-base-black/50">{t('attemptResult.recordingNotGradedYet')}</p>
                )}
              </div>
            ) : q.type === 'fillBlank' ? (
              <div className="mt-2 text-sm text-base-black/80">
                <p>
                  {t('attemptResult.yourAnswerPrefix')}{' '}
                  {q.textAnswer?.trim() ? q.textAnswer : <em>{t('attemptResult.noAnswer')}</em>}
                </p>
                <p>
                  {t('attemptResult.acceptedAnswersPrefix')} {q.acceptedAnswers.join(', ')}
                </p>
              </div>
            ) : (
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {q.choices.map((choice) => {
                  const isSelected = choice.id === q.selectedChoiceId;
                  return (
                    <li
                      key={choice.id}
                      className={`rounded px-2 py-1 ${
                        choice.isCorrect
                          ? 'bg-green-100 font-medium text-green-800'
                          : isSelected
                            ? 'bg-red-100 text-red-800'
                            : 'text-base-black/70'
                      }`}
                    >
                      {choice.text}
                      {isSelected && t('attemptResult.yourAnswerSuffix')}
                      {choice.isCorrect && t('attemptResult.correctAnswerSuffix')}
                    </li>
                  );
                })}
                {!q.selectedChoiceId && (
                  <li className="text-base-black/50">{t('attemptResult.noAnswerSelected')}</li>
                )}
              </ul>
            )}
          </div>
        ))}
      </section>

      <Link
        to="/student/dashboard"
        className="self-center py-2.5 text-sm font-medium text-primary-600 hover:underline sm:py-0"
      >
        {t('attemptResult.backToDashboard')}
      </Link>
    </div>
  );
}

export default AttemptResultPage;
