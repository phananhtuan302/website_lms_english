import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { SelfCheckAnswerResponse, SelfCheckPromptDTO } from '@platform/shared';
import { flashcardApi } from '../lib/flashcardApi';
import { ApiError } from '../lib/apiClient';
import VocabConfetti from '../components/VocabConfetti';

/**
 * "Tự kiểm tra" (self-check) quiz runtime (T-089) — a completely different,
 * student-initiated feature from the unrelated teacher-assigned "Kiểm tra từ vựng"
 * (Vocabulary Check) test elsewhere in the product. One multiple-choice question per
 * card the student has personally marked "Đã thuộc" but not yet verified
 * (`GET /:setId/self-check` has already excluded everything else), immediate
 * correct/incorrect feedback plus the exact point delta (+10/-20) that answer just added
 * to the permanent ledger — same general UX weight/structure as
 * `StudentVocabExercisePage.tsx`, adapted for a choice-click instead of a typed answer.
 */
function StudentVocabSelfCheckPage() {
  const { t } = useTranslation();
  const { setId } = useParams<{ setId: string }>();
  const [prompts, setPrompts] = useState<SelfCheckPromptDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [result, setResult] = useState<SelfCheckAnswerResponse | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [attemptedCount, setAttemptedCount] = useState(0);
  const [netPoints, setNetPoints] = useState(0);

  useEffect(() => {
    if (!setId) return;
    flashcardApi
      .listSelfCheckPrompts(setId)
      .then(setPrompts)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('studentVocabSelfCheck.loadFailed')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    return <p className="text-center text-base-black/60">{t('common.loading')}</p>;
  }

  if (prompts.length === 0) {
    return (
      <div className="vocab-zone vocab-canvas mx-auto -mt-4 -mb-4 flex w-full max-w-xl flex-col gap-4 rounded-3xl p-4 sm:-mt-6 sm:-mb-6 sm:p-6">
        <Link to={`/student/flashcard-sets/${setId}`} className="text-sm font-semibold text-primary-700 hover:text-primary-800">
          {t('studentVocabSelfCheck.backToSet')}
        </Link>
        <p className="text-sm text-base-black/60">{t('studentVocabSelfCheck.noEligibleCards')}</p>
      </div>
    );
  }

  if (index >= prompts.length) {
    return (
      <div className="vocab-zone vocab-canvas mx-auto -mt-4 -mb-4 flex w-full max-w-xl flex-col items-center gap-4 rounded-3xl p-6 text-center sm:-mt-6 sm:-mb-6 sm:p-10">
        <div className="relative">
          {netPoints >= 0 && <VocabConfetti />}
          <span className="text-5xl">{netPoints >= 0 ? '🏆' : '💪'}</span>
        </div>
        <h1 className="vocab-display text-2xl font-bold text-primary-800">{t('studentVocabSelfCheck.doneHeading')}</h1>
        <p className="text-base-black/70">
          {t('studentVocabSelfCheck.resultLine', { correct: correctCount, total: attemptedCount })}
        </p>
        <p
          className={`vocab-display text-2xl font-bold ${netPoints < 0 ? 'text-red-600' : 'text-green-600'}`}
        >
          {t('studentVocabSelfCheck.netPointsLine', { points: netPoints })}
        </p>
        <Link
          to={`/student/flashcard-sets/${setId}`}
          className="vocab-btn-primary inline-flex min-h-12 items-center bg-primary-500 px-6 py-2.5 text-sm text-base-white"
        >
          {t('studentVocabSelfCheck.backToSetButton')}
        </Link>
      </div>
    );
  }

  const prompt = prompts[index];

  async function handleCheck(choice: string) {
    if (isChecking || result) return;
    setSelectedChoice(choice);
    setIsChecking(true);
    setError(null);
    try {
      const response = await flashcardApi.answerSelfCheck(setId!, prompt.cardId, { answer: choice });
      setResult(response);
      setAttemptedCount((n) => n + 1);
      setNetPoints((n) => n + response.pointsDelta);
      if (response.correct) setCorrectCount((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('studentVocabSelfCheck.checkFailed'));
      setSelectedChoice(null);
    } finally {
      setIsChecking(false);
    }
  }

  function handleNext() {
    setResult(null);
    setSelectedChoice(null);
    setIndex((i) => i + 1);
  }

  return (
    <div className="vocab-zone vocab-canvas mx-auto -mt-4 -mb-4 flex w-full max-w-xl flex-col gap-6 rounded-3xl p-4 sm:-mt-6 sm:-mb-6 sm:p-6">
      <div className="flex items-center justify-between">
        <Link to={`/student/flashcard-sets/${setId}`} className="text-sm font-semibold text-primary-700 hover:text-primary-800">
          {t('studentVocabSelfCheck.backToSet')}
        </Link>
        <span className="rounded-full bg-base-white px-3 py-1 text-xs font-bold text-primary-700 shadow-sm">
          {t('studentVocabSelfCheck.progress', { current: index + 1, total: prompts.length })}
        </span>
      </div>

      <div>
        <h1 className="vocab-display text-2xl font-bold text-primary-800">{t('studentVocabSelfCheck.heading')}</h1>
        <p className="mt-1 text-sm text-base-black/60">{t('studentVocabSelfCheck.instructions')}</p>
      </div>

      <div className="rounded-3xl border-2 border-primary-200 bg-base-white p-6 text-center shadow-[0_8px_0_0_rgb(var(--color-primary-100))] sm:p-8">
        <p className="vocab-display text-4xl font-bold text-primary-800">{prompt.term}</p>
      </div>

      <div className="flex flex-col gap-2.5">
        {prompt.choices.map((choice) => {
          const isSelected = selectedChoice === choice;
          const isCorrectChoice = result && choice === result.correctMeaning;
          let choiceClass =
            'vocab-tile border-2 border-primary-200 bg-base-white px-4 py-3.5 text-left font-semibold text-base-black hover:border-primary-400';
          if (result) {
            if (isCorrectChoice) {
              choiceClass = 'vocab-tile vocab-anim-pop border-2 border-green-400 bg-green-50 px-4 py-3.5 text-left font-semibold text-green-800';
            } else if (isSelected) {
              choiceClass = 'vocab-tile vocab-anim-shake border-2 border-red-400 bg-red-50 px-4 py-3.5 text-left font-semibold text-red-700';
            } else {
              choiceClass = 'vocab-tile border-2 border-primary-100 bg-base-white px-4 py-3.5 text-left font-semibold text-base-black/40';
            }
          }
          return (
            <button
              key={choice}
              type="button"
              disabled={isChecking || !!result}
              onClick={() => void handleCheck(choice)}
              className={choiceClass}
            >
              {choice}
            </button>
          );
        })}
      </div>

      {result && (
        <div
          role="alert"
          className={`vocab-anim-pop relative overflow-hidden rounded-2xl border-2 px-4 py-4 text-sm ${
            result.correct
              ? 'border-green-300 bg-green-50 text-green-800'
              : 'border-red-300 bg-red-50 text-red-700'
          }`}
        >
          {result.correct && <VocabConfetti />}
          <p className="text-base font-bold">
            {result.correct
              ? `✅ ${t('studentVocabSelfCheck.correct', { points: result.pointsDelta })}`
              : `✗ ${t('studentVocabSelfCheck.notQuite', { points: result.pointsDelta })}`}
          </p>
          {!result.correct && (
            <p className="mt-1">{t('studentVocabSelfCheck.correctMeaningWas', { meaning: result.correctMeaning })}</p>
          )}
          <button
            type="button"
            onClick={handleNext}
            className={`vocab-btn-primary mt-3 px-4 py-2 text-sm text-base-white ${
              result.correct ? 'vocab-btn-green bg-green-500' : 'bg-primary-500'
            }`}
          >
            {index + 1 < prompts.length ? t('studentVocabSelfCheck.next') : t('studentVocabSelfCheck.finish')}
          </button>
        </div>
      )}
    </div>
  );
}

export default StudentVocabSelfCheckPage;
