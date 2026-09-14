import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  FlashcardProgressStatus,
  StudentFlashcardSetDetailDTO,
  VocabExerciseType,
} from '@platform/shared';
import { flashcardApi } from '../lib/flashcardApi';
import { ApiError } from '../lib/apiClient';

const STATUS_LABEL: Record<FlashcardProgressStatus, string> = {
  new: 'New',
  learning: 'Learning',
  known: 'Known',
};

const STATUS_BADGE_CLASS: Record<FlashcardProgressStatus, string> = {
  new: 'bg-base-black/10 text-base-black/70',
  learning: 'bg-primary-100 text-primary-700',
  known: 'bg-green-100 text-green-700',
};

const EXERCISE_LINKS: Array<{ type: VocabExerciseType; label: string }> = [
  { type: 'fillBlank', label: 'Fill in the blank' },
  { type: 'unscramble', label: 'Unscramble the word' },
  { type: 'listenAndType', label: 'Listen and type' },
  { type: 'ipaToWord', label: 'IPA to word' },
];

/**
 * Flashcard study/review mode (T-023): flip through cards one at a time (front: term,
 * back: meaning + details), mark each Known/Still learning, which updates
 * `FlashcardProgress` for that student+card immediately. Reopening the set later shows
 * the previously recorded status (server-driven — no local reset), per T-023's
 * acceptance criteria. Also links out to the four exercise types built in this same
 * batch (T-024–T-027).
 */
function StudentFlashcardSetPage() {
  const { setId } = useParams<{ setId: string }>();
  const [set, setSet] = useState<StudentFlashcardSetDetailDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!setId) return;
    flashcardApi
      .getSet(setId)
      .then(setSet)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load flashcard set.'));
  }, [setId]);

  if (!setId) return null;

  if (error) {
    return (
      <p role="alert" className="mx-auto max-w-md rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (!set) {
    return <p className="text-center text-base-black/60">Loading...</p>;
  }

  if (set.cards.length === 0) {
    return (
      <div>
        <Link to="/student/flashcard-sets" className="text-sm text-primary-600 hover:underline">
          ← Back to vocabulary
        </Link>
        <p className="mt-4 text-sm text-base-black/60">This set has no cards yet.</p>
      </div>
    );
  }

  const card = set.cards[index];

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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save progress.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link to="/student/flashcard-sets" className="text-sm text-primary-600 hover:underline">
          ← Back to vocabulary
        </Link>
        <span className="text-sm text-base-black/60">
          Card {index + 1} of {set.cards.length}
        </span>
      </div>

      <h1 className="text-xl font-bold text-primary-700">{set.name}</h1>

      <button
        type="button"
        onClick={() => setIsFlipped((f) => !f)}
        aria-label="Flip card"
        className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl border border-primary-200 bg-primary-50 p-8 text-center transition-colors hover:border-primary-400"
      >
        {!isFlipped ? (
          <>
            <p className="text-3xl font-bold text-base-black">{card.term}</p>
            <p className="text-xs uppercase tracking-wide text-base-black/50">Tap to reveal meaning</p>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold text-base-black">{card.meaning}</p>
            {card.ipa && <p className="text-base-black/70">{card.ipa}</p>}
            {card.synonyms.length > 0 && (
              <p className="text-sm text-base-black/60">Synonyms: {card.synonyms.join(', ')}</p>
            )}
            {card.antonyms.length > 0 && (
              <p className="text-sm text-base-black/60">Antonyms: {card.antonyms.join(', ')}</p>
            )}
            {card.imageUrl && (
              <img src={card.imageUrl} alt={card.term} className="mt-2 max-h-32 rounded-md" />
            )}
          </>
        )}
      </button>

      <div className="flex items-center justify-center gap-2">
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_BADGE_CLASS[card.progressStatus ?? 'new']}`}
        >
          {STATUS_LABEL[card.progressStatus ?? 'new']}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            setIsFlipped(false);
            setIndex((i) => Math.max(0, i - 1));
          }}
          disabled={index === 0}
          className="rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Previous
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void mark('learning')}
            disabled={isSaving}
            className="rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Still learning
          </button>
          <button
            type="button"
            onClick={() => void mark('known')}
            disabled={isSaving}
            className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Known
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsFlipped(false);
            setIndex((i) => Math.min(set.cards.length - 1, i + 1));
          }}
          disabled={index === set.cards.length - 1}
          className="rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next →
        </button>
      </div>

      <section className="rounded-xl border border-primary-200 p-4">
        <h2 className="text-lg font-bold text-base-black">Practice exercises</h2>
        <p className="mt-1 text-sm text-base-black/60">
          Each exercise only includes cards with the data it needs (e.g. listen-and-type needs
          audio) — cards missing that data are simply skipped.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXERCISE_LINKS.map((link) => (
            <Link
              key={link.type}
              to={`/student/flashcard-sets/${setId}/exercises/${link.type}`}
              className="rounded-md border border-primary-300 bg-base-white px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-100"
            >
              {link.label}
            </Link>
          ))}
          <Link
            to={`/student/flashcard-sets/${setId}/matching`}
            className="rounded-md border border-primary-300 bg-base-white px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-100"
          >
            Matching
          </Link>
          <Link
            to={`/student/flashcard-sets/${setId}/sentence`}
            className="rounded-md border border-primary-300 bg-base-white px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-100"
          >
            Use it in a sentence
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-primary-200 p-4">
        <h2 className="text-lg font-bold text-base-black">Games</h2>
        <p className="mt-1 text-sm text-base-black/60">
          Play a quick vocabulary game using the words in this set.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            to={`/student/flashcard-sets/${setId}/games/space-shooter`}
            className="rounded-md border border-primary-300 bg-base-white px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-100"
          >
            Space Shooter
          </Link>
          <Link
            to={`/student/flashcard-sets/${setId}/games/runner`}
            className="rounded-md border border-primary-300 bg-base-white px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-100"
          >
            Word Runner
          </Link>
        </div>
      </section>
    </div>
  );
}

export default StudentFlashcardSetPage;
