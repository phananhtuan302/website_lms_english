import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { CheckVocabExerciseResponse, VocabExercisePromptDTO, VocabExerciseType } from '@platform/shared';
import { flashcardApi } from '../lib/flashcardApi';
import { ApiError } from '../lib/apiClient';

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
      <div className="mx-auto max-w-xl">
        <Link to={`/student/flashcard-sets/${setId}`} className="text-sm text-primary-600 hover:underline">
          {t('studentVocabExercise.backToSet')}
        </Link>
        <p className="mt-4 text-sm text-base-black/60">
          {t('studentVocabExercise.noEligibleCards', { title: meta.title })}
        </p>
      </div>
    );
  }

  if (index >= prompts.length) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 text-center">
        <h1 className="text-xl font-bold text-primary-700">
          {t('studentVocabExercise.doneHeading', { title: meta.title })}
        </h1>
        <p className="text-base-black/70">
          {t('studentVocabExercise.resultLine', { correct: correctCount, total: attemptedCount })}
        </p>
        <Link
          to={`/student/flashcard-sets/${setId}`}
          className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
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
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link to={`/student/flashcard-sets/${setId}`} className="text-sm text-primary-600 hover:underline">
          {t('studentVocabExercise.backToSet')}
        </Link>
        <span className="text-sm text-base-black/60">
          {t('studentVocabExercise.progress', { current: index + 1, total: prompts.length })}
        </span>
      </div>

      <div>
        <h1 className="text-xl font-bold text-primary-700">{meta.title}</h1>
        <p className="mt-1 text-sm text-base-black/60">{meta.instructions}</p>
      </div>

      <div className="rounded-xl border border-primary-200 bg-primary-50 p-6">
        {exerciseType === 'fillBlank' && (
          <p className="text-lg font-medium text-base-black">{prompt.sentence}</p>
        )}
        {exerciseType === 'unscramble' && (
          <p className="text-center text-3xl font-bold uppercase tracking-widest text-base-black">
            {prompt.scrambled}
          </p>
        )}
        {exerciseType === 'listenAndType' && (
          <div className="flex flex-col items-center gap-3">
            <audio ref={audioRef} src={prompt.audioUrl} preload="none" />
            <button
              type="button"
              onClick={() => audioRef.current?.play().catch(() => undefined)}
              className="rounded-full bg-primary-500 px-6 py-3 text-lg font-semibold text-base-white transition-colors hover:bg-primary-600"
              aria-label={t('studentVocabExercise.playAudio')}
            >
              {t('studentVocabExercise.playButton')}
            </button>
          </div>
        )}
        {exerciseType === 'ipaToWord' && (
          <p className="text-center text-3xl font-semibold text-base-black">{prompt.ipa}</p>
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
            className="flex-1 rounded-md border border-primary-200 px-3 py-2 text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
          <button
            type="submit"
            disabled={!answer.trim() || isChecking}
            className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isChecking ? t('studentVocabExercise.checking') : t('studentVocabExercise.check')}
          </button>
        </form>
      ) : (
        <div
          role="alert"
          className={`rounded-md border px-4 py-3 text-sm ${
            result.correct
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          <p className="font-semibold">
            {result.correct ? t('studentVocabExercise.correct') : t('studentVocabExercise.notQuite')}
          </p>
          {!result.correct && (
            <p className="mt-1">
              {t('studentVocabExercise.correctAnswerWas', { answer: result.correctAnswer })}
            </p>
          )}
          <button
            type="button"
            onClick={handleNext}
            className="mt-3 rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
          >
            {index + 1 < prompts.length ? t('studentVocabExercise.next') : t('studentVocabExercise.finish')}
          </button>
        </div>
      )}
    </div>
  );
}

export default StudentVocabExercisePage;
