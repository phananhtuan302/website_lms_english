import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { SelfCheckAnswerResponse, SelfCheckPromptDTO } from '@platform/shared';
import { flashcardApi } from '../lib/flashcardApi';
import { ApiError } from '../lib/apiClient';

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
      <div className="mx-auto max-w-xl">
        <Link to={`/student/flashcard-sets/${setId}`} className="text-sm text-primary-600 hover:underline">
          {t('studentVocabSelfCheck.backToSet')}
        </Link>
        <p className="mt-4 text-sm text-base-black/60">{t('studentVocabSelfCheck.noEligibleCards')}</p>
      </div>
    );
  }

  if (index >= prompts.length) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 text-center">
        <h1 className="text-xl font-bold text-primary-700">{t('studentVocabSelfCheck.doneHeading')}</h1>
        <p className="text-base-black/70">
          {t('studentVocabSelfCheck.resultLine', { correct: correctCount, total: attemptedCount })}
        </p>
        <p className={`text-lg font-semibold ${netPoints < 0 ? 'text-red-700' : 'text-green-700'}`}>
          {t('studentVocabSelfCheck.netPointsLine', { points: netPoints })}
        </p>
        <Link
          to={`/student/flashcard-sets/${setId}`}
          className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
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
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link to={`/student/flashcard-sets/${setId}`} className="text-sm text-primary-600 hover:underline">
          {t('studentVocabSelfCheck.backToSet')}
        </Link>
        <span className="text-sm text-base-black/60">
          {t('studentVocabSelfCheck.progress', { current: index + 1, total: prompts.length })}
        </span>
      </div>

      <div>
        <h1 className="text-xl font-bold text-primary-700">{t('studentVocabSelfCheck.heading')}</h1>
        <p className="mt-1 text-sm text-base-black/60">{t('studentVocabSelfCheck.instructions')}</p>
      </div>

      <div className="rounded-xl border border-primary-200 bg-primary-50 p-6 text-center">
        <p className="text-3xl font-bold text-base-black">{prompt.term}</p>
      </div>

      <div className="flex flex-col gap-2">
        {prompt.choices.map((choice) => {
          const isSelected = selectedChoice === choice;
          const isCorrectChoice = result && choice === result.correctMeaning;
          let choiceClass =
            'rounded-md border border-primary-200 bg-base-white px-4 py-3 text-left text-base-black transition-colors hover:border-primary-400';
          if (result) {
            if (isCorrectChoice) {
              choiceClass = 'rounded-md border border-green-400 bg-green-50 px-4 py-3 text-left text-green-800';
            } else if (isSelected) {
              choiceClass = 'rounded-md border border-red-400 bg-red-50 px-4 py-3 text-left text-red-700';
            } else {
              choiceClass = 'rounded-md border border-primary-100 bg-base-white px-4 py-3 text-left text-base-black/50';
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
          className={`rounded-md border px-4 py-3 text-sm ${
            result.correct
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          <p className="font-semibold">
            {result.correct
              ? t('studentVocabSelfCheck.correct', { points: result.pointsDelta })
              : t('studentVocabSelfCheck.notQuite', { points: result.pointsDelta })}
          </p>
          {!result.correct && (
            <p className="mt-1">{t('studentVocabSelfCheck.correctMeaningWas', { meaning: result.correctMeaning })}</p>
          )}
          <button
            type="button"
            onClick={handleNext}
            className="mt-3 rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
          >
            {index + 1 < prompts.length ? t('studentVocabSelfCheck.next') : t('studentVocabSelfCheck.finish')}
          </button>
        </div>
      )}
    </div>
  );
}

export default StudentVocabSelfCheckPage;
