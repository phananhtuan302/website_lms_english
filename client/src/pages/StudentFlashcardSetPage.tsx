import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  FlashcardProgressStatus,
  StudentFlashcardSetDetailDTO,
  VocabExerciseType,
} from '@platform/shared';
import { flashcardApi } from '../lib/flashcardApi';
import { ApiError } from '../lib/apiClient';
import VocabConfetti from '../components/VocabConfetti';

const STATUS_LABEL_KEY: Record<FlashcardProgressStatus, string> = {
  new: 'studentFlashcardSet.statusNew',
  learning: 'studentFlashcardSet.statusLearning',
  known: 'studentFlashcardSet.statusKnown',
};

const STATUS_BADGE_CLASS: Record<FlashcardProgressStatus, string> = {
  new: 'bg-base-black/10 text-base-black/70',
  learning: 'bg-primary-100 text-primary-700',
  known: 'bg-green-100 text-green-700',
};

const EXERCISE_LINKS: Array<{ type: VocabExerciseType; labelKey: string }> = [
  { type: 'fillBlank', labelKey: 'studentFlashcardSet.exerciseFillBlank' },
  { type: 'unscramble', labelKey: 'studentFlashcardSet.exerciseUnscramble' },
  { type: 'listenAndType', labelKey: 'studentFlashcardSet.exerciseListenAndType' },
  { type: 'ipaToWord', labelKey: 'studentFlashcardSet.exerciseIpaToWord' },
];

/** T-113: "🔊 Nghe" reads the English word aloud with the browser's own voice (no audio files,
 * no library). Where the browser has no speech synthesis the button is simply not shown. */
function canSpeakEnglish(): boolean {
  return typeof window !== 'undefined' && Boolean(window.speechSynthesis) && typeof SpeechSynthesisUtterance !== 'undefined';
}

/** How long the "Đang đọc…" state may wait for the browser to actually start speaking before we
 * tell the child the device cannot read it, and how long the "cannot read" note stays visible. */
const SPEAK_START_TIMEOUT_MS = 2500;
const SPEAK_FAILED_NOTE_MS = 4000;
/** How long the "Đã thuộc ✓" / "Vẫn đang học ✓" confirmation stays next to the card. */
const MARK_FEEDBACK_MS = 1200;

interface SpeakHandlers {
  onStart: () => void;
  onEnd: () => void;
  onFail: () => void;
}

/** Best effort: a browser that refuses to speak must never break the card. Reports what happened
 * through the handlers so the button can show "Đang đọc…" or the "cannot read" note. */
function speakEnglish(text: string, { onStart, onEnd, onFail }: SpeakHandlers): void {
  try {
    const synth = window.speechSynthesis;
    // Once the browser has listed its voices and none is English there is nothing sensible to say
    // it with (an empty list just means "not loaded yet" — then we simply try and see).
    const voices = synth.getVoices();
    if (voices.length > 0 && !voices.some((voice) => voice.lang.toLowerCase().startsWith('en'))) {
      onFail();
      return;
    }
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.onstart = onStart;
    utterance.onend = onEnd;
    utterance.onerror = (event) => {
      // cancel() on a newer utterance ends the older one with these — not a failure.
      if (event.error === 'canceled' || event.error === 'interrupted') return;
      onFail();
    };
    synth.speak(utterance);
  } catch {
    onFail();
  }
}

/** Smooth scrolling unless the device asks for reduced motion. */
function scrollBehavior(): ScrollBehavior {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth';
}

function FlipIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v5h-5" />
    </svg>
  );
}

/**
 * Flashcard study/review mode (T-023): flip through cards one at a time (front: term,
 * back: meaning + details), mark each Known/Still learning, which updates
 * `FlashcardProgress` for that student+card immediately. Reopening the set later shows
 * the previously recorded status (server-driven — no local reset), per T-023's
 * acceptance criteria. Also links out to the four exercise types built in this same
 * batch (T-024–T-027).
 */
function StudentFlashcardSetPage() {
  const { t } = useTranslation();
  const { setId } = useParams<{ setId: string }>();
  const [set, setSet] = useState<StudentFlashcardSetDetailDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // T-089: "Xem thẻ đã thuộc" — a simple toggled inline list of already-loaded data
  // (client-side filter of `set.cards`), not a new endpoint or a rebuilt flip-card UI.
  const [showKnownCards, setShowKnownCards] = useState(false);
  // T-113: a short "Đã thuộc ✓" / "Vẫn đang học ✓" note next to the card after marking.
  const [markFeedback, setMarkFeedback] = useState<'known' | 'learning' | null>(null);
  // Vocab Studio: a brief confetti burst on "known" — purely decorative, mirrors
  // `markFeedback`'s own lifetime (cleared by the same timer below).
  const [showConfetti, setShowConfetti] = useState(false);
  // T-113: true once the child has just marked the last card of the set (drives the "you finished" panel).
  const [markedLastCard, setMarkedLastCard] = useState(false);
  // T-113: "🔊 Nghe" state — reading aloud, or the device could not read it.
  const [speakState, setSpeakState] = useState<'idle' | 'speaking' | 'failed'>('idle');
  const markFeedbackTimer = useRef<number | undefined>(undefined);
  const speakStartTimer = useRef<number | undefined>(undefined);
  const speakFailedTimer = useRef<number | undefined>(undefined);
  const speakToken = useRef(0);
  const donePanelRef = useRef<HTMLDivElement>(null);
  const practiceRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!setId) return;
    flashcardApi
      .getSet(setId)
      .then(setSet)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('studentFlashcardSet.loadError')));
  }, [setId, t]);

  useEffect(
    () => () => {
      window.clearTimeout(markFeedbackTimer.current);
      window.clearTimeout(speakStartTimer.current);
      window.clearTimeout(speakFailedTimer.current);
    },
    [],
  );

  // When the child has just marked the very last card, bring the "you finished" panel into view.
  useEffect(() => {
    if (markedLastCard) donePanelRef.current?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() });
  }, [markedLastCard]);

  if (!setId) return null;

  if (error) {
    return (
      <p role="alert" className="mx-auto max-w-md rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (!set) {
    return <p className="text-center text-base-black/60">{t('common.loading')}</p>;
  }

  if (set.cards.length === 0) {
    return (
      <div>
        <Link to="/student/flashcard-sets" className="inline-block py-2.5 text-sm text-primary-600 hover:underline sm:py-0">
          {t('studentFlashcardSet.backToVocabulary')}
        </Link>
        <p className="mt-4 text-sm text-base-black/60">{t('studentFlashcardSet.emptySet')}</p>
      </div>
    );
  }

  const card = set.cards[index];
  // T-089: "Xem thẻ đã thuộc" — client-side filter of the already-loaded card list, no
  // separate endpoint needed (verifiedKnown is already on StudentFlashcardCardDTO).
  const knownCards = set.cards.filter((c) => c.progressStatus === 'known');

  async function mark(status: FlashcardProgressStatus) {
    setIsSaving(true);
    try {
      await flashcardApi.setCardProgress(setId!, card.id, { status });
      setSet((prev) =>
        prev
          ? {
              ...prev,
              cards: prev.cards.map((c) =>
                c.id === card.id
                  ? { ...c, progressStatus: status, lastReviewedAt: new Date().toISOString() }
                  : c,
              ),
            }
          : prev,
      );
      // Advance to the next card automatically so a study session flows without extra clicks.
      setIsFlipped(false);
      setIndex((i) => Math.min(set!.cards.length - 1, i + 1));
      // T-113: say what was just saved, briefly (the card already moved on).
      setMarkFeedback(status === 'known' ? 'known' : 'learning');
      setShowConfetti(status === 'known');
      window.clearTimeout(markFeedbackTimer.current);
      markFeedbackTimer.current = window.setTimeout(() => {
        setMarkFeedback(null);
        setShowConfetti(false);
      }, MARK_FEEDBACK_MS);
      if (index === set!.cards.length - 1) setMarkedLastCard(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('studentFlashcardSet.saveProgressError'));
    } finally {
      setIsSaving(false);
    }
  }

  function listen() {
    window.clearTimeout(speakStartTimer.current);
    window.clearTimeout(speakFailedTimer.current);
    // A newer press cancels the older utterance; its late "ended" must not reset the newer one.
    const token = ++speakToken.current;
    const isCurrent = () => token === speakToken.current;
    let sawSpeech = false;
    const fail = () => {
      if (!isCurrent()) return;
      window.clearTimeout(speakStartTimer.current);
      setSpeakState('failed');
      window.clearTimeout(speakFailedTimer.current);
      speakFailedTimer.current = window.setTimeout(() => setSpeakState('idle'), SPEAK_FAILED_NOTE_MS);
    };
    // Some browsers accept the request and then stay silent (no voice, sound blocked), and some never
    // report "finished": this check settles both, so "Đang đọc…" can never stay on forever.
    const watch = () => {
      if (!isCurrent()) return;
      if (window.speechSynthesis.speaking) {
        sawSpeech = true;
        speakStartTimer.current = window.setTimeout(watch, 500);
      } else if (sawSpeech) {
        setSpeakState('idle');
      } else {
        fail();
      }
    };
    setSpeakState('speaking');
    speakStartTimer.current = window.setTimeout(watch, SPEAK_START_TIMEOUT_MS);
    speakEnglish(card.term, {
      onStart: () => {
        sawSpeech = true;
      },
      onEnd: () => {
        if (!isCurrent()) return;
        window.clearTimeout(speakStartTimer.current);
        setSpeakState('idle');
      },
      onFail: fail,
    });
  }

  // T-113: every card marked ⇒ the whole set has been studied; also right after the last card is marked.
  const allCardsMarked = set.cards.every((c) => c.progressStatus === 'known' || c.progressStatus === 'learning');
  const showDonePanel = markedLastCard || allCardsMarked;

  return (
    <div className="vocab-zone vocab-canvas -m-4 flex flex-col gap-6 rounded-3xl p-4 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <Link
            to="/student/flashcard-sets"
            className="inline-flex items-center gap-1 py-2.5 text-sm font-semibold text-primary-700 hover:text-primary-800 sm:py-0"
          >
            {t('studentFlashcardSet.backToVocabulary')}
          </Link>
          <span className="rounded-full bg-base-white px-3 py-1 text-xs font-bold text-primary-700 shadow-sm">
            {t('studentFlashcardSet.cardProgress', { current: index + 1, total: set.cards.length })}
          </span>
        </div>

        <h1 className="vocab-display text-2xl font-bold text-primary-800">{set.name}</h1>

        {/* Chunky progress dots — one per card, filled as the student studies each one. */}
        <div className="flex flex-wrap gap-1.5" aria-hidden="true">
          {set.cards.map((c, i) => (
            <span
              key={c.id}
              className={`h-2 flex-1 rounded-full transition-colors ${
                i === index
                  ? 'bg-primary-600'
                  : c.progressStatus === 'known'
                    ? 'bg-green-400'
                    : c.progressStatus === 'learning'
                      ? 'bg-amber-300'
                      : 'bg-primary-100'
              }`}
            />
          ))}
        </div>

        <div className="relative">
          {/* T-113: says what was just saved ("Đã thuộc ✓" / "Vẫn đang học ✓") for a moment while the
              card moves on. The live region is always present so screen readers announce the change. */}
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute inset-x-0 -top-3 z-20 flex justify-center"
          >
            {markFeedback && (
              <span
                className={`vocab-anim-pop rounded-full px-4 py-1.5 text-sm font-bold text-base-white shadow-lg ${
                  markFeedback === 'known' ? 'bg-green-600' : 'bg-amber-600'
                }`}
              >
                {markFeedback === 'known' ? t('studentFlashcardSet.markedKnown') : t('studentFlashcardSet.markedLearning')}
              </span>
            )}
          </div>
          {showConfetti && <VocabConfetti />}
          {/* T-113: the card looks like a card you can press (raised, bordered, with a visible hint).
              Vocab Studio: a real 3D flip (`.vocab-flip-*`, index.css) — both faces are always
              rendered so the CSS transform can rotate between them; `isFlipped` now drives a
              className instead of swapping which JSX renders, same state, same handler. */}
          <button
            type="button"
            onClick={() => setIsFlipped((f) => !f)}
            aria-label={t('studentFlashcardSet.flipCardAriaLabel')}
            className="vocab-flip-scene block min-h-[260px] w-full text-left"
          >
            <div className={`vocab-flip-card min-h-[260px] w-full ${isFlipped ? 'is-flipped' : ''}`}>
              <div className="vocab-flip-face flex min-h-[260px] w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-primary-300 bg-base-white p-6 text-center shadow-[0_12px_0_0_rgb(var(--color-primary-200)),0_20px_30px_-12px_rgb(var(--color-primary-600)/0.35)] sm:p-8">
                <p className="vocab-display break-words text-4xl font-bold text-primary-900">{card.term}</p>
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-4 py-1.5 text-sm font-bold text-primary-700">
                  <FlipIcon />
                  {t('studentFlashcardSet.tapToReveal')}
                </span>
              </div>
              <div className="vocab-flip-face vocab-flip-face-back flex min-h-[260px] w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-primary-300 bg-primary-50 p-6 text-center shadow-[0_12px_0_0_rgb(var(--color-primary-200)),0_20px_30px_-12px_rgb(var(--color-primary-600)/0.35)] sm:p-8">
                <p className="break-words text-lg font-semibold text-base-black">{card.meaning}</p>
                {card.ipa && <p className="text-base-black/70">{card.ipa}</p>}
                {card.synonyms.length > 0 && (
                  <p className="text-sm text-base-black/60">
                    {t('studentFlashcardSet.synonymsLabel', { list: card.synonyms.join(', ') })}
                  </p>
                )}
                {card.antonyms.length > 0 && (
                  <p className="text-sm text-base-black/60">
                    {t('studentFlashcardSet.antonymsLabel', { list: card.antonyms.join(', ') })}
                  </p>
                )}
                {card.imageUrl && (
                  <img src={card.imageUrl} alt={card.term} className="mt-2 max-h-32 rounded-xl" />
                )}
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-base-white px-4 py-1.5 text-sm font-bold text-primary-700 shadow-sm">
                  <FlipIcon />
                  {t('studentFlashcardSet.tapToFlipBack')}
                </span>
              </div>
            </div>
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_BADGE_CLASS[card.progressStatus ?? 'new']}`}
          >
            {t(STATUS_LABEL_KEY[card.progressStatus ?? 'new'])}
          </span>
          {canSpeakEnglish() && (
            <button
              type="button"
              onClick={listen}
              aria-label={t('studentFlashcardSet.listenAriaLabel')}
              aria-busy={speakState === 'speaking'}
              className="vocab-btn-secondary inline-flex min-h-11 items-center justify-center border-2 border-primary-300 bg-base-white px-4 py-2 text-sm font-bold text-primary-700"
            >
              {speakState === 'speaking' ? t('studentFlashcardSet.listenSpeaking') : t('studentFlashcardSet.listenButton')}
            </button>
          )}
          {speakState === 'failed' && (
            <p role="status" className="w-full rounded-xl bg-amber-50 px-3 py-2 text-center text-sm text-amber-900">
              {t('studentFlashcardSet.listenFailed')}
            </p>
          )}
        </div>

        {/* T-113: two equal-weight choices (same size, same border) on one row, and Trước / Tiếp theo
            on another, so no label wraps on a phone. */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => void mark('learning')}
              disabled={isSaving}
              className="vocab-btn-secondary min-h-14 border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t('studentFlashcardSet.stillLearningButton')}
            </button>
            <button
              type="button"
              onClick={() => void mark('known')}
              disabled={isSaving}
              className="vocab-btn-primary vocab-btn-green min-h-14 bg-green-500 px-3 py-2 text-sm text-base-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t('studentFlashcardSet.statusKnown')}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setIsFlipped(false);
                setIndex((i) => Math.max(0, i - 1));
              }}
              disabled={index === 0}
              className="vocab-btn-secondary min-h-11 border-2 border-primary-200 bg-base-white px-3 py-2 text-sm text-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('studentFlashcardSet.previousButton')}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsFlipped(false);
                setIndex((i) => Math.min(set.cards.length - 1, i + 1));
              }}
              disabled={index === set.cards.length - 1}
              className="vocab-btn-secondary min-h-11 border-2 border-primary-200 bg-base-white px-3 py-2 text-sm text-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('studentFlashcardSet.nextButton')}
            </button>
          </div>
        </div>

        {/* T-113: the whole set has been studied — point at the practice section instead of leaving the child on the last card. */}
        {showDonePanel && (
          <div
            ref={donePanelRef}
            role="status"
            className="vocab-anim-pop relative overflow-hidden rounded-3xl border-2 border-green-300 bg-green-50 p-5 text-center"
          >
            <VocabConfetti />
            <p className="vocab-display text-xl font-bold text-green-900">
              🎉 {t('studentFlashcardSet.allCardsDoneTitle', { count: set.cards.length })}
            </p>
            <p className="mt-1 text-sm text-green-900/80">{t('studentFlashcardSet.allCardsDoneHint')}</p>
            <button
              type="button"
              onClick={() => {
                practiceRef.current?.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
                practiceRef.current?.focus({ preventScroll: true });
              }}
              className="vocab-btn-primary mt-3 inline-flex min-h-12 w-full items-center justify-center bg-primary-500 px-4 py-2.5 text-sm text-base-white sm:w-auto"
            >
              {t('studentFlashcardSet.goToPracticeButton')}
            </button>
          </div>
        )}

        <section
          ref={practiceRef}
          tabIndex={-1}
          className="rounded-3xl border-2 border-sky-200 bg-sky-50/60 p-5 focus:outline-none"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500 text-base-white">
              ✏️
            </span>
            <h2 className="vocab-display text-lg font-bold text-sky-900">
              {t('studentFlashcardSet.practiceExercisesHeading')}
            </h2>
          </div>
          <p className="mt-1 text-sm text-sky-900/70">{t('studentFlashcardSet.practiceExercisesSubtitle')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {EXERCISE_LINKS.map((link) => (
              <Link
                key={link.type}
                to={`/student/flashcard-sets/${setId}/exercises/${link.type}`}
                className="vocab-tile border-2 border-sky-200 bg-base-white px-3 py-2.5 sm:py-1.5 text-sm font-bold text-sky-800 hover:border-sky-400"
              >
                {t(link.labelKey)}
              </Link>
            ))}
            <Link
              to={`/student/flashcard-sets/${setId}/matching`}
              className="vocab-tile border-2 border-sky-200 bg-base-white px-3 py-2.5 sm:py-1.5 text-sm font-bold text-sky-800 hover:border-sky-400"
            >
              {t('studentFlashcardSet.matchingLink')}
            </Link>
            <Link
              to={`/student/flashcard-sets/${setId}/sentence`}
              className="vocab-tile border-2 border-sky-200 bg-base-white px-3 py-2.5 sm:py-1.5 text-sm font-bold text-sky-800 hover:border-sky-400"
            >
              {t('studentFlashcardSet.sentenceLink')}
            </Link>
          </div>
        </section>

        <section className="rounded-3xl border-2 border-violet-200 bg-violet-50/60 p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500 text-base-white">
              🎮
            </span>
            <h2 className="vocab-display text-lg font-bold text-violet-900">
              {t('studentFlashcardSet.gamesHeading')}
            </h2>
          </div>
          <p className="mt-1 text-sm text-violet-900/70">{t('studentFlashcardSet.gamesSubtitle')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to={`/student/flashcard-sets/${setId}/games/whack-a-mole`}
              className="vocab-tile border-2 border-violet-200 bg-base-white px-3 py-2.5 sm:py-1.5 text-sm font-bold text-violet-800 hover:border-violet-400"
            >
              🐹 {t('studentFlashcardSet.whackAMoleLink')}
            </Link>
            <Link
              to={`/student/flashcard-sets/${setId}/games/climber`}
              className="vocab-tile border-2 border-violet-200 bg-base-white px-3 py-2.5 sm:py-1.5 text-sm font-bold text-violet-800 hover:border-violet-400"
            >
              🧗 {t('studentFlashcardSet.climberLink')}
            </Link>
            <Link
              to={`/student/flashcard-sets/${setId}/games/balloon-pop`}
              className="vocab-tile border-2 border-violet-200 bg-base-white px-3 py-2.5 sm:py-1.5 text-sm font-bold text-violet-800 hover:border-violet-400"
            >
              🎈 {t('studentFlashcardSet.balloonPopLink')}
            </Link>
          </div>
        </section>

        {/* T-089: "Tự kiểm tra" (self-check) — a clearly distinct, student-initiated quiz
            over cards the student has personally marked "Đã thuộc", NOT the unrelated
            teacher-assigned "Kiểm tra từ vựng" (Vocabulary Check) feature elsewhere in the
            product. Same color-coded card style as the two sections above. */}
        <section className="rounded-3xl border-2 border-emerald-200 bg-emerald-50/60 p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-base-white">
              🏆
            </span>
            <h2 className="vocab-display text-lg font-bold text-emerald-900">
              {t('studentFlashcardSet.selfCheckHeading')}
            </h2>
          </div>
          <p className="mt-1 text-sm text-emerald-900/70">{t('studentFlashcardSet.selfCheckSubtitle')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to={`/student/flashcard-sets/${setId}/self-check`}
              className="vocab-btn-primary vocab-btn-emerald inline-flex items-center bg-emerald-500 px-4 py-2.5 sm:py-2 text-sm text-base-white"
            >
              {t('studentFlashcardSet.selfCheckStartButton')}
            </Link>
            <button
              type="button"
              onClick={() => setShowKnownCards((v) => !v)}
              className="vocab-tile border-2 border-emerald-200 bg-base-white px-3 py-2.5 sm:py-1.5 text-sm font-bold text-emerald-800 hover:border-emerald-400"
            >
              {showKnownCards
                ? t('studentFlashcardSet.hideKnownCardsButton')
                : t('studentFlashcardSet.viewKnownCardsButton')}
            </button>
          </div>

          {showKnownCards && (
            <div className="mt-4 rounded-2xl border border-emerald-100 bg-base-white/70 p-3">
              {knownCards.length === 0 ? (
                <p className="text-sm text-emerald-900/60">{t('studentFlashcardSet.knownCardsEmpty')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {knownCards.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-3 rounded-xl bg-base-white px-3 py-2 text-sm shadow-xs"
                    >
                      <div>
                        <span className="font-semibold text-base-black">{c.term}</span>
                        <span className="ml-2 text-base-black/60">{c.meaning}</span>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          c.verifiedKnown
                            ? 'bg-green-100 text-green-700'
                            : 'bg-base-black/10 text-base-black/70'
                        }`}
                      >
                        {c.verifiedKnown
                          ? t('studentFlashcardSet.verifiedBadge')
                          : t('studentFlashcardSet.selfClaimedBadge')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default StudentFlashcardSetPage;
