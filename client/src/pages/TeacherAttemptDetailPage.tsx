import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { AttemptResultDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';

/** Local draft state for one essay question's manual-grading form (T-042) — kept
 * separate from `result` so an in-progress edit doesn't get clobbered by a re-render,
 * same "own local draft, save on explicit action" pattern as `QuestionEditor.tsx`. */
interface EssayDraft {
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
 * Extended by T-042 (manual essay grading — score + comment form per essay question)
 * and T-044 (a tab-switch summary banner, since this is also where a teacher reviews
 * integrity signals for one attempt after the fact).
 */
function TeacherAttemptDetailPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const [result, setResult] = useState<AttemptResultDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, EssayDraft>>({});
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
          }
          return next;
        });
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load this attempt.'));
  }, [attemptId]);

  useEffect(loadResult, [loadResult]);

  async function handleSaveGrade(questionId: string, maxScore: number | null) {
    if (!attemptId) return;
    const draft = drafts[questionId];
    const score = Number(draft?.scoreText);
    if (!draft || draft.scoreText.trim() === '' || Number.isNaN(score) || score < 0 || (maxScore != null && score > maxScore)) {
      setGradingErrors((prev) => ({
        ...prev,
        [questionId]: `Score must be a number between 0 and ${maxScore ?? '?'}.`,
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
        [questionId]: err instanceof ApiError ? err.message : 'Failed to save this grade.',
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
    return <p className="text-center text-base-black/60">Loading...</p>;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <button type="button" onClick={() => navigate(-1)} className="self-start text-sm text-primary-600 hover:underline">
        ← Back to attempts
      </button>

      <div className="rounded-xl border border-primary-200 bg-primary-50 p-6 text-center">
        <h1 className="text-xl font-bold text-primary-700">{result.testTitle}</h1>
        <p className="mt-1 text-sm text-base-black/70">{result.studentName}</p>
        {result.status === 'submitted' ? (
          <>
            <p className="mt-2 text-4xl font-bold text-primary-700">{result.scorePercent}%</p>
            <p className="mt-1 text-sm text-base-black/70">
              {result.correctCount} out of {result.totalCount} correct
            </p>
            {result.timeTakenSeconds !== null && (
              <p className="mt-1 text-xs text-base-black/50">
                Time taken: {Math.floor(result.timeTakenSeconds / 60)}:
                {String(result.timeTakenSeconds % 60).padStart(2, '0')}
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-lg font-semibold text-base-black/60">Still in progress — not yet submitted</p>
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
              Tab switch / window exit detected {result.tabSwitchCount} time
              {result.tabSwitchCount === 1 ? '' : 's'} during this attempt.
            </p>
            <p className="mt-1 text-xs text-red-700/80">
              {result.tabSwitchLog.map((ts) => new Date(ts).toLocaleTimeString()).join(', ')}
            </p>
          </>
        ) : (
          <p>No tab switches or window exits were detected during this attempt.</p>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-base-black">Question review</h2>
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
                Q{q.order}. {q.prompt}
              </p>
              {q.type === 'essay' ? (
                <span className="shrink-0 rounded-full bg-primary-200 px-3 py-1 text-xs font-bold uppercase text-primary-800">
                  {q.manualScore != null ? `${q.manualScore} / ${q.essayMaxScore}` : 'Not graded yet'}
                </span>
              ) : (
                q.isCorrect !== null && (
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold uppercase ${
                      q.isCorrect ? 'bg-green-600 text-base-white' : 'bg-red-600 text-base-white'
                    }`}
                  >
                    {q.isCorrect ? 'Correct' : 'Incorrect'}
                  </span>
                )
              )}
            </div>

            {q.type === 'essay' ? (
              <div className="mt-2 flex flex-col gap-3 text-sm text-base-black/80">
                <div className="whitespace-pre-wrap rounded-md border border-primary-100 bg-base-white p-3">
                  {q.textAnswer?.trim() ? q.textAnswer : <em>(no answer submitted)</em>}
                </div>
                <div className="flex flex-wrap items-end gap-3 rounded-md border border-primary-100 bg-primary-50 p-3">
                  <label className="flex flex-col gap-1 text-xs font-medium text-base-black">
                    Score (out of {q.essayMaxScore})
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
                    Comment (optional)
                    <input
                      type="text"
                      value={drafts[q.questionId]?.comment ?? ''}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [q.questionId]: { scoreText: prev[q.questionId]?.scoreText ?? '', comment: event.target.value },
                        }))
                      }
                      placeholder="Feedback for the student"
                      className="min-w-[12rem] rounded-md border border-primary-200 px-2 py-1 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => handleSaveGrade(q.questionId, q.essayMaxScore)}
                    disabled={savingQuestionId === q.questionId || result.status !== 'submitted'}
                    className="rounded-md bg-primary-500 px-4 py-1.5 text-xs font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingQuestionId === q.questionId ? 'Saving...' : 'Save grade'}
                  </button>
                </div>
                {gradingErrors[q.questionId] && (
                  <p className="text-xs text-red-600">{gradingErrors[q.questionId]}</p>
                )}
                {q.manualComment && (
                  <p className="text-xs italic text-base-black/60">Comment: {q.manualComment}</p>
                )}
              </div>
            ) : q.type === 'fillBlank' ? (
              <div className="mt-2 text-sm text-base-black/80">
                <p>Student&apos;s answer: {q.textAnswer?.trim() ? q.textAnswer : <em>(no answer)</em>}</p>
                <p>Accepted answer(s): {q.acceptedAnswers.join(', ')}</p>
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
                      {isSelected && " (student's answer)"}
                      {choice.isCorrect && ' (correct answer)'}
                    </li>
                  );
                })}
                {!q.selectedChoiceId && <li className="text-base-black/50">(no answer selected)</li>}
              </ul>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

export default TeacherAttemptDetailPage;
