import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { MatchingMode, MatchingPairDTO } from '@platform/shared';
import { flashcardApi } from '../lib/flashcardApi';
import { ApiError } from '../lib/apiClient';

const MODES: MatchingMode[] = ['meaning', 'image', 'synonym', 'antonym'];

/** Fisher-Yates shuffle — used to independently randomize the left (term) and right
 * (target) columns so the two columns never happen to line up in the same order. */
function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Matching exercise (T-028): four modes (word-to-meaning/image/synonym/antonym),
 * click-to-pair UI — click one term on the left, then one target on the right; a
 * correct pair locks in green, an incorrect pair flashes red and both stay clickable
 * again. Completing every pair records progress via `flashcardApi.completeMatching`
 * (T-028's "each completed round records exercise progress").
 *
 * Documented choice: a card's completion "correct" verdict (sent to the server) means
 * it was paired correctly on the FIRST attempt — any wrong attempt touching that card
 * (as either the clicked term or the clicked target) marks it incorrect for progress
 * purposes even if the student eventually gets it right by elimination, so guessing
 * doesn't look identical to knowing the word.
 *
 * A mode with fewer than 2 eligible pairs is treated as unavailable for this set (per
 * T-028's acceptance criteria) — the server never errors for this, it just returns a
 * short/empty list, and this page shows an inline message instead of an unplayable
 * one-tile round.
 */
function StudentVocabMatchingPage() {
  const { t } = useTranslation();
  const MODE_META: Record<MatchingMode, { label: string; tabLabel: string }> = {
    meaning: {
      label: t('studentVocabMatching.modes.meaning.label'),
      tabLabel: t('studentVocabMatching.modes.meaning.tabLabel'),
    },
    image: {
      label: t('studentVocabMatching.modes.image.label'),
      tabLabel: t('studentVocabMatching.modes.image.tabLabel'),
    },
    synonym: {
      label: t('studentVocabMatching.modes.synonym.label'),
      tabLabel: t('studentVocabMatching.modes.synonym.tabLabel'),
    },
    antonym: {
      label: t('studentVocabMatching.modes.antonym.label'),
      tabLabel: t('studentVocabMatching.modes.antonym.tabLabel'),
    },
  };
  const { setId } = useParams<{ setId: string }>();
  const [mode, setMode] = useState<MatchingMode>('meaning');
  const [pairs, setPairs] = useState<MatchingPairDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leftOrder, setLeftOrder] = useState<MatchingPairDTO[]>([]);
  const [rightOrder, setRightOrder] = useState<MatchingPairDTO[]>([]);
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [wrongAttempts, setWrongAttempts] = useState<Set<string>>(new Set());
  const [flashWrong, setFlashWrong] = useState<{ left: string | null; right: string | null }>({
    left: null,
    right: null,
  });
  const [completed, setCompleted] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const isSubmittingRef = useRef(false);

  // Reset round state the moment `mode`/`reloadKey` changes, using React's documented
  // "adjust state while rendering" pattern (https://react.dev/learn/you-might-not-need-an-effect)
  // instead of an effect — an effect that calls `setState` synchronously in its body
  // (before any async boundary) triggers an avoidable extra commit, which is exactly
  // what `react-hooks/set-state-in-effect` flags. The actual data fetch below still
  // needs a real effect (it's a genuine side effect), but every `setState` call inside
  // it happens inside a `.then`/`.catch`, not synchronously in the effect body.
  const loadKey = `${setId ?? ''}:${mode}:${reloadKey}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  if (setId && loadKey !== loadedKey) {
    setLoadedKey(loadKey);
    setPairs(null);
    setError(null);
    setCompleted(false);
    setSelectedLeft(null);
    setMatched(new Set());
    setWrongAttempts(new Set());
  }

  useEffect(() => {
    if (!setId) return;
    flashcardApi
      .listMatchingPairs(setId, mode)
      .then((loaded) => {
        setPairs(loaded);
        setLeftOrder(shuffled(loaded));
        setRightOrder(shuffled(loaded));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t('studentVocabMatching.loadFailed')));
    // `t` is stable in practice (i18next only re-creates it on a real language change,
    // which never happens mid-session); re-running this fetch on every `t` identity
    // change would be pure noise, not a real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setId, mode, reloadKey]);

  const allMatched = useMemo(
    () => !!pairs && pairs.length > 0 && matched.size === pairs.length,
    [pairs, matched],
  );

  useEffect(() => {
    if (!setId || !pairs || !allMatched || completed || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    const results = pairs.map((p) => ({ cardId: p.cardId, correct: !wrongAttempts.has(p.cardId) }));
    flashcardApi
      .completeMatching(setId, mode, { results })
      .then(() => setCompleted(true))
      .catch((err) => setError(err instanceof ApiError ? err.message : t('studentVocabMatching.saveFailed')))
      .finally(() => {
        isSubmittingRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMatched]);

  if (!setId) return null;

  function handleLeftClick(cardId: string) {
    if (matched.has(cardId)) return;
    setSelectedLeft((current) => (current === cardId ? null : cardId));
  }

  function handleRightClick(rightCardId: string) {
    if (!selectedLeft || matched.has(rightCardId)) return;
    if (rightCardId === selectedLeft) {
      const leftCardId = selectedLeft;
      setMatched((prev) => new Set(prev).add(leftCardId));
      setSelectedLeft(null);
    } else {
      const leftCardId = selectedLeft;
      setWrongAttempts((prev) => new Set(prev).add(leftCardId).add(rightCardId));
      setFlashWrong({ left: leftCardId, right: rightCardId });
      setTimeout(() => setFlashWrong({ left: null, right: null }), 500);
      setSelectedLeft(null);
    }
  }

  function restart() {
    setReloadKey((k) => k + 1);
  }

  const correctCount = pairs ? pairs.filter((p) => !wrongAttempts.has(p.cardId)).length : 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link to={`/student/flashcard-sets/${setId}`} className="text-sm text-primary-600 hover:underline">
          {t('studentVocabMatching.backToSet')}
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-bold text-primary-700">{t('studentVocabMatching.heading')}</h1>
        <p className="mt-1 text-sm text-base-black/60">{t('studentVocabMatching.instructions')}</p>
      </div>

      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label={t('studentVocabMatching.modeTablistLabel')}
      >
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
              mode === m
                ? 'bg-primary-500 text-base-white'
                : 'border border-primary-300 bg-base-white text-primary-700 hover:bg-primary-100'
            }`}
          >
            {MODE_META[m].tabLabel}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {pairs === null && !error ? (
        <p className="text-center text-base-black/60">{t('common.loading')}</p>
      ) : pairs !== null && pairs.length < 2 ? (
        <p className="text-sm text-base-black/60">
          {t('studentVocabMatching.notEnoughWords', { modeLabel: MODE_META[mode].label })}
        </p>
      ) : (
        pairs !== null && (
          <>
            {completed ? (
              <div className="flex flex-col items-center gap-4 rounded-xl border border-primary-200 bg-primary-50 p-6 text-center">
                <h2 className="text-lg font-bold text-primary-700">{t('studentVocabMatching.roundComplete')}</h2>
                <p className="text-base-black/70">
                  {t('studentVocabMatching.resultLine', { correct: correctCount, total: pairs.length })}
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={restart}
                    className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
                  >
                    {t('studentVocabMatching.playAgain')}
                  </button>
                  <Link
                    to={`/student/flashcard-sets/${setId}`}
                    className="rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-100"
                  >
                    {t('studentVocabMatching.backToSetButton')}
                  </Link>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  {leftOrder.map((p) => (
                    <button
                      key={p.cardId}
                      type="button"
                      disabled={matched.has(p.cardId)}
                      onClick={() => handleLeftClick(p.cardId)}
                      className={`rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors ${
                        matched.has(p.cardId)
                          ? 'border-green-300 bg-green-50 text-green-800 opacity-70'
                          : flashWrong.left === p.cardId
                            ? 'border-red-400 bg-red-50 text-red-700'
                            : selectedLeft === p.cardId
                              ? 'border-primary-500 bg-primary-100 text-primary-800'
                              : 'border-primary-200 bg-base-white text-base-black hover:bg-primary-50'
                      }`}
                    >
                      {p.term}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-2">
                  {rightOrder.map((p) => (
                    <button
                      key={p.cardId}
                      type="button"
                      disabled={matched.has(p.cardId)}
                      onClick={() => handleRightClick(p.cardId)}
                      className={`rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors ${
                        matched.has(p.cardId)
                          ? 'border-green-300 bg-green-50 text-green-800 opacity-70'
                          : flashWrong.right === p.cardId
                            ? 'border-red-400 bg-red-50 text-red-700'
                            : 'border-primary-200 bg-base-white text-base-black hover:bg-primary-50'
                      }`}
                    >
                      {mode === 'image' ? (
                        <img
                          src={p.target}
                          alt={t('studentVocabMatching.matchTargetAlt')}
                          className="h-12 w-full object-contain"
                        />
                      ) : (
                        p.target
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}

export default StudentVocabMatchingPage;
