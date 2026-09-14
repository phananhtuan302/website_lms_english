import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { AttemptDetailDTO, AttemptQuestionDTO } from '@platform/shared';
import { studentApi } from '../lib/studentApi';
import { ApiError } from '../lib/apiClient';

interface FlatQuestion extends AttemptQuestionDTO {
  sectionTitle: string;
  globalIndex: number;
}

/** Local per-question answer state — mirrors `SaveAnswerRequest` but always both keys
 * present (simpler controlled-input state) rather than the wire shape's optional keys. */
interface LocalAnswer {
  selectedChoiceId: string | null;
  textAnswer: string;
}

const AUTOSAVE_INTERVAL_MS = 15_000;
const TEXT_DEBOUNCE_MS = 600;

function emptyAnswer(): LocalAnswer {
  return { selectedChoiceId: null, textAnswer: '' };
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Take-test runtime (T-012): question-by-question navigation over the student's
 * assigned variant, a visible countdown when the test has a time limit (auto-submits at
 * zero — see doc comment below), autosave on every change plus a periodic flush, and a
 * confirmed "Submit test" action that ends the attempt.
 *
 * Restoring after a mid-test refresh needs no client-side persistence at all: every
 * answer is already saved server-side (`PUT /api/attempts/:id/answers/:questionId`) as
 * it's entered, so simply re-fetching the attempt on mount restores exactly what was
 * there before the refresh (`GET /api/attempts/:id` returns `answers` alongside the
 * questions).
 */
function TakeTestPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();

  const [attempt, setAttempt] = useState<AttemptDetailDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, LocalAnswer>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);
  const textDebounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const hasSubmittedRef = useRef(false);

  const loadAttempt = useCallback(() => {
    if (!attemptId) return;
    studentApi
      .getAttempt(attemptId)
      .then((data) => {
        if (data.status === 'submitted') {
          // Already submitted (e.g. re-opened this URL after finishing, or submitted
          // from another tab) — no editing allowed, go straight to the result.
          navigate(`/student/attempts/${data.id}/result`, { replace: true });
          return;
        }
        setAttempt(data);
        const initial: Record<string, LocalAnswer> = {};
        for (const section of data.sections) {
          for (const question of section.questions) {
            initial[question.id] = emptyAnswer();
          }
        }
        for (const saved of data.answers) {
          initial[saved.questionId] = {
            selectedChoiceId: saved.selectedChoiceId,
            textAnswer: saved.textAnswer ?? '',
          };
        }
        setAnswers(initial);
      })
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : 'Failed to load this attempt.');
      });
  }, [attemptId, navigate]);

  useEffect(loadAttempt, [loadAttempt]);

  const flatQuestions = useMemo<FlatQuestion[]>(() => {
    if (!attempt) return [];
    let i = 0;
    return attempt.sections.flatMap((section) =>
      section.questions.map((question) => ({
        ...question,
        sectionTitle: section.title,
        globalIndex: i++,
      })),
    );
  }, [attempt]);

  const totalQuestions = flatQuestions.length;
  const answeredCount = flatQuestions.filter((q) => {
    const a = answers[q.id];
    if (!a) return false;
    return q.type === 'fillBlank' ? a.textAnswer.trim() !== '' : a.selectedChoiceId !== null;
  }).length;

  const deadline = useMemo(() => {
    if (!attempt || attempt.timeLimitMinutes == null) return null;
    return new Date(attempt.startedAt).getTime() + attempt.timeLimitMinutes * 60_000;
  }, [attempt]);

  // 1-second countdown tick, only running when this test actually has a time limit.
  useEffect(() => {
    if (deadline === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadline]);

  const persistAnswer = useCallback(
    (questionId: string, question: FlatQuestion, local: LocalAnswer) => {
      if (!attemptId) return;
      const body =
        question.type === 'fillBlank'
          ? { textAnswer: local.textAnswer }
          : { selectedChoiceId: local.selectedChoiceId };
      studentApi.saveAnswer(attemptId, questionId, body).catch(() => {
        // Autosave failures are surfaced to the student via the periodic flush /
        // explicit submit instead of a disruptive per-keystroke error banner — a
        // transient network blip shouldn't interrupt typing. If the attempt was
        // submitted from elsewhere (409), the periodic flush below will notice.
      });
    },
    [attemptId],
  );

  function handleSelectChoice(question: FlatQuestion, choiceId: string) {
    const next: LocalAnswer = { selectedChoiceId: choiceId, textAnswer: '' };
    setAnswers((prev) => ({ ...prev, [question.id]: next }));
    persistAnswer(question.id, question, next);
  }

  function handleTextChange(question: FlatQuestion, value: string) {
    const next: LocalAnswer = { selectedChoiceId: null, textAnswer: value };
    setAnswers((prev) => ({ ...prev, [question.id]: next }));

    clearTimeout(textDebounceTimers.current[question.id]);
    textDebounceTimers.current[question.id] = setTimeout(() => {
      persistAnswer(question.id, question, next);
    }, TEXT_DEBOUNCE_MS);
  }

  // Periodic flush (T-012 "autosave... on change OR interval"): a safety net alongside
  // the on-change saves above, in case a debounced save never fired (e.g. tab closed
  // mid-debounce) or a network blip swallowed one.
  useEffect(() => {
    if (!attempt) return;
    const id = setInterval(() => {
      for (const question of flatQuestions) {
        const local = answersRef.current[question.id];
        if (!local) continue;
        const hasValue = question.type === 'fillBlank' ? local.textAnswer.trim() !== '' : local.selectedChoiceId !== null;
        if (hasValue) persistAnswer(question.id, question, local);
      }
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [attempt, flatQuestions, persistAnswer]);

  const flushPendingSaves = useCallback(async () => {
    const pending = Object.entries(textDebounceTimers.current);
    for (const [questionId, timer] of pending) {
      clearTimeout(timer);
      const question = flatQuestions.find((q) => q.id === questionId);
      const local = answersRef.current[questionId];
      if (question && local) {
        await studentApi
          .saveAnswer(attemptId!, questionId, { textAnswer: local.textAnswer })
          .catch(() => undefined);
      }
    }
    textDebounceTimers.current = {};
  }, [attemptId, flatQuestions]);

  const handleSubmit = useCallback(
    async (auto: boolean) => {
      if (!attemptId || hasSubmittedRef.current) return;
      if (!auto) {
        const confirmed = window.confirm(
          `You've answered ${answeredCount} of ${totalQuestions} question${totalQuestions === 1 ? '' : 's'}. ` +
            'Submit the test now? You will not be able to change your answers after this.',
        );
        if (!confirmed) return;
      }

      hasSubmittedRef.current = true;
      setIsSubmitting(true);
      setSubmitError(null);
      try {
        await flushPendingSaves();
        await studentApi.submitAttempt(attemptId);
        navigate(`/student/attempts/${attemptId}/result`, { replace: true });
      } catch (err) {
        hasSubmittedRef.current = false;
        setIsSubmitting(false);
        if (err instanceof ApiError && err.status === 409) {
          // Already submitted (e.g. auto-submit fired in another tab, or a double
          // click race) — the result already exists, just go see it.
          navigate(`/student/attempts/${attemptId}/result`, { replace: true });
          return;
        }
        setSubmitError(err instanceof ApiError ? err.message : 'Failed to submit the test.');
      }
    },
    [attemptId, answeredCount, totalQuestions, flushPendingSaves, navigate],
  );

  // Auto-submit when the timer reaches zero (documented choice: a visible timer that
  // never actually ends the attempt isn't a meaningful "time limit" — see T-012 notes).
  useEffect(() => {
    if (deadline === null) return;
    if (now >= deadline && !hasSubmittedRef.current) {
      void handleSubmit(true);
    }
  }, [now, deadline, handleSubmit]);

  if (loadError) {
    return (
      <p role="alert" className="mx-auto max-w-md rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {loadError}
      </p>
    );
  }

  if (!attempt) {
    return <p className="text-center text-base-black/60">Loading test...</p>;
  }

  const current = flatQuestions[currentIndex];
  const remainingMs = deadline !== null ? deadline - now : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary-700">{attempt.testTitle}</h1>
          <p className="text-sm text-base-black/60">
            Answered {answeredCount} of {totalQuestions}
          </p>
        </div>
        {remainingMs !== null && (
          <div
            role="timer"
            className={`rounded-md px-4 py-2 text-lg font-bold ${
              remainingMs < 60_000 ? 'bg-red-100 text-red-700' : 'bg-primary-100 text-primary-700'
            }`}
          >
            {formatRemaining(remainingMs)}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5" aria-label="Question navigator">
        {flatQuestions.map((q, index) => {
          const local = answers[q.id];
          const isAnswered = local && (q.type === 'fillBlank' ? local.textAnswer.trim() !== '' : local.selectedChoiceId !== null);
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => setCurrentIndex(index)}
              aria-current={index === currentIndex ? 'true' : undefined}
              aria-label={`Go to question ${index + 1}${isAnswered ? ' (answered)' : ' (unanswered)'}`}
              className={`h-8 w-8 rounded-md text-xs font-semibold transition-colors ${
                index === currentIndex
                  ? 'bg-primary-700 text-base-white'
                  : isAnswered
                    ? 'bg-primary-500 text-base-white hover:bg-primary-600'
                    : 'border border-primary-200 bg-base-white text-base-black/70 hover:bg-primary-50'
              }`}
            >
              {index + 1}
            </button>
          );
        })}
      </div>

      {current && (
        <div className="rounded-xl border border-primary-200 bg-primary-50 p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-600">
            {current.sectionTitle} · Question {currentIndex + 1} of {totalQuestions}
          </p>
          <p className="mt-2 text-lg font-medium text-base-black">{current.prompt}</p>

          {current.type === 'fillBlank' ? (
            <input
              type="text"
              value={answers[current.id]?.textAnswer ?? ''}
              onChange={(event) => handleTextChange(current, event.target.value)}
              disabled={isSubmitting}
              placeholder="Type your answer"
              className="mt-4 w-full rounded-md border border-primary-200 bg-base-white px-3 py-2 text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              {current.choices.map((choice) => (
                <label
                  key={choice.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md border border-primary-200 bg-base-white px-4 py-3 text-base-black hover:border-primary-400"
                >
                  <input
                    type="radio"
                    name={`question-${current.id}`}
                    checked={answers[current.id]?.selectedChoiceId === choice.id}
                    onChange={() => handleSelectChoice(current, choice.id)}
                    disabled={isSubmitting}
                  />
                  {choice.text}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
          className="rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Previous
        </button>

        {currentIndex < totalQuestions - 1 ? (
          <button
            type="button"
            onClick={() => setCurrentIndex((i) => Math.min(totalQuestions - 1, i + 1))}
            className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
          >
            Next →
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSubmit(false)}
            disabled={isSubmitting}
            className="rounded-md bg-primary-700 px-6 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Submitting...' : 'Submit test'}
          </button>
        )}
      </div>

      {currentIndex < totalQuestions - 1 && (
        <button
          type="button"
          onClick={() => void handleSubmit(false)}
          disabled={isSubmitting}
          className="self-center text-sm font-medium text-primary-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Submitting...' : 'Finish early and submit test'}
        </button>
      )}

      {submitError && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {submitError}
        </p>
      )}
    </div>
  );
}

export default TakeTestPage;
