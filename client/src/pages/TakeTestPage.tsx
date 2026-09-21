import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Socket } from 'socket.io-client';
import type { AttemptDetailDTO, AttemptQuestionDTO, LiveAudioPlayEventDTO } from '@platform/shared';
import { studentApi } from '../lib/studentApi';
import { ApiError } from '../lib/apiClient';
import { createSessionSocket } from '../lib/socket';
import { useAttemptLock } from '../context/useAttemptLock';

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
  const { t } = useTranslation();
  // T-091: the take-test runtime is the ONE place that knows the instant an attempt
  // stops being `inProgress` (a successful submit), so it proactively clears the lock
  // itself rather than letting `AttemptLockContext`'s route-change re-check catch up —
  // see `handleSubmit` below for the race condition this avoids.
  const { clearLock } = useAttemptLock();

  const [attempt, setAttempt] = useState<AttemptDetailDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, LocalAnswer>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // --- Anti-copy-paste on essay answers (T-043) -------------------------------------
  // Stores which kind of blocked action last happened (not the translated message
  // itself), so the warning shown below is always resolved via `t()` at render time.
  const [pasteWarning, setPasteWarning] = useState<'paste' | 'copy' | null>(null);
  const pasteWarningTimer = useRef<ReturnType<typeof setTimeout>>();

  // --- Global tab-switch / exit detection (T-044) -----------------------------------
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  // Boolean flag rather than the message text itself — `recordTabSwitch` below reads
  // `tabSwitchCount` via the functional `setTabSwitchCount` updater (to avoid a stale
  // closure, since this effect only re-subscribes on `[attemptId, attempt]`), so the
  // up-to-date count for the message is only reliably available at render time via `t()`.
  const [tabSwitchNotice, setTabSwitchNotice] = useState(false);
  const tabSwitchNoticeTimer = useRef<ReturnType<typeof setTimeout>>();

  // --- Listening playback (T-040 standalone / T-041 live) ---------------------------
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playCounts, setPlayCounts] = useState<Record<string, number>>({});

  // --- Speaking recording + AI grading (T-052/T-053/T-054) --------------------------
  // `speakingDeadlinesRef`: the countdown deadline (ms epoch) for each `speaking`
  // question, set once the student first reaches it (not reset by navigating away and
  // back — see the effect below). A plain ref, not `useState` — nothing needs to
  // re-render WHEN a deadline is armed (only the once-per-second `now` tick below drives
  // the visible countdown), so latching it via a ref avoids a pointless "setState
  // derived from other state" effect. `speakingStatus`: per-question lifecycle, restored
  // to `submitted` on load for any question the student already finished (locks
  // re-recording, mirrors the server-side `speakingSubmittedAt` lock in
  // `attempts.routes.ts`).
  const speakingDeadlinesRef = useRef<Record<string, number>>({});
  const [speakingStatus, setSpeakingStatus] = useState<
    Record<string, 'recording' | 'submitting' | 'submitted' | 'error'>
  >({});
  const [speakingResults, setSpeakingResults] = useState<
    Record<string, { aiScore: number; aiFeedback: string }>
  >({});
  const [speakingError, setSpeakingError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  // `any` — the Web Speech API's `SpeechRecognition` type isn't in the default DOM lib
  // and is prefixed (`webkitSpeechRecognition`) in Chrome; feature-detected below, never
  // assumed present (T-053's "browser doesn't support it" fallback).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const speechRecognitionRef = useRef<any>(null);
  const speakingTranscriptRef = useRef<Record<string, string>>({});

  const speechApiSupported = useMemo(
    () =>
      typeof window !== 'undefined' &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition),
    [],
  );

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
          // from another tab) — no editing allowed, go straight to the result. Also
          // clears the lock (T-091) proactively, same reasoning as `handleSubmit`
          // below: don't wait on the route-change re-check to notice this attempt is
          // no longer `inProgress` before navigating off of it.
          clearLock();
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

        // Speaking (T-052–T-054): restore the "already submitted, locked" state for any
        // question the student finished before a mid-test refresh — the server is the
        // source of truth for the lock (`speakingSubmittedAt`), this just mirrors it
        // into the UI so re-recording isn't offered for something already graded.
        const restoredSpeakingStatus: Record<string, 'submitted'> = {};
        for (const saved of data.answers) {
          if (saved.speakingSubmittedAt) {
            restoredSpeakingStatus[saved.questionId] = 'submitted';
          }
        }
        setSpeakingStatus(restoredSpeakingStatus);
      })
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : t('takeTest.loadAttemptError'));
      });
  }, [attemptId, navigate, t, clearLock]);

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
      setTabSwitchNotice(true);
      clearTimeout(tabSwitchNoticeTimer.current);
      tabSwitchNoticeTimer.current = setTimeout(() => setTabSwitchNotice(false), 6000);
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

  // Speaking (T-052–T-054) is "answered" once its recording has been submitted+graded
  // (`speakingStatus`), never via the shared `answers` map — a speaking question never
  // writes `selectedChoiceId`/`textAnswer` at all.
  function isQuestionAnswered(q: FlatQuestion): boolean {
    if (q.type === 'speaking') return speakingStatus[q.id] === 'submitted';
    const a = answers[q.id];
    if (!a) return false;
    return isFreeTextType(q.type) ? a.textAnswer.trim() !== '' : a.selectedChoiceId !== null;
  }

  const answeredCount = flatQuestions.filter(isQuestionAnswered).length;

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

  // Whether ANY question in this test is a timed Speaking question — a stable,
  // structural check (doesn't change once the attempt loads) used only to decide
  // whether the countdown tick below needs to run at all.
  const hasTimedSpeakingQuestion = flatQuestions.some(
    (q) => q.type === 'speaking' && q.allowedResponseSeconds != null,
  );

  // 1-second countdown tick — runs when this test has an overall time limit AND/OR
  // contains at least one timed `speaking` question (T-052).
  useEffect(() => {
    if (deadline === null && !hasTimedSpeakingQuestion) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadline, hasTimedSpeakingQuestion]);

  // Latches question `q`'s response-window deadline into `speakingDeadlinesRef` the
  // first time the student reaches it (T-052 "when a student reaches it during a
  // test") — a no-op if already set. Deliberately does NOT reset if they navigate away
  // and back — the deadline ticks down in the background regardless of which question
  // is currently displayed, so a student can't "pause" their Speaking time budget by
  // switching questions. A plain ref mutation, not a state update, so this effect never
  // itself triggers a re-render — the visible countdown updates via the `now` tick above.
  useEffect(() => {
    const q = flatQuestions[currentIndex];
    if (!q || q.type !== 'speaking' || q.allowedResponseSeconds == null) return;
    if (speakingStatus[q.id] === 'submitted') return;
    if (speakingDeadlinesRef.current[q.id] == null) {
      speakingDeadlinesRef.current[q.id] = Date.now() + q.allowedResponseSeconds * 1000;
      // T-064: tell the server this question's window has started too — it's the
      // server-side anchor `speaking-answer` checks against, since the client countdown
      // alone is spoofable (a direct API call has no deadline to respect otherwise).
      // Fire-and-forget: a transient failure here just means this attempt at recording
      // may later be rejected as "window never started," same as if the student had
      // somehow skipped viewing the question — not a reason to block the UI.
      if (attemptId) {
        studentApi.startSpeakingWindow(attemptId, q.id).catch(() => undefined);
      }
    }
  }, [attemptId, currentIndex, flatQuestions, speakingStatus]);

  // Enforces the Speaking countdown at expiry (T-052): auto-stops an in-progress
  // recording (which submits whatever was captured so far via `MediaRecorder.onstop` ->
  // `finishRecording`), or auto-advances past a question the student never started
  // recording for. Only acts on whichever speaking question is CURRENTLY displayed —
  // documented scope choice: if the student navigates away before starting to record
  // and the deadline passes while they're viewing a different question, nothing fires
  // until they return to it (at which point it immediately auto-advances again, since
  // there's nothing to stop). Recording itself is never silently abandoned this way,
  // because navigation is disabled while a recording is in progress (`isAnyRecording`
  // below) — a student can't leave an active recording running unattended.
  //
  // The actual `setCurrentIndex` call is deferred one tick (`setTimeout(..., 0)`)
  // rather than called directly in the effect body — this is genuinely reacting to an
  // external clock ticking (`now`), not recomputing state from other state, but is
  // deferred anyway so it reads (and lints) as "a callback responding to an external
  // event" per this file's existing `handleSubmit`-from-an-effect convention.
  useEffect(() => {
    const q = flatQuestions[currentIndex];
    if (!q || q.type !== 'speaking') return;
    const deadlineForQuestion = speakingDeadlinesRef.current[q.id];
    if (deadlineForQuestion == null || now < deadlineForQuestion) return;
    const status = speakingStatus[q.id];
    if (status === 'recording') {
      stopRecording(q);
    } else if (status !== 'submitting' && status !== 'submitted' && status !== 'error') {
      const timer = setTimeout(() => {
        setCurrentIndex((i) => Math.min(totalQuestions - 1, i + 1));
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [now, currentIndex, flatQuestions, speakingStatus, totalQuestions]);

  // Releases the microphone if the student navigates away from the page mid-recording
  // (e.g. closes the tab) — a safety net alongside the navigation lock below, which
  // prevents this in the normal in-app flow.
  useEffect(() => {
    return () => {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const isAnySpeakingRecording = Object.values(speakingStatus).includes('recording');

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
    setPasteWarning(action === 'paste' ? 'paste' : 'copy');
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

  // --- Speaking recording + AI grading (T-052/T-053/T-054) --------------------------

  function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error(t('takeTest.audioReadError')));
      reader.readAsDataURL(blob);
    });
  }

  /** Sends the finished recording + whatever draft transcript was captured to the
   * server for AI grading (T-054). Called from the `MediaRecorder`'s `onstop` handler,
   * so it fires whether recording was stopped manually or by the countdown expiring. */
  async function finishRecording(question: FlatQuestion) {
    setSpeakingStatus((prev) => ({ ...prev, [question.id]: 'submitting' }));
    try {
      const blob = new Blob(recordedChunksRef.current, {
        type: mediaRecorderRef.current?.mimeType || 'audio/webm',
      });
      const audioData = await blobToDataUrl(blob);
      const transcript = speakingTranscriptRef.current[question.id] ?? '';
      const result = await studentApi.submitSpeakingAnswer(attemptId!, question.id, {
        audioData,
        transcript,
      });
      setSpeakingResults((prev) => ({
        ...prev,
        [question.id]: { aiScore: result.aiScore, aiFeedback: result.aiFeedback },
      }));
      setSpeakingStatus((prev) => ({ ...prev, [question.id]: 'submitted' }));
    } catch (err) {
      setSpeakingStatus((prev) => ({ ...prev, [question.id]: 'error' }));
      setSpeakingError(
        err instanceof ApiError ? err.message : t('takeTest.speakingSubmitError'),
      );
    }
  }

  /** Stops the active recording (manual "Stop & submit" click, or the countdown expiry
   * effect below) — always releases the microphone stream and, if running, the Web
   * Speech API session, regardless of which triggered it. The `MediaRecorder`'s own
   * `onstop` handler (registered in `startRecording`, closed over the same question)
   * is what actually calls `finishRecording` — this function only ever needs to know
   * WHICH recorder/stream/recognizer to tear down, never which question, since only one
   * can ever be active at a time (navigation is locked while recording, see
   * `isAnySpeakingRecording`). */
  function stopRecording(_question: FlatQuestion) {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {
        // Best-effort — an already-stopped/errored recognizer throwing here should
        // never block finishing the recording.
      }
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }

  /** Starts recording a Speaking answer (T-053): requests the microphone, starts a
   * `MediaRecorder`, and — if the browser supports it (feature-detected, T-053's
   * "submitting still works... rather than failing") — starts a Web Speech API session
   * in parallel to build a draft transcript. Recording itself never depends on speech
   * recognition succeeding or even existing. */
  async function startRecording(question: FlatQuestion) {
    setSpeakingError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        void finishRecording(question);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setSpeakingStatus((prev) => ({ ...prev, [question.id]: 'recording' }));

      speakingTranscriptRef.current[question.id] = '';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognitionCtor) {
        const recognition = new SpeechRecognitionCtor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onresult = (event: any) => {
          let finalText = '';
          for (let i = 0; i < event.results.length; i += 1) {
            finalText += event.results[i][0].transcript;
          }
          speakingTranscriptRef.current[question.id] = finalText;
        };
        // Best-effort — a recognition error (e.g. no speech detected, network hiccup)
        // never blocks or fails the recording itself, per T-053's fallback requirement.
        recognition.onerror = () => undefined;
        speechRecognitionRef.current = recognition;
        try {
          recognition.start();
        } catch {
          // Some browsers throw if called too early/late in the recorder's lifecycle —
          // harmless, the transcript just stays empty for this question.
        }
      } else {
        speechRecognitionRef.current = null;
      }
    } catch {
      setSpeakingError(t('takeTest.micAccessError'));
    }
  }

  const handleSubmit = useCallback(
    async (auto: boolean) => {
      if (!attemptId || hasSubmittedRef.current) return;
      if (!auto) {
        const confirmed = window.confirm(
          t('takeTest.submitConfirm', { answered: answeredCount, total: totalQuestions }),
        );
        if (!confirmed) return;
      }

      hasSubmittedRef.current = true;
      setIsSubmitting(true);
      setSubmitError(null);
      try {
        await flushPendingSaves();
        await studentApi.submitAttempt(attemptId);
        // T-091 critical race condition: clear the lock SYNCHRONOUSLY, immediately on
        // submit success, before navigating to the result page. If this instead relied
        // solely on `AttemptLockContext`'s route-change-triggered `listMyAttempts()`
        // re-check, that re-check is async and could still resolve to "locked" for a
        // moment right as the navigation below lands on the result page — which would
        // incorrectly force-redirect the student back to this now-finished attempt's
        // take-test screen instead of letting them see their own result. The server is
        // still the source of truth: `refreshLock()` runs naturally on the very next
        // route change (this navigation) and confirms the same now-unlocked state.
        clearLock();
        navigate(`/student/attempts/${attemptId}/result`, { replace: true });
      } catch (err) {
        hasSubmittedRef.current = false;
        setIsSubmitting(false);
        if (err instanceof ApiError && err.status === 409) {
          // Already submitted (e.g. auto-submit fired in another tab, or a double
          // click race) — the result already exists, just go see it. Same race
          // condition as the success path above, same fix.
          clearLock();
          navigate(`/student/attempts/${attemptId}/result`, { replace: true });
          return;
        }
        setSubmitError(err instanceof ApiError ? err.message : t('takeTest.submitTestError'));
      }
    },
    [attemptId, answeredCount, totalQuestions, flushPendingSaves, navigate, t, clearLock],
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
    return <p className="text-center text-base-black/60">{t('takeTest.loadingTest')}</p>;
  }

  const current = flatQuestions[currentIndex];
  const remainingMs = deadline !== null ? deadline - now : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary-700">{attempt.testTitle}</h1>
          <p className="text-sm text-base-black/60">
            {t('takeTest.answeredCount', { answered: answeredCount, total: totalQuestions })}
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

      <div className="flex flex-col gap-2">
        {/* T-113: 40px squares (easy to tap on a phone) and a tiny legend saying what the colours mean. */}
        <div className="flex flex-wrap gap-2" aria-label={t('takeTest.questionNavigatorLabel')}>
          {flatQuestions.map((q, index) => {
            const isAnswered = isQuestionAnswered(q);
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setCurrentIndex(index)}
                disabled={isAnySpeakingRecording}
                aria-current={index === currentIndex ? 'true' : undefined}
                aria-label={t(
                  isAnswered ? 'takeTest.goToQuestionAnswered' : 'takeTest.goToQuestionUnanswered',
                  { number: index + 1 },
                )}
                className={`h-10 w-10 rounded-md text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  index === currentIndex
                    ? 'bg-primary-700 text-base-white ring-2 ring-primary-300 ring-offset-1'
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
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-base-black/60">
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-3.5 w-3.5 rounded bg-primary-500" />
            {t('takeTest.legendAnswered')}
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-3.5 w-3.5 rounded border border-primary-200 bg-base-white" />
            {t('takeTest.legendUnanswered')}
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-3.5 w-3.5 rounded bg-primary-700 ring-2 ring-primary-300 ring-offset-1" />
            {t('takeTest.legendCurrent')}
          </li>
        </ul>
      </div>

      {tabSwitchNotice && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {t('takeTest.tabSwitchNotice', { count: tabSwitchCount })}
        </p>
      )}

      {current && (
        <div className="rounded-xl border border-primary-200 bg-primary-50 p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-600">
            {current.sectionTitle} · {t('takeTest.questionXOfY', { current: currentIndex + 1, total: totalQuestions })}
          </p>

          {/* Reading passage (T-039) — shared context for every question in this section. */}
          {current.sectionPassageText && (
            <div className="mt-3 rounded-lg border border-primary-200 bg-base-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-base-black/50">
                {t('takeTest.readingPassageLabel')}
              </p>
              {current.sectionPassageImageUrl && (
                <img
                  src={current.sectionPassageImageUrl}
                  alt={t('takeTest.readingPassageImageAlt')}
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
                {t('takeTest.listeningAudioLabel')}
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
                  {t('takeTest.liveAudioNotice')}
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
                    ▶ {t('takeTest.playAudio')}
                  </button>
                  <span className="text-xs text-base-black/60">
                    {current.sectionMaxPlayCount != null
                      ? t('takeTest.playedCountLimited', {
                          count: playCounts[current.sectionId] ?? 0,
                          max: current.sectionMaxPlayCount,
                        })
                      : t('takeTest.playedCountUnlimited', { count: playCounts[current.sectionId] ?? 0 })}
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
                placeholder={t('takeTest.essayPlaceholder')}
                className="w-full rounded-md border border-primary-200 bg-base-white px-3 py-2 text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
              <p className="mt-1 text-xs text-base-black/50">
                {current.essayMaxScore != null &&
                  `${t('takeTest.essayGradedManually', { points: current.essayMaxScore })} `}
                {t('takeTest.essayCopyPasteDisabled')}
              </p>
              {pasteWarning && (
                <p role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {t(pasteWarning === 'paste' ? 'takeTest.pasteBlocked' : 'takeTest.copyBlocked')}
                </p>
              )}
            </div>
          ) : current.type === 'fillBlank' ? (
            <input
              type="text"
              value={answers[current.id]?.textAnswer ?? ''}
              onChange={(event) => handleTextChange(current, event.target.value)}
              disabled={isSubmitting}
              placeholder={t('takeTest.fillBlankPlaceholder')}
              className="mt-4 w-full rounded-md border border-primary-200 bg-base-white px-3 py-2 text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          ) : current.type === 'speaking' ? (
            <div className="mt-4 flex flex-col gap-3">
              {current.promptAudioUrl && <audio controls src={current.promptAudioUrl} className="w-full" />}

              {(() => {
                const currentDeadline = speakingDeadlinesRef.current[current.id];
                if (speakingStatus[current.id] === 'submitted' || currentDeadline == null) return null;
                const remainingMsForSpeaking = currentDeadline - now;
                return (
                  <div
                    role="timer"
                    className={`self-start rounded-md px-3 py-1.5 text-sm font-bold ${
                      remainingMsForSpeaking < 10_000 ? 'bg-red-100 text-red-700' : 'bg-primary-100 text-primary-700'
                    }`}
                  >
                    {t('takeTest.speakingTimeLeft', { time: formatRemaining(remainingMsForSpeaking) })}
                  </div>
                );
              })()}

              {speakingStatus[current.id] === 'submitted' ? (
                <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                  <p>{t('takeTest.speakingSubmittedNotice')}</p>
                  {speakingResults[current.id] && (
                    <p className="mt-1 text-xs text-green-700">
                      {t('takeTest.speakingImmediateGrade', {
                        score: speakingResults[current.id].aiScore,
                        feedback: speakingResults[current.id].aiFeedback,
                      })}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-start gap-2">
                  {speakingStatus[current.id] === 'recording' ? (
                    <button
                      type="button"
                      onClick={() => stopRecording(current)}
                      className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-red-700"
                    >
                      ⏹ {t('takeTest.stopAndSubmitRecording')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void startRecording(current)}
                      disabled={speakingStatus[current.id] === 'submitting'}
                      className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {speakingStatus[current.id] === 'submitting'
                        ? t('takeTest.submitting')
                        : `🎤 ${t('takeTest.startRecording')}`}
                    </button>
                  )}
                  {!speechApiSupported && (
                    <p className="text-xs text-base-black/50">
                      {t('takeTest.speechApiUnsupported')}
                    </p>
                  )}
                </div>
              )}

              {speakingError && (
                <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {speakingError}
                </p>
              )}
            </div>
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

      {isAnySpeakingRecording && (
        <p className="rounded-md border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-700">
          {t('takeTest.finishSpeakingBeforeContinuing')}
        </p>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0 || isAnySpeakingRecording}
          className="min-h-11 rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← {t('takeTest.previous')}
        </button>

        {currentIndex < totalQuestions - 1 ? (
          <button
            type="button"
            onClick={() => setCurrentIndex((i) => Math.min(totalQuestions - 1, i + 1))}
            disabled={isAnySpeakingRecording}
            className="min-h-11 rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('takeTest.next')} →
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSubmit(false)}
            disabled={isSubmitting || isAnySpeakingRecording}
            className="min-h-11 rounded-md bg-primary-700 px-6 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? t('takeTest.submitting') : t('takeTest.submitTest')}
          </button>
        )}
      </div>

      {currentIndex < totalQuestions - 1 && (
        <button
          type="button"
          onClick={() => void handleSubmit(false)}
          disabled={isSubmitting || isAnySpeakingRecording}
          className="min-h-11 self-center rounded-md border-2 border-primary-500 bg-base-white px-6 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? t('takeTest.submitting') : t('takeTest.finishEarlyAndSubmit')}
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
