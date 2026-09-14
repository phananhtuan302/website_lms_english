import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SPEAKING_SCORE_SCALE, type AttemptResultDTO } from '@platform/shared';
import { studentApi } from '../lib/studentApi';
import { ApiError } from '../lib/apiClient';

/**
 * Student's own result view (T-014), reachable at `/student/attempts/:attemptId/result`
 * once an attempt has been submitted (T-013 grades it at submit time). The server's
 * `GET /api/attempts/:attemptId/result` only ever returns the CALLING student's own
 * attempt (404 otherwise) — see `attempts.routes.ts` — so there's no separate
 * client-side ownership check needed here.
 */
function AttemptResultPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const [result, setResult] = useState<AttemptResultDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!attemptId) return;
    studentApi
      .getResult(attemptId)
      .then(setResult)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Failed to load this result.'),
      );
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
    return <p className="text-center text-base-black/60">Loading result...</p>;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="rounded-xl border border-primary-200 bg-primary-50 p-6 text-center">
        <h1 className="text-xl font-bold text-primary-700">{result.testTitle}</h1>
        <p className="mt-2 text-4xl font-bold text-primary-700">{result.scorePercent}%</p>
        <p className="mt-1 text-sm text-base-black/70">
          {result.correctCount} out of {result.totalCount} correct
        </p>
        <p className="mt-1 text-xs text-base-black/50">
          Submitted {result.submittedAt ? new Date(result.submittedAt).toLocaleString() : ''}
          {result.timeTakenSeconds !== null &&
            ` · Time taken: ${Math.floor(result.timeTakenSeconds / 60)}:${String(result.timeTakenSeconds % 60).padStart(2, '0')}`}
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-base-black">Question review</h2>
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
                Q{q.order}. {q.prompt}
              </p>
              {q.type === 'essay' ? (
                <span className="shrink-0 rounded-full bg-primary-200 px-3 py-1 text-xs font-bold uppercase text-primary-800">
                  {q.manualScore != null ? `${q.manualScore} / ${q.essayMaxScore}` : 'Awaiting grading'}
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
                      : 'Not yet submitted'}
                </span>
              ) : (
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold uppercase ${
                    q.isCorrect ? 'bg-green-600 text-base-white' : 'bg-red-600 text-base-white'
                  }`}
                >
                  {q.isCorrect ? 'Correct' : 'Incorrect'}
                </span>
              )}
            </div>

            {q.type === 'essay' ? (
              <div className="mt-2 flex flex-col gap-2 text-sm text-base-black/80">
                <div className="whitespace-pre-wrap rounded-md border border-primary-100 bg-primary-50 p-3">
                  {q.textAnswer?.trim() ? q.textAnswer : <em>(no answer submitted)</em>}
                </div>
                {q.manualComment && (
                  <p className="text-xs italic text-base-black/60">
                    Teacher&apos;s comment: {q.manualComment}
                  </p>
                )}
                {q.manualScore == null && (
                  <p className="text-xs text-base-black/50">
                    Your teacher hasn&apos;t graded this essay yet.
                  </p>
                )}
              </div>
            ) : q.type === 'speaking' ? (
              <div className="mt-2 flex flex-col gap-2 text-sm text-base-black/80">
                {q.speakingAudioData ? (
                  <audio controls src={q.speakingAudioData} className="w-full" />
                ) : (
                  <p className="italic text-base-black/50">(you did not submit a recording for this question)</p>
                )}
                {/* Teacher override wins once present (T-055); otherwise show the
                    AI/mock feedback (T-054) — same "teacher value wins" rule as the
                    score badge above. */}
                {(q.manualComment ?? q.speakingAiFeedback) && (
                  <p className="rounded-md border border-primary-100 bg-primary-50 p-3 text-xs text-base-black/70">
                    {q.manualComment ? 'Teacher’s feedback: ' : 'Feedback: '}
                    {q.manualComment ?? q.speakingAiFeedback}
                  </p>
                )}
                {q.speakingAudioData && q.manualScore == null && q.speakingAiScore == null && (
                  <p className="text-xs text-base-black/50">This recording hasn&apos;t been graded yet.</p>
                )}
              </div>
            ) : q.type === 'fillBlank' ? (
              <div className="mt-2 text-sm text-base-black/80">
                <p>Your answer: {q.textAnswer?.trim() ? q.textAnswer : <em>(no answer)</em>}</p>
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
                      {isSelected && ' (your answer)'}
                      {choice.isCorrect && ' (correct answer)'}
                    </li>
                  );
                })}
                {!q.selectedChoiceId && (
                  <li className="text-base-black/50">(no answer selected)</li>
                )}
              </ul>
            )}
          </div>
        ))}
      </section>

      <Link
        to="/student/dashboard"
        className="self-center text-sm font-medium text-primary-600 hover:underline"
      >
        ← Back to dashboard
      </Link>
    </div>
  );
}

export default AttemptResultPage;
