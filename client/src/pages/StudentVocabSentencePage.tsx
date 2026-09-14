import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { SentencePromptDTO, SubmitSentenceResponse } from '@platform/shared';
import { flashcardApi } from '../lib/flashcardApi';
import { ApiError } from '../lib/apiClient';

/**
 * Use-word-in-a-sentence exercise (T-029): the student is shown a word (and its
 * meaning, for context) and writes a free-text sentence using it. There is no AI
 * grading (PROJECT_PLAN Assumption A3 scopes AI grading to Speaking only) — submitting
 * ALWAYS succeeds and ALWAYS advances to the next word, regardless of whether the
 * heuristic thinks the word was used (per T-029's acceptance criteria: "does not block
 * progress on a wrong answer"). The heuristic's verdict (`containsWord`) is shown only
 * as light, non-blocking feedback; the raw sentence is stored server-side for the
 * teacher to review later (see `teacherFlashcards.routes.ts`'s
 * `GET /flashcard-sets/:setId/sentence-submissions`).
 */
function StudentVocabSentencePage() {
  const { setId } = useParams<{ setId: string }>();
  const [prompts, setPrompts] = useState<SentencePromptDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [sentence, setSentence] = useState('');
  const [result, setResult] = useState<SubmitSentenceResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!setId) return;
    flashcardApi
      .listSentencePrompts(setId)
      .then(setPrompts)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load words.'));
  }, [setId]);

  if (!setId) return null;

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
        <p className="mt-4 text-sm text-base-black/60">This set has no words yet.</p>
      </div>
    );
  }

  if (index >= prompts.length) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 text-center">
        <h1 className="text-xl font-bold text-primary-700">All done!</h1>
        <p className="text-base-black/70">You wrote a sentence for all {prompts.length} words.</p>
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

  async function handleSubmit() {
    if (!sentence.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await flashcardApi.submitSentence(setId!, prompt.cardId, { sentence });
      setResult(response);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to submit your sentence.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleNext() {
    setResult(null);
    setSentence('');
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
        <h1 className="text-xl font-bold text-primary-700">Use it in a sentence</h1>
        <p className="mt-1 text-sm text-base-black/60">
          Write a sentence that uses the word below. There's no wrong answer here — just give it a try.
        </p>
      </div>

      <div className="rounded-xl border border-primary-200 bg-primary-50 p-6 text-center">
        <p className="text-3xl font-bold text-base-black">{prompt.term}</p>
        <p className="mt-2 text-sm text-base-black/60">{prompt.meaning}</p>
      </div>

      {!result ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
          className="flex flex-col gap-3"
        >
          <textarea
            value={sentence}
            onChange={(event) => setSentence(event.target.value)}
            placeholder={`Write a sentence using "${prompt.term}"...`}
            autoFocus
            rows={3}
            className="rounded-md border border-primary-200 px-3 py-2 text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
          <button
            type="submit"
            disabled={!sentence.trim() || isSubmitting}
            className="self-end rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </button>
        </form>
      ) : (
        <div
          role="status"
          className={`rounded-md border px-4 py-3 text-sm ${
            result.containsWord
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-primary-200 bg-primary-50 text-base-black/80'
          }`}
        >
          <p className="font-semibold">
            {result.containsWord
              ? `Nice — your sentence uses "${prompt.term}"!`
              : `Saved. We didn't spot "${prompt.term}" in there, but that's OK — your teacher can still see it.`}
          </p>
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

export default StudentVocabSentencePage;
