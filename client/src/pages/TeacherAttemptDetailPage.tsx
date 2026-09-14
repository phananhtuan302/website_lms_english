import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { AttemptResultDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';

/**
 * Teacher's per-attempt detail (T-014), reachable at `/teacher/attempts/:attemptId`
 * from `TeacherSessionAttemptsPage`. Reuses the exact same `AttemptResultDTO` shape as
 * the student's own result page — see `server/src/lib/attemptView.ts` — since a
 * per-question correct/incorrect breakdown means the same thing to both audiences; only
 * the ownership check differs (teacher must own the test, enforced server-side).
 */
function TeacherAttemptDetailPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const [result, setResult] = useState<AttemptResultDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!attemptId) return;
    teacherApi
      .getAttemptDetail(attemptId)
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load this attempt.'));
  }, [attemptId]);

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
          </>
        ) : (
          <p className="mt-2 text-lg font-semibold text-base-black/60">Still in progress — not yet submitted</p>
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
              {q.isCorrect !== null && (
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold uppercase ${
                    q.isCorrect ? 'bg-green-600 text-base-white' : 'bg-red-600 text-base-white'
                  }`}
                >
                  {q.isCorrect ? 'Correct' : 'Incorrect'}
                </span>
              )}
            </div>

            {q.type === 'fillBlank' ? (
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
