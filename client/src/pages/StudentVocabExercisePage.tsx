import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { CheckVocabExerciseResponse, VocabExercisePromptDTO, VocabExerciseType } from '@platform/shared';
import { flashcardApi } from '../lib/flashcardApi';
import { ApiError } from '../lib/apiClient';

const EXERCISE_META: Record<VocabExerciseType, { title: string; instructions: string }> = {
  fillBlank: {
    title: 'Fill in the blank',
    instructions: 'Type the missing word to complete the sentence.',
  },
  unscramble: {
    title: 'Unscramble the word',
    instructions: 'Reorder the letters below to spell the correct word.',
  },
  listenAndType: {
    title: 'Listen and type',
    instructions: 'Press play and type the word you hear.',
  },
  ipaToWord: {
    title: 'IPA to word',
    instructions: 'Read the phonetic transcription and type the word it represents.',
  },
};

function isVocabExerciseType(value: string | undefined): value is VocabExerciseType {
  return !!value && value in EXERCISE_META;
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
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load exercise.'));
  }, [setId, exerciseType]);

  if (!setId || !isVocabExerciseType(exerciseType)) {
    return <p className="text-center text-base-black/60">Unknown exercise type.</p>;
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
    return <p className="text-center text-base-black/60">Loading...</p>;
  }

  if (prompts.length === 0) {
    return (
      <div className="mx-auto max-w-xl">
        <Link to={`/student/flashcard-sets/${setId}`} className="text-sm text-primary-600 hover:underline">
          ← Back to set
        </Link>
        <p className="mt-4 text-sm text-base-black/60">
          No cards in this set are eligible for the &quot;{meta.title}&quot; exercise yet (they're
          missing the data it needs, e.g. an example sentence or audio).
        </p>
      </div>
    );
  }

  if (index >= prompts.length) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 text-center">
        <h1 className="text-xl font-bold text-primary-700">{meta.title} — done!</h1>
        <p className="text-base-black/70">
          You got {correctCount} of {attemptedCount} correct.
        </p>
        <Link
          to={`/student/flashcard-sets/${setId}`}
          className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
        >
          Back to set
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
      setError(err instanceof ApiError ? err.message : 'Failed to check your answer.');
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
          ← Back to set
        </Link>
        <span className="text-sm text-base-black/60">
          {index + 1} of {prompts.length}
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
              aria-label="Play audio"
            >
              ▶ Play
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
            placeholder="Type your answer"
            autoFocus
            className="flex-1 rounded-md border border-primary-200 px-3 py-2 text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
          <button
            type="submit"
            disabled={!answer.trim() || isChecking}
            className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isChecking ? 'Checking...' : 'Check'}
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
          <p className="font-semibold">{result.correct ? 'Correct!' : 'Not quite.'}</p>
          {!result.correct && <p className="mt-1">The correct answer was: {result.correctAnswer}</p>}
          <button
            type="button"
            onClick={handleNext}
            className="mt-3 rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
          >
            {index + 1 < prompts.length ? 'Next →' : 'Finish'}
          </button>
        </div>
      )}
    </div>
  );
}

export default StudentVocabExercisePage;
