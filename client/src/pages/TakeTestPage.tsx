import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import type { AttemptDetailDTO, AttemptQuestionDTO, LiveAudioPlayEventDTO } from '@platform/shared';
import { studentApi } from '../lib/studentApi';
import { ApiError } from '../lib/apiClient';
import { createSessionSocket } from '../lib/socket';

/** Reading (T-039) / Listening (T-040/T-041) content, denormalized from the enclosing
 * section onto every question in it — same "carry the section field down" pattern
 * already used for `sectionTitle` below, since the take-test runtime navigates a FLAT
 * question list, not a section tree. */
interface FlatQuestion extends AttemptQuestionDTO {
  sectionId: string;
  sectionTitle: string;
  sectionPassageText: string | null;
  sectionPassageImageUrl: string | null;
  sectionAudioUrl: string | null;
  sectionMaxPlayCount: number | null;
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

/** `fillBlank` and `essay` (T-042) both store their answer as plain `textAnswer` rather
 * than `selectedChoiceId` — every "is this question answered / what do I persist" check
 * in this file branches on this shared predicate instead of re-listing both types. */
function isFreeTextType(type: AttemptQuestionDTO['type']): boolean {
  return type === 'fillBlank' || type === 'essay';
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

  // --- Anti-copy-paste on essay answers (T-043) -------------------------------------
  const [pasteWarning, setPasteWarning] = useState<string | null>(null);
  const pasteWarningTimer = useRef<ReturnType<typeof setTimeout>>();

  // --- Global tab-switch / exit detection (T-044) -----------------------------------
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [tabSwitchNotice, setTabSwitchNotice] = useState<string | null>(null);
  const tabSwitchNoticeTimer = useRef<ReturnType<typeof setTimeout>>();

  // --- Listening playback (T-040 standalone / T-041 live) ---------------------------
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playCounts, setPlayCounts] = useState<Record<string, number>>({});

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

  // --- Global tab-switch / exit detection (T-044) -----------------------------------
  // Implemented ONCE here in the shared take-test runtime (Guiding Principle 5) so every
  // test type — objective, Reading, Listening, Writing, Vocabulary Check, Mock Test —
  // gets this automatically, with no per-content-type wiring. `visibilitychange` catches
  // switching tabs/apps or minimizing; `blur` additionally catches e.g. alt-tabbing to
  // another window that doesn't change document.visibilityState on every OS/browser.
  // Only armed while an attempt is actually in progress (not before load, not after
  // submit) — `hasSubmittedRef` guards the moment right around submit itself. Recording
  // is best-effort from the student's point of view (a failed POST never blocks them),
  // but every successful call durably increments the server-side count/log
  // (`POST /api/attempts/:id/tab-switch`) that the teacher sees afterward.
  useEffect(() => {
    if (!attemptId || !attempt || attempt.status !== 'inProgress') return undefined;

    function recordTabSwitch() {
      if (hasSubmittedRef.current) return;
      setTabSwitchCount((count) => count + 1);
      setTabSwitchNotice('Tab switch detected — this has been recorded for your teacher.');
      clearTimeout(tabSwitchNoticeTimer.current);
      tabSwitchNoticeTimer.current = setTimeout(() => setTabSwitchNotice(null), 6000);
      studentApi.recordTabSwitch(attemptId!).catch(() => undefined);
    }

    function handleVisibilityChange() {
      if (document.hidden) recordTabSwitch();
    }
    function handleBlur() {
      recordTabSwitch();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      clearTimeout(tabSwitchNoticeTimer.current);
    };
  }, [attemptId, attempt]);

  const flatQuestions = useMemo<FlatQuestion[]>(() => {
    if (!attempt) return [];
    let i = 0;
    return attempt.sections.flatMap((section) =>
      section.questions.map((question) => ({
        ...question,
        sectionId: section.id,
        sectionTitle: section.title,
        sectionPassageText: section.passageText,
        sectionPassageImageUrl: section.passageImageUrl,
        sectionAudioUrl: section.audioUrl,
        sectionMaxPlayCount: section.maxPlayCount,
        globalIndex: i++,
      })),
    );
  }, [attempt]);

  const totalQuestions = flatQuestions.length;
  const answeredCount = flatQuestions.filter((q) => {
    const a = answers[q.id];
    if (!a) return false;
    return isFreeTextType(q.type) ? a.textAnswer.trim() !== '' : a.selectedChoiceId !== null;
  }).length;

  // --- Live progress relay (T-016) --------------------------------------------------
  // T-015 built the server-side room/relay; this is the missing student-side emitter.
  // Connects once the attempt (and therefore its `sessionId`) is known, joins that
  // session's realtime layer via `student:join`, then re-emits `student:progress`
  // whenever the student moves to a different question or answers one — coarse enough
  // to not spam the socket per keystroke, fine enough for a teacher's live dashboard to
  // feel real-time. Entirely best-effort: a failed/slow socket never blocks or shows an
  // error in the take-test UI, since the student's actual answers are already safe via
  // the REST autosave above regardless of whether this succeeds.
  const socketRef = useRef<Socket | null>(null);
  const [isProgressSocketJoined, setIsProgressSocketJoined] = useState(false);

  // --- Teacher-controlled synchronized Listening playback (T-041) -------------------
  // Only ever fires during a `live` session (nothing broadcasts `audio:play` for a
  // `selfPractice` session — see `sessionRealtime.ts`'s `teacher:playAudio` handler) —
  // captured here as the raw last-received event; the effect below decides whether it
  // applies to whatever section the student is currently viewing.
  const [lastAudioPlayEvent, setLastAudioPlayEvent] = useState<LiveAudioPlayEventDTO | null>(null);

  useEffect(() => {
    if (!attempt) return undefined;

    let cancelled = false;
    const socket = createSessionSocket();
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('student:join', { sessionId: attempt.sessionId }, (ack: { ok: boolean }) => {
        if (!cancelled) {
          setIsProgressSocketJoined(ack?.ok === true);
        }
      });
    });
    // A reconnect (network blip) needs to re-join — T-015's server keys progress by
    // studentId, so re-joining overwrites the same entry rather than duplicating it.
    socket.io.on('reconnect', () => {
      socket.emit('student:join', { sessionId: attempt.sessionId }, (ack: { ok: boolean }) => {
        if (!cancelled) {
          setIsProgressSocketJoined(ack?.ok === true);
        }
      });
    });

    socket.on('audio:play', (payload: LiveAudioPlayEventDTO) => {
      if (!cancelled) setLastAudioPlayEvent(payload);
    });

    return () => {
      cancelled = true;
      socket.disconnect();
      socketRef.current = null;
      setIsProgressSocketJoined(false);
    };
    // Deliberately keyed on `attempt` (not `attempt.sessionId`) so eslint's
    // exhaustive-deps rule is satisfied without over-triggering in practice — `attempt`
    // is only ever set once per page load (see `loadAttempt` above), so this still
    // connects exactly once per mount.
  }, [attempt]);

  useEffect(() => {
    if (!isProgressSocketJoined || totalQuestions === 0) return;
    socketRef.current?.emit('student:progress', { currentQuestionIndex: currentIndex, answeredCount });
  }, [isProgressSocketJoined, currentIndex, answeredCount, totalQuestions]);

  // Plays the shared <audio> element when a `teacher:playAudio` broadcast arrives for
  // whichever section the student is CURRENTLY viewing. If the teacher plays a section
  // the student has since navigated away from, this deliberately does nothing for
  // it — there is no queued/backlog playback, matching "plays live, together" rather
  // than "guarantees every student eventually hears it regardless of where they are".
  useEffect(() => {
    if (!lastAudioPlayEvent) return;
    const currentSectionId = flatQuestions[currentIndex]?.sectionId;
    if (currentSectionId === lastAudioPlayEvent.sectionId) {
      audioRef.current?.play().catch(() => undefined);
    }
  }, [lastAudioPlayEvent, flatQuestions, currentIndex]);

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
      const body = isFreeTextType(question.type)
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
        const hasValue = isFreeTextType(question.type) ? local.textAnswer.trim() !== '' : local.selectedChoiceId !== null;
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

  // --- Anti-copy-paste on essay answers (T-043) -------------------------------------
  // Intercepts `paste` (content is NOT inserted — `preventDefault` stops the browser's
  // default paste behavior before it ever reaches the textarea's value) and disables
  // copy/cut OUT of the field, each showing a visible warning. Normal typing is
  // completely unaffected — this only hooks `paste`/`copy`/`cut`, never `keydown`/
  // `input`. Verified with simulated `ClipboardEvent`s in the Playwright pass for this
  // batch (T-043's acceptance criteria: "verified via a simulated paste/copy event in an
  // automated test, not just manual inspection").
  function handleEssayBlocked(action: 'paste' | 'copy' | 'cut', event: React.ClipboardEvent) {
    event.preventDefault();
    setPasteWarning(
      action === 'paste'
        ? 'Pasting into this answer is not allowed. Please type your answer yourself.'
        : 'Copying text out of this answer is not allowed.',
    );
    clearTimeout(pasteWarningTimer.current);
    pasteWarningTimer.current = setTimeout(() => setPasteWarning(null), 5000);
  }

  // --- Listening playback (T-040 standalone) ----------------------------------------
  function handlePlayAudio(question: FlatQuestion) {
    const el = audioRef.current;
    if (!el) return;
    // `.play()` rejects (e.g. `NotSupportedError`) for a placeholder URL that doesn't
    // resolve to real audio (see `Section.audioUrl`'s doc comment) — always caught, same
    // as the live-broadcast listener below, so this never surfaces as an unhandled
    // promise rejection in the browser console.
    el.play().catch(() => undefined);
    setPlayCounts((prev) => ({ ...prev, [question.sectionId]: (prev[question.sectionId] ?? 0) + 1 }));
  }

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
          const isAnswered = local && (isFreeTextType(q.type) ? local.textAnswer.trim() !== '' : local.selectedChoiceId !== null);
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

      {tabSwitchNotice && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {tabSwitchNotice} (count: {tabSwitchCount})
        </p>
      )}

      {current && (
        <div className="rounded-xl border border-primary-200 bg-primary-50 p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-600">
            {current.sectionTitle} · Question {currentIndex + 1} of {totalQuestions}
          </p>

          {/* Reading passage (T-039) — shared context for every question in this section. */}
          {current.sectionPassageText && (
            <div className="mt-3 rounded-lg border border-primary-200 bg-base-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-base-black/50">
                Reading passage
              </p>
              {current.sectionPassageImageUrl && (
                <img
                  src={current.sectionPassageImageUrl}
                  alt="Reading passage illustration"
                  className="mt-2 max-h-64 rounded-md border border-primary-100 object-contain"
                />
              )}
              <p className="mt-2 whitespace-pre-wrap text-sm text-base-black/90">
                {current.sectionPassageText}
              </p>
            </div>
          )}

          {/* Listening audio (T-040 standalone / T-041 live) — shared context for every
              question in this section. */}
          {current.sectionAudioUrl && (
            <div className="mt-3 rounded-lg border border-primary-200 bg-base-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-base-black/50">
                Listening audio
              </p>
              {/* Hidden native controls in BOTH modes: standalone uses the custom Play
                  button below (so `maxPlayCount` can actually be enforced — a native
                  scrubber would let a student replay endlessly regardless of the limit);
                  live uses no student-facing controls at all (T-041). */}
              {/* `preload="none"`: don't fetch the clip just because the student scrolled
                  to this question — only when playback is actually requested (either the
                  standalone Play button below, or a live `audio:play` broadcast). Also
                  what makes "did the client actually start playing" reliably observable
                  as a fresh network request at the moment of play, not one that already
                  happened speculatively on mount. */}
              <audio ref={audioRef} src={current.sectionAudioUrl} preload="none" className="hidden" />
              {attempt.sessionMode === 'live' ? (
                <p className="mt-2 text-sm text-base-black/70">
                  Your teacher controls audio playback for this section during a live session. It
                  will play automatically here when they press Play.
                </p>
              ) : (
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handlePlayAudio(current)}
                    disabled={
                      current.sectionMaxPlayCount != null &&
                      (playCounts[current.sectionId] ?? 0) >= current.sectionMaxPlayCount
                    }
                    className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    ▶ Play audio
                  </button>
                  <span className="text-xs text-base-black/60">
                    {current.sectionMaxPlayCount != null
                      ? `Played ${playCounts[current.sectionId] ?? 0} of ${current.sectionMaxPlayCount} times`
                      : `Played ${playCounts[current.sectionId] ?? 0} time(s) — unlimited plays`}
                  </span>
                </div>
              )}
            </div>
          )}

          <p className="mt-4 text-lg font-medium text-base-black">{current.prompt}</p>

          {current.type === 'essay' ? (
            <div className="mt-4">
              <textarea
                value={answers[current.id]?.textAnswer ?? ''}
                onChange={(event) => handleTextChange(current, event.target.value)}
                onPaste={(event) => handleEssayBlocked('paste', event)}
                onCopy={(event) => handleEssayBlocked('copy', event)}
                onCut={(event) => handleEssayBlocked('cut', event)}
                disabled={isSubmitting}
                rows={10}
                placeholder="Write your response here (pasting is disabled — please type your own answer)."
                className="w-full rounded-md border border-primary-200 bg-base-white px-3 py-2 text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
              <p className="mt-1 text-xs text-base-black/50">
                {current.essayMaxScore != null && `Graded manually by your teacher, out of ${current.essayMaxScore} points. `}
                Copy/paste is disabled on this field.
              </p>
              {pasteWarning && (
                <p role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {pasteWarning}
                </p>
              )}
            </div>
          ) : current.type === 'fillBlank' ? (
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
