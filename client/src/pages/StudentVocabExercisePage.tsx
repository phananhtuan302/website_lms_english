import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { CheckVocabExerciseResponse, VocabExercisePromptDTO, VocabExerciseType } from '@platform/shared';
import { flashcardApi } from '../lib/flashcardApi';
import { ApiError } from '../lib/apiClient';
import VocabConfetti from '../components/VocabConfetti';

const EXERCISE_TYPES: VocabExerciseType[] = ['fillBlank', 'unscramble', 'listenAndType', 'ipaToWord'];

function isVocabExerciseType(value: string | undefined): value is VocabExerciseType {
  return !!value && (EXERCISE_TYPES as string[]).includes(value);
}

/**
 * Generic vocabulary-exercise runtime (T-024 fill-blank, T-025 unscramble, T-026
 * listen-and-type, T-027 IPA-to-word) — one component driven by the `:exerciseType`
 * route param, since all four share the exact same flow: show an answer-free prompt,
 * accept one typed answer, show immediate correct/incorrect feedback (with the correct
 * answer on a miss), and move to the next prompt. The server has already excluded
 * ineligible cards (see `flashcardApi.listExercisePrompts`), so every prompt here is
 * guaranteed playable.
 *
 * Documented choice (T-025 "case-insensitive is fine, document your choice"): every
 * exercise type in this batch checks case-insensitively, matching the same convention
 * already used everywhere else in this codebase (T-013's fill-blank grading).
 */
function StudentVocabExercisePage() {
  const { t } = useTranslation();
  const EXERCISE_META: Record<VocabExerciseType, { title: string; instructions: string }> = {
    fillBlank: {
      title: t('studentVocabExercise.types.fillBlank.title'),
      instructions: t('studentVocabExercise.types.fillBlank.instructions'),
    },
    unscramble: {
      title: t('studentVocabExercise.types.unscramble.title'),
      instructions: t('studentVocabExercise.types.unscramble.instructions'),
    },
    listenAndType: {
      title: t('studentVocabExercise.types.listenAndType.title'),
      instructions: t('studentVocabExercise.types.listenAndType.instructions'),
    },
    ipaToWord: {
      title: t('studentVocabExercise.types.ipaToWord.title'),
      instructions: t('studentVocabExercise.types.ipaToWord.instructions'),
    },
  };
  const { setId, exerciseType } = useParams<{ setId: string; exerciseType: string }>();
  const [prompts, setPrompts] = useState<VocabExercisePromptDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<CheckVocabExerciseResponse | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [attemptedCount, setAttemptedCount] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!setId || !isVocabExerciseType(exerciseType)) return;
    flashcardApi
      .listExercisePrompts(setId, exerciseType)
      .then(setPrompts)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('studentVocabExercise.loadFailed')));
    // `t` is stable in practice (i18next only re-creates it on a real language change,
    // which never happens mid-session); re-running this fetch on every `t` identity
    // change would be pure noise, not a real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setId, exerciseType]);

  if (!setId || !isVocabExerciseType(exerciseType)) {
    return <p className="text-center text-base-black/60">{t('studentVocabExercise.unknownType')}</p>;
  }

  const meta = EXERCISE_META[exerciseType];

  if (error) {
    return (
      <p role="alert" className="mx-auto max-w-md rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (prompts === null) {
    return <p className="text-center text-base-black/60">{t('common.loading')}</p>;
  }

  if (prompts.length === 0) {
    return (
      <div className="vocab-zone vocab-canvas mx-auto -mt-4 -mb-4 flex w-full max-w-xl flex-col gap-4 rounded-3xl p-4 sm:-mt-6 sm:-mb-6 sm:p-6">
        <Link to={`/student/flashcard-sets/${setId}`} className="text-sm font-semibold text-primary-700 hover:text-primary-800">
          {t('studentVocabExercise.backToSet')}
        </Link>
        <p className="text-sm text-base-black/60">
          {t('studentVocabExercise.noEligibleCards', { title: meta.title })}
        </p>
      </div>
    );
  }

  if (index >= prompts.length) {
    const accuracy = attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0;
    return (
      <div className="vocab-zone vocab-canvas mx-auto -mt-4 -mb-4 flex w-full max-w-xl flex-col items-center gap-4 rounded-3xl p-6 text-center sm:-mt-6 sm:-mb-6 sm:p-10">
        <div className="relative">
          <VocabConfetti />
          <span className="text-5xl">{accuracy >= 70 ? '🏆' : '🎉'}</span>
        </div>
        <h1 className="vocab-display text-2xl font-bold text-primary-800">
          {t('studentVocabExercise.doneHeading', { title: meta.title })}
        </h1>
        <p className="vocab-display text-4xl font-bold text-primary-700">{accuracy}%</p>
        <p className="text-base-black/70">
          {t('studentVocabExercise.resultLine', { correct: correctCount, total: attemptedCount })}
        </p>
        <Link
          to={`/student/flashcard-sets/${setId}`}
          className="vocab-btn-primary inline-flex min-h-12 items-center bg-primary-500 px-6 py-2.5 text-sm text-base-white"
        >
          {t('studentVocabExercise.backToSetButton')}
        </Link>
      </div>
    );
  }

  const prompt = prompts[index];

  async function handleCheck() {
    if (!answer.trim() || isChecking) return;
    setIsChecking(true);
    setError(null);
    try {
      const response = await flashcardApi.checkExerciseAnswer(setId!, exerciseType as VocabExerciseType, prompt.cardId, {
        answer,
      });
      setResult(response);
      setAttemptedCount((n) => n + 1);
      if (response.correct) setCorrectCount((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('studentVocabExercise.checkFailed'));
    } finally {
      setIsChecking(false);
    }
  }

  function handleNext() {
    setResult(null);
    setAnswer('');
    setIndex((i) => i + 1);
  }

  return (
    <div className="vocab-zone vocab-canvas mx-auto -mt-4 -mb-4 flex w-full max-w-xl flex-col gap-6 rounded-3xl p-4 sm:-mt-6 sm:-mb-6 sm:p-6">
      <div className="flex items-center justify-between">
        <Link to={`/student/flashcard-sets/${setId}`} className="text-sm font-semibold text-primary-700 hover:text-primary-800">
          {t('studentVocabExercise.backToSet')}
        </Link>
        <span className="rounded-full bg-base-white px-3 py-1 text-xs font-bold text-primary-700 shadow-sm">
          {t('studentVocabExercise.progress', { current: index + 1, total: prompts.length })}
        </span>
      </div>

      <div>
        <h1 className="vocab-display text-2xl font-bold text-primary-800">{meta.title}</h1>
        <p className="mt-1 text-sm text-base-black/60">{meta.instructions}</p>
      </div>

      <div className="rounded-3xl border-2 border-primary-200 bg-base-white p-6 shadow-[0_8px_0_0_rgb(var(--color-primary-100))] sm:p-8">
        {exerciseType === 'fillBlank' && (
          <p className="text-center text-xl font-medium text-base-black">{prompt.sentence}</p>
        )}
        {exerciseType === 'unscramble' && (
          <p className="vocab-display text-center text-4xl font-bold uppercase tracking-widest text-primary-800">
            {prompt.scrambled}
          </p>
        )}
        {exerciseType === 'listenAndType' && (
          <div className="flex flex-col items-center gap-3">
            <audio ref={audioRef} src={prompt.audioUrl} preload="none" />
            <button
              type="button"
              onClick={() => audioRef.current?.play().catch(() => undefined)}
              className="vocab-btn-primary flex h-20 w-20 items-center justify-center rounded-full bg-primary-500 text-3xl text-base-white"
              aria-label={t('studentVocabExercise.playAudio')}
            >
              🔊
            </button>
            <p className="text-xs font-semibold text-primary-900/50">{t('studentVocabExercise.playButton')}</p>
          </div>
        )}
        {exerciseType === 'ipaToWord' && (
          <p className="vocab-display text-center text-4xl font-semibold text-primary-800">{prompt.ipa}</p>
        )}
      </div>

      {!result ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleCheck();
          }}
          className="flex gap-3"
        >
          <input
            type="text"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder={t('studentVocabExercise.typeYourAnswer')}
            autoFocus
            className="flex-1 rounded-2xl border-2 border-primary-200 bg-base-white px-4 py-3 text-base text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
          <button
            type="submit"
            disabled={!answer.trim() || isChecking}
            className="vocab-btn-primary bg-primary-500 px-5 py-2 text-sm text-base-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isChecking ? t('studentVocabExercise.checking') : t('studentVocabExercise.check')}
          </button>
        </form>
      ) : (
        <div
          role="alert"
          className={`vocab-anim-pop relative overflow-hidden rounded-2xl border-2 px-4 py-4 text-sm ${
            result.correct
              ? 'border-green-300 bg-green-50 text-green-800'
              : 'vocab-anim-shake border-red-300 bg-red-50 text-red-700'
          }`}
        >
          {result.correct && <VocabConfetti />}
          <p className="text-base font-bold">
            {result.correct ? `✅ ${t('studentVocabExercise.correct')}` : `✗ ${t('studentVocabExercise.notQuite')}`}
          </p>
          {!result.correct && (
            <p className="mt-1">
              {t('studentVocabExercise.correctAnswerWas', { answer: result.correctAnswer })}
            </p>
          )}
          <button
            type="button"
            onClick={handleNext}
            className={`vocab-btn-primary mt-3 px-4 py-2 text-sm text-base-white ${
              result.correct ? 'vocab-btn-green bg-green-500' : 'bg-primary-500'
            }`}
          >
            {index + 1 < prompts.length ? t('studentVocabExercise.next') : t('studentVocabExercise.finish')}
          </button>
        </div>
      )}
    </div>
  );
}

export default StudentVocabExercisePage;
