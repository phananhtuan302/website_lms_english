import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  GrammarChoiceInput,
  GrammarExerciseDTO,
  QuestionType,
  UpdateGrammarExerciseRequest,
} from '@platform/shared';

interface GrammarExerciseEditorProps {
  exercise: GrammarExerciseDTO;
  index: number;
  onSave: (body: UpdateGrammarExerciseRequest) => Promise<void>;
  onDelete: () => void;
}

/** Objective-only types a Grammar exercise supports (T-048) — no `essay`, unlike
 * `QuestionEditor.tsx`'s full `QuestionType` set (see schema.prisma's Grammar module
 * doc comment for why). */
const GRAMMAR_EXERCISE_TYPES: QuestionType[] = ['multipleChoice', 'trueFalse', 'fillBlank'];

/**
 * Editor for a single Grammar practice exercise (T-046/T-048) — same structure/save
 * convention as `QuestionEditor.tsx` (local draft state, save on blur/structural
 * action), just without the essay branch or reorder controls (Grammar exercises don't
 * have a reorder endpoint — new ones are simply appended).
 */
function GrammarExerciseEditor({ exercise, index, onSave, onDelete }: GrammarExerciseEditorProps) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState(exercise.prompt);
  const [type, setType] = useState<QuestionType>(exercise.type);
  const [choices, setChoices] = useState<GrammarChoiceInput[]>(
    exercise.choices.map((c) => ({ id: c.id, text: c.text, isCorrect: c.isCorrect })),
  );
  const [acceptedAnswersText, setAcceptedAnswersText] = useState(exercise.acceptedAnswers.join(', '));
  const [saveError, setSaveError] = useState<string | null>(null);

  function currentBody(): UpdateGrammarExerciseRequest {
    if (type === 'fillBlank') {
      return {
        type,
        prompt,
        acceptedAnswers: acceptedAnswersText
          .split(',')
          .map((a) => a.trim())
          .filter((a) => a.length > 0),
      };
    }
    return { type, prompt, choices };
  }

  async function save(body: UpdateGrammarExerciseRequest = currentBody()) {
    try {
      setSaveError(null);
      await onSave(body);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('grammarExerciseEditor.saveFailed'));
    }
  }

  function handleTypeChange(newType: QuestionType) {
    setType(newType);
    let nextChoices = choices;
    if (newType === 'trueFalse') {
      nextChoices = [
        { text: t('grammarExerciseEditor.trueChoice'), isCorrect: true },
        { text: t('grammarExerciseEditor.falseChoice'), isCorrect: false },
      ];
      setChoices(nextChoices);
    } else if (newType === 'multipleChoice' && choices.length < 2) {
      nextChoices = [
        { text: '', isCorrect: true },
        { text: '', isCorrect: false },
      ];
      setChoices(nextChoices);
    }
    if (newType === 'fillBlank') {
      void save({
        type: newType,
        prompt,
        acceptedAnswers: acceptedAnswersText
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean),
      });
      return;
    }
    void save({ type: newType, prompt, choices: nextChoices });
  }

  function updateChoiceText(choiceIndex: number, text: string) {
    setChoices((prev) => prev.map((c, i) => (i === choiceIndex ? { ...c, text } : c)));
  }

  function markCorrect(choiceIndex: number) {
    const next = choices.map((c, i) => ({ ...c, isCorrect: i === choiceIndex }));
    setChoices(next);
    void save({ type, prompt, choices: next });
  }

  function addChoice() {
    const next = [...choices, { text: '', isCorrect: false }];
    setChoices(next);
    void save({ type, prompt, choices: next });
  }

  function removeChoice(choiceIndex: number) {
    const removed = choices[choiceIndex];
    let next = choices.filter((_, i) => i !== choiceIndex);
    if (removed.isCorrect && next.length > 0) {
      next = next.map((c, i) => (i === 0 ? { ...c, isCorrect: true } : c));
    }
    setChoices(next);
    void save({ type, prompt, choices: next });
  }

  // `essay`/`speaking`/`matching` are included only so this map stays exhaustive against
  // the full shared `QuestionType` union — Grammar practice exercises are objective-only
  // multiple-choice/true-false/fill-blank, so none of the three is ever actually offered
  // by this editor's type dropdown below (see this component's/`teacherGrammar.routes.ts`'s
  // validation, which rejects all three server-side).
  const typeLabel: Record<QuestionType, string> = {
    multipleChoice: t('grammarExerciseEditor.typeLabel.multipleChoice'),
    trueFalse: t('grammarExerciseEditor.typeLabel.trueFalse'),
    fillBlank: t('grammarExerciseEditor.typeLabel.fillBlank'),
    essay: t('grammarExerciseEditor.typeLabel.essay'),
    speaking: t('grammarExerciseEditor.typeLabel.speaking'),
    matching: t('grammarExerciseEditor.typeLabel.matching'),
  };

  return (
    <div className="rounded-lg border border-primary-100 bg-base-white p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700">
          {t('grammarExerciseEditor.exerciseLabel', { index: index + 1, type: typeLabel[type] })}
        </span>
        <div className="flex items-center gap-1">
          <select
            value={type}
            onChange={(event) => handleTypeChange(event.target.value as QuestionType)}
            className="rounded-md border border-primary-200 px-2 py-1 text-xs"
            aria-label={t('grammarExerciseEditor.exerciseTypeAriaLabel')}
          >
            {GRAMMAR_EXERCISE_TYPES.map((optionType) => (
              <option key={optionType} value={optionType}>
                {typeLabel[optionType]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onDelete}
            className="ml-2 rounded px-2 py-3 text-xs font-medium text-red-600 hover:bg-red-50 sm:py-1"
          >
            {t('grammarExerciseEditor.delete')}
          </button>
        </div>
      </div>

      <label className="mt-3 flex flex-col gap-1 text-sm font-medium text-base-black">
        {t('grammarExerciseEditor.promptLabel')}
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onBlur={() => void save()}
          rows={2}
          className="rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
      </label>

      {type === 'fillBlank' ? (
        <label className="mt-3 flex flex-col gap-1 text-sm font-medium text-base-black">
          {t('grammarExerciseEditor.acceptedAnswersLabel')}
          <input
            type="text"
            value={acceptedAnswersText}
            onChange={(event) => setAcceptedAnswersText(event.target.value)}
            onBlur={() => void save()}
            placeholder={t('grammarExerciseEditor.acceptedAnswersPlaceholder')}
            className="rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
        </label>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <span className="text-sm font-medium text-base-black">{t('grammarExerciseEditor.choicesLabel')}</span>
          {choices.map((choice, choiceIndex) => (
            <div key={choice.id ?? `new-${choiceIndex}`} className="flex items-center gap-2">
              <input
                type="radio"
                name={`correct-${exercise.id}`}
                checked={choice.isCorrect}
                onChange={() => markCorrect(choiceIndex)}
                aria-label={t('grammarExerciseEditor.markCorrectAriaLabel', { number: choiceIndex + 1 })}
              />
              <input
                type="text"
                value={choice.text}
                disabled={type === 'trueFalse'}
                onChange={(event) => updateChoiceText(choiceIndex, event.target.value)}
                onBlur={() => void save()}
                className="flex-1 rounded-md border border-primary-200 px-3 py-1.5 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:bg-primary-50"
              />
              {type === 'multipleChoice' && choices.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeChoice(choiceIndex)}
                  aria-label={t('grammarExerciseEditor.removeChoiceAriaLabel', { number: choiceIndex + 1 })}
                  className="rounded px-2 py-3 text-xs font-medium text-red-600 hover:bg-red-50 sm:py-1"
                >
                  {t('grammarExerciseEditor.remove')}
                </button>
              )}
            </div>
          ))}
          {type === 'multipleChoice' && (
            <button
              type="button"
              onClick={addChoice}
              className="self-start rounded-md border border-primary-200 px-3 py-3 text-xs font-medium text-primary-700 hover:bg-primary-50 sm:py-1"
            >
              {t('grammarExerciseEditor.addChoice')}
            </button>
          )}
        </div>
      )}

      {saveError && <p className="mt-2 text-xs text-red-600">{saveError}</p>}
    </div>
  );
}

export default GrammarExerciseEditor;
