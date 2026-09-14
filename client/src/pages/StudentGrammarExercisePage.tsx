import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { CheckGrammarExerciseResponse, GrammarExercisePromptDTO } from '@platform/shared';
import { grammarApi } from '../lib/grammarApi';
import { ApiError } from '../lib/apiClient';

/**
 * Grammar practice-exercise runtime (T-048) — one exercise at a time, same "answer-free
 * prompt, immediate correct/incorrect feedback with the correct answer on a miss, move
 * to the next" flow as `StudentVocabExercisePage.tsx`. Handles both exercise shapes:
 * `multipleChoice`/`trueFalse` (pick a choice) and `fillBlank` (type an answer) — grading
 * happens server-side via the exact same `lib/grading.ts#gradeAnswer` function T-013
 * uses for Test answers (see `studentGrammar.routes.ts`'s check-endpoint doc comment).
 */
function StudentGrammarExercisePage() {
  const { topicId } = useParams<{ topicId: string }>();
  const [prompts, setPrompts] = useState<GrammarExercisePromptDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [textAnswer, setTextAnswer] = useState('');
  const [result, setResult] = useState<CheckGrammarExerciseResponse | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [attemptedCount, setAttemptedCount] = useState(0);

  useEffect(() => {
    if (!topicId) return;
    grammarApi
      .listExercisePrompts(topicId)
      .then(setPrompts)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load exercises.'));
  }, [topicId]);

  if (!topicId) return null;

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
        <Link to={`/student/grammar-topics/${topicId}`} className="text-sm text-primary-600 hover:underline">
          ← Back to topic
        </Link>
        <p className="mt-4 text-sm text-base-black/60">This topic has no practice exercises yet.</p>
      </div>
    );
  }

  if (index >= prompts.length) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 text-center">
        <h1 className="text-xl font-bold text-primary-700">Practice complete!</h1>
        <p className="text-base-black/70">
          You got {correctCount} of {attemptedCount} correct.
        </p>
        <Link
          to={`/student/grammar-topics/${topicId}`}
          className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
        >
          Back to topic
        </Link>
      </div>
    );
  }

  const prompt = prompts[index];
  const isChoiceType = prompt.type === 'multipleChoice' || prompt.type === 'trueFalse';

  async function handleCheck(selectedChoiceId?: string) {
    if (isChecking) return;
    if (isChoiceType && !selectedChoiceId) return;
    if (!isChoiceType && !textAnswer.trim()) return;

    setIsChecking(true);
    setError(null);
    try {
      const response = await grammarApi.checkExerciseAnswer(topicId!, prompt.id, {
        selectedChoiceId: isChoiceType ? selectedChoiceId : undefined,
        textAnswer: isChoiceType ? undefined : textAnswer,
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
    setTextAnswer('');
    setIndex((i) => i + 1);
  }

  function correctAnswerLabel(): string {
    if (!result) return '';
    if (result.correctChoiceId) {
      return prompt.choices.find((c) => c.id === result.correctChoiceId)?.text ?? '';
    }
    return result.correctAnswers.join(' / ');
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link to={`/student/grammar-topics/${topicId}`} className="text-sm text-primary-600 hover:underline">
          ← Back to topic
        </Link>
        <span className="text-sm text-base-black/60">
          {index + 1} of {prompts.length}
        </span>
      </div>

      <div className="rounded-xl border border-primary-200 bg-primary-50 p-6">
        <p className="text-lg font-medium text-base-black">{prompt.prompt}</p>
      </div>

      {!result ? (
        isChoiceType ? (
          <div className="flex flex-col gap-2">
            {prompt.choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                disabled={isChecking}
                onClick={() => void handleCheck(choice.id)}
                className="rounded-md border border-primary-300 bg-base-white px-4 py-2 text-left text-sm font-medium text-base-black transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {choice.text}
              </button>
            ))}
          </div>
        ) : (
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void handleCheck();
            }}
            className="flex gap-3"
          >
            <input
              type="text"
              value={textAnswer}
              onChange={(event) => setTextAnswer(event.target.value)}
              placeholder="Type your answer"
              autoFocus
              className="flex-1 rounded-md border border-primary-200 px-3 py-2 text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
            <button
              type="submit"
              disabled={!textAnswer.trim() || isChecking}
              className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isChecking ? 'Checking...' : 'Check'}
            </button>
          </form>
        )
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
          {!result.correct && <p className="mt-1">The correct answer was: {correctAnswerLabel()}</p>}
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

export default StudentGrammarExercisePage;
