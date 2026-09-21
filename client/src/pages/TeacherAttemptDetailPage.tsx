import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SPEAKING_SCORE_SCALE, type AttemptResultDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';

/** Local draft state for one essay/speaking question's manual-grading form (T-042
 * essay, T-055 speaking override) — kept separate from `result` so an in-progress edit
 * doesn't get clobbered by a re-render, same "own local draft, save on explicit action"
 * pattern as `QuestionEditor.tsx`. */
interface GradeDraft {
  scoreText: string;
  comment: string;
}

/**
 * Teacher's per-attempt detail (T-014), reachable at `/teacher/attempts/:attemptId`
 * from `TeacherSessionAttemptsPage`. Reuses the exact same `AttemptResultDTO` shape as
 * the student's own result page — see `server/src/lib/attemptView.ts` — since a
 * per-question correct/incorrect breakdown means the same thing to both audiences; only
 * the ownership check differs (teacher must own the test, enforced server-side).
 *
 * Extended by T-042 (manual essay grading — score + comment form per essay question),
 * T-044 (a tab-switch summary banner, since this is also where a teacher reviews
 * integrity signals for one attempt after the fact), and T-055 (Speaking playback + AI
 * score/feedback review, with the same manual-override form reused for speaking).
 */
function TeacherAttemptDetailPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [result, setResult] = useState<AttemptResultDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, GradeDraft>>({});
  const [gradingErrors, setGradingErrors] = useState<Record<string, string>>({});
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);

  const loadResult = useCallback(() => {
    if (!attemptId) return;
    teacherApi
      .getAttemptDetail(attemptId)
      .then((data) => {
        setResult(data);
        setDrafts((prev) => {
          const next = { ...prev };
          for (const q of data.questions) {
            if (q.type === 'essay' && !next[q.questionId]) {
              next[q.questionId] = {
                scoreText: q.manualScore != null ? String(q.manualScore) : '',
                comment: q.manualComment ?? '',
              };
            }
            if (q.type === 'speaking' && !next[q.questionId]) {
              // Pre-fills the score with the AI (Mock) grade as a starting point for
              // override (T-055) — documented choice: overriding reads as "adjust this
              // number" rather than "type a score from nothing," since the AI verdict
              // is already right there to compare against. The comment stays blank
              // (not pre-filled from `speakingAiFeedback`) so a saved `manualComment`
              // always reflects something the teacher actually wrote.
              next[q.questionId] = {
                scoreText:
                  q.manualScore != null
                    ? String(q.manualScore)
                    : q.speakingAiScore != null
                      ? String(q.speakingAiScore)
                      : '',
                comment: q.manualComment ?? '',
              };
            }
          }
          return next;
        });
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t('teacherAttemptDetail.loadFailed')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  useEffect(loadResult, [loadResult]);

  async function handleSaveGrade(questionId: string, maxScore: number | null) {
    if (!attemptId) return;
    const draft = drafts[questionId];
    const score = Number(draft?.scoreText);
    if (!draft || draft.scoreText.trim() === '' || Number.isNaN(score) || score < 0 || (maxScore != null && score > maxScore)) {
      setGradingErrors((prev) => ({
        ...prev,
        [questionId]: t('teacherAttemptDetail.scoreRangeError', { max: maxScore ?? '?' }),
      }));
      return;
    }
    setSavingQuestionId(questionId);
    setGradingErrors((prev) => ({ ...prev, [questionId]: '' }));
    try {
      await teacherApi.gradeEssayAnswer(attemptId, questionId, {
        score,
        comment: draft.comment.trim() === '' ? null : draft.comment,
      });
      loadResult();
    } catch (err) {
      setGradingErrors((prev) => ({
        ...prev,
        [questionId]: err instanceof ApiError ? err.message : t('teacherAttemptDetail.saveGradeFailed'),
      }));
    } finally {
      setSavingQuestionId(null);
    }
  }

  if (error) {
    return (
      <p role="alert" className="mx-auto max-w-md rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (!result) {
    return <p className="text-center text-base-black/60">{t('common.loading')}</p>;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <button
        type="button"
        onClick={() => {
          // T-103: back returns to wherever the teacher came from (a class's results page, the
          // gradebook, a session's attempt list, ...). A `default` key means this page was the
          // first entry in the tab's history (opened from a bookmark / new tab), where
          // `navigate(-1)` would leave the app — fall back to this test's report instead.
          if (location.key !== 'default') navigate(-1);
          else navigate(`/teacher/tests/${encodeURIComponent(result.testId)}/report`);
        }}
        className="self-start py-2.5 text-sm text-primary-600 hover:underline sm:py-0"
      >
        {t('classAssignments.back')}
      </button>

      <div className="rounded-xl border border-primary-200 bg-primary-50 p-6 text-center">
        <h1 className="text-xl font-bold text-primary-700">{result.testTitle}</h1>
        <p className="mt-1 text-sm text-base-black/70">{result.studentName}</p>
        {result.status === 'submitted' ? (
          <>
            <p className="mt-2 text-4xl font-bold text-primary-700">{result.scorePercent}%</p>
            <p className="mt-1 text-sm text-base-black/70">
              {t('teacherAttemptDetail.correctOutOf', { correct: result.correctCount, total: result.totalCount })}
            </p>
            {result.timeTakenSeconds !== null && (
              <p className="mt-1 text-xs text-base-black/50">
                {t('teacherAttemptDetail.timeTaken', {
                  time: `${Math.floor(result.timeTakenSeconds / 60)}:${String(result.timeTakenSeconds % 60).padStart(2, '0')}`,
                })}
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-lg font-semibold text-base-black/60">{t('teacherAttemptDetail.stillInProgress')}</p>
        )}
      </div>

      {/* Global tab-switch / exit detection (T-044) — visible to the teacher after the
          fact, recorded once by the shared take-test runtime for every test type. */}
      <div
        className={`rounded-lg border px-4 py-3 text-sm ${
          result.tabSwitchCount > 0
            ? 'border-red-200 bg-red-50 text-red-800'
            : 'border-primary-100 bg-base-white text-base-black/60'
        }`}
      >
        {result.tabSwitchCount > 0 ? (
          <>
            <p className="font-semibold">
              {t('teacherAttemptDetail.tabSwitchDetected', { count: result.tabSwitchCount })}
            </p>
            <p className="mt-1 text-xs text-red-700/80">
              {result.tabSwitchLog.map((ts) => new Date(ts).toLocaleTimeString()).join(', ')}
            </p>
          </>
        ) : (
          <p>{t('teacherAttemptDetail.noTabSwitches')}</p>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-base-black">{t('teacherAttemptDetail.questionReview')}</h2>
        {result.questions.map((q) => (
          <div
            key={q.questionId}
            className={`rounded-lg border p-4 ${
              q.isCorrect === null
                ? 'border-primary-100 bg-base-white'
                : q.isCorrect
                  ? 'border-green-200 bg-green-50'
                  : 'border-red-200 bg-red-50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-base-black">
                {t('teacherAttemptDetail.questionNumber', { order: q.order })} {q.prompt}
              </p>
              {q.type === 'essay' ? (
                <span className="shrink-0 rounded-full bg-primary-200 px-3 py-1 text-xs font-bold uppercase text-primary-800">
                  {q.manualScore != null ? `${q.manualScore} / ${q.essayMaxScore}` : t('teacherAttemptDetail.notGradedYet')}
                </span>
              ) : q.type === 'speaking' ? (
                <span className="shrink-0 rounded-full bg-primary-200 px-3 py-1 text-xs font-bold uppercase text-primary-800">
                  {q.manualScore != null
                    ? t('teacherAttemptDetail.speakingScoreTeacher', { score: q.manualScore, scale: SPEAKING_SCORE_SCALE })
                    : q.speakingAiScore != null
                      ? t('teacherAttemptDetail.speakingScoreAi', { score: q.speakingAiScore, scale: SPEAKING_SCORE_SCALE })
                      : t('teacherAttemptDetail.notSubmittedYet')}
                </span>
              ) : (
                q.isCorrect !== null && (
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold uppercase ${
                      q.isCorrect ? 'bg-green-600 text-base-white' : 'bg-red-600 text-base-white'
                    }`}
                  >
                    {q.isCorrect ? t('teacherAttemptDetail.correct') : t('teacherAttemptDetail.incorrect')}
                  </span>
                )
              )}
            </div>

            {q.type === 'essay' ? (
              <div className="mt-2 flex flex-col gap-3 text-sm text-base-black/80">
                <div className="whitespace-pre-wrap rounded-md border border-primary-100 bg-base-white p-3">
                  {q.textAnswer?.trim() ? q.textAnswer : <em>{t('teacherAttemptDetail.noAnswerSubmitted')}</em>}
                </div>
                <div className="flex flex-wrap items-end gap-3 rounded-md border border-primary-100 bg-primary-50 p-3">
                  <label className="flex flex-col gap-1 text-xs font-medium text-base-black">
                    {t('teacherAttemptDetail.scoreOutOf', { max: q.essayMaxScore })}
                    <input
                      type="number"
                      min={0}
                      max={q.essayMaxScore ?? undefined}
                      value={drafts[q.questionId]?.scoreText ?? ''}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [q.questionId]: { ...prev[q.questionId], scoreText: event.target.value, comment: prev[q.questionId]?.comment ?? '' },
                        }))
                      }
                      className="w-24 rounded-md border border-primary-200 px-2 py-1 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-base-black">
                    {t('teacherAttemptDetail.commentOptional')}
                    <input
                      type="text"
                      value={drafts[q.questionId]?.comment ?? ''}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [q.questionId]: { scoreText: prev[q.questionId]?.scoreText ?? '', comment: event.target.value },
                        }))
                      }
                      placeholder={t('teacherAttemptDetail.feedbackPlaceholder')}
                      className="min-w-[12rem] rounded-md border border-primary-200 px-2 py-1 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => handleSaveGrade(q.questionId, q.essayMaxScore)}
                    disabled={savingQuestionId === q.questionId || result.status !== 'submitted'}
                    className="rounded-md bg-primary-500 px-4 py-3 text-xs font-semibold sm:py-1.5 text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingQuestionId === q.questionId ? t('teacherAttemptDetail.saving') : t('teacherAttemptDetail.saveGrade')}
                  </button>
                </div>
                {gradingErrors[q.questionId] && (
                  <p className="text-xs text-red-600">{gradingErrors[q.questionId]}</p>
                )}
                {q.manualComment && (
                  <p className="text-xs italic text-base-black/60">
                    {t('teacherAttemptDetail.commentLine', { comment: q.manualComment })}
                  </p>
                )}
              </div>
            ) : q.type === 'speaking' ? (
              <div className="mt-2 flex flex-col gap-3 text-sm text-base-black/80">
                {q.speakingAudioData ? (
                  <audio controls src={q.speakingAudioData} className="w-full" />
                ) : (
                  <p className="italic text-base-black/50">{t('teacherAttemptDetail.noRecordingSubmitted')}</p>
                )}
                <div className="rounded-md border border-primary-100 bg-base-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-base-black/50">
                    {t('teacherAttemptDetail.draftTranscriptLabel')}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">
                    {q.speakingTranscript?.trim() ? q.speakingTranscript : <em>{t('teacherAttemptDetail.noTranscript')}</em>}
                  </p>
                </div>
                {q.speakingAiFeedback && (
                  <div className="rounded-md border border-primary-100 bg-primary-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-base-black/50">
                      {t('teacherAttemptDetail.mockAiGradingLabel')}
                    </p>
                    <p className="mt-1">{q.speakingAiFeedback}</p>
                  </div>
                )}
                {q.speakingAudioData ? (
                  <div className="flex flex-wrap items-end gap-3 rounded-md border border-primary-100 bg-primary-50 p-3">
                    <label className="flex flex-col gap-1 text-xs font-medium text-base-black">
                      {t('teacherAttemptDetail.overrideScoreOutOf', { scale: SPEAKING_SCORE_SCALE })}
                      <input
                        type="number"
                        min={0}
                        max={SPEAKING_SCORE_SCALE}
                        value={drafts[q.questionId]?.scoreText ?? ''}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [q.questionId]: { ...prev[q.questionId], scoreText: event.target.value, comment: prev[q.questionId]?.comment ?? '' },
                          }))
                        }
                        className="w-24 rounded-md border border-primary-200 px-2 py-1 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                      />
                    </label>
                    <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-base-black">
                      {t('teacherAttemptDetail.overrideFeedbackOptional')}
                      <input
                        type="text"
                        value={drafts[q.questionId]?.comment ?? ''}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [q.questionId]: { scoreText: prev[q.questionId]?.scoreText ?? '', comment: event.target.value },
                          }))
                        }
                        placeholder={t('teacherAttemptDetail.overrideFeedbackPlaceholder')}
                        className="min-w-[12rem] rounded-md border border-primary-200 px-2 py-1 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => handleSaveGrade(q.questionId, SPEAKING_SCORE_SCALE)}
                      disabled={savingQuestionId === q.questionId || result.status !== 'submitted'}
                      className="rounded-md bg-primary-500 px-4 py-3 text-xs font-semibold sm:py-1.5 text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingQuestionId === q.questionId ? t('teacherAttemptDetail.saving') : t('teacherAttemptDetail.saveOverride')}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-base-black/50">
                    {t('teacherAttemptDetail.nothingToOverrideYet')}
                  </p>
                )}
                {gradingErrors[q.questionId] && (
                  <p className="text-xs text-red-600">{gradingErrors[q.questionId]}</p>
                )}
                {q.manualComment && (
                  <p className="text-xs italic text-base-black/60">
                    {t('teacherAttemptDetail.teacherOverrideCommentLine', { comment: q.manualComment })}
                  </p>
                )}
              </div>
            ) : q.type === 'fillBlank' ? (
              <div className="mt-2 text-sm text-base-black/80">
                <p>
                  {t('teacherAttemptDetail.studentAnswerPrefix')}{' '}
                  {q.textAnswer?.trim() ? q.textAnswer : <em>{t('teacherAttemptDetail.noAnswer')}</em>}
                </p>
                <p>
                  {t('teacherAttemptDetail.acceptedAnswersPrefix')} {q.acceptedAnswers.join(', ')}
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
                      {isSelected && t('teacherAttemptDetail.studentAnswerSuffix')}
                      {choice.isCorrect && t('teacherAttemptDetail.correctAnswerSuffix')}
                    </li>
                  );
                })}
                {!q.selectedChoiceId && <li className="text-base-black/50">{t('teacherAttemptDetail.noAnswerSelected')}</li>}
              </ul>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

export default TeacherAttemptDetailPage;
