import { useState } from 'react';
import type {
  ChoiceInput,
  QuestionDTO,
  QuestionType,
  UpdateQuestionRequest,
} from '@platform/shared';

interface QuestionEditorProps {
  question: QuestionDTO;
  index: number;
  count: number;
  onSave: (body: UpdateQuestionRequest) => Promise<void>;
  onDelete: () => void;
  onMove: (direction: 'up' | 'down') => void;
}

/**
 * Editor for a single question of any of the three objective types (T-008). Keeps its
 * own local draft state (prompt/choices/acceptedAnswers) so typing doesn't fire a
 * request per keystroke — a save only happens when a field loses focus (`onBlur`) or a
 * structural action happens (add/remove choice, mark correct, change type), matching
 * the granular-endpoint design in `lib/teacherApi.ts` (`PATCH` sends the question's
 * FULL current state, since choices are reconciled as a whole array server-side).
 */
function QuestionEditor({ question, index, count, onSave, onDelete, onMove }: QuestionEditorProps) {
  const [prompt, setPrompt] = useState(question.prompt);
  const [type, setType] = useState<QuestionType>(question.type);
  const [choices, setChoices] = useState<ChoiceInput[]>(
    question.choices.map((c) => ({ id: c.id, text: c.text, isCorrect: c.isCorrect })),
  );
  const [acceptedAnswersText, setAcceptedAnswersText] = useState(
    question.acceptedAnswers.join(', '),
  );
  // Essay max score (T-042) — defaults to 10 (matches the server's own default) when a
  // question has none yet, e.g. right after switching TO essay from another type.
  const [essayMaxScoreText, setEssayMaxScoreText] = useState(
    String(question.essayMaxScore ?? 10),
  );
  // Speaking (T-052) — response window defaults to 60 seconds (matches the server's own
  // default); prompt audio is optional even for a speaking question.
  const [allowedResponseSecondsText, setAllowedResponseSecondsText] = useState(
    String(question.allowedResponseSeconds ?? 60),
  );
  const [promptAudioUrl, setPromptAudioUrl] = useState(question.promptAudioUrl ?? '');
  const [saveError, setSaveError] = useState<string | null>(null);

  function currentBody(): UpdateQuestionRequest {
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
    if (type === 'essay') {
      const parsed = Number(essayMaxScoreText);
      return { type, prompt, essayMaxScore: Number.isFinite(parsed) && parsed > 0 ? parsed : 10 };
    }
    if (type === 'speaking') {
      const parsed = Number(allowedResponseSecondsText);
      return {
        type,
        prompt,
        allowedResponseSeconds: Number.isFinite(parsed) && parsed > 0 ? parsed : 60,
        promptAudioUrl: promptAudioUrl.trim() === '' ? null : promptAudioUrl.trim(),
      };
    }
    return { type, prompt, choices };
  }

  async function save(body: UpdateQuestionRequest = currentBody()) {
    try {
      setSaveError(null);
      await onSave(body);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save question.');
    }
  }

  function handleTypeChange(newType: QuestionType) {
    setType(newType);
    let nextChoices = choices;
    if (newType === 'trueFalse') {
      nextChoices = [
        { text: 'True', isCorrect: true },
        { text: 'False', isCorrect: false },
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
    if (newType === 'essay') {
      const parsed = Number(essayMaxScoreText);
      void save({ type: newType, prompt, essayMaxScore: Number.isFinite(parsed) && parsed > 0 ? parsed : 10 });
      return;
    }
    if (newType === 'speaking') {
      const parsed = Number(allowedResponseSecondsText);
      void save({
        type: newType,
        prompt,
        allowedResponseSeconds: Number.isFinite(parsed) && parsed > 0 ? parsed : 60,
        promptAudioUrl: promptAudioUrl.trim() === '' ? null : promptAudioUrl.trim(),
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

  const typeLabel: Record<QuestionType, string> = {
    multipleChoice: 'Multiple choice',
    trueFalse: 'True / False',
    fillBlank: 'Fill in the blank',
    essay: 'Essay (Writing)',
    speaking: 'Speaking',
  };

  return (
    <div className="rounded-lg border border-primary-100 bg-base-white p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700">
          Q{index + 1} · {typeLabel[type]}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMove('up')}
            disabled={index === 0}
            aria-label="Move question up"
            className="rounded px-2 py-1 text-xs text-base-black/60 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove('down')}
            disabled={index === count - 1}
            aria-label="Move question down"
            className="rounded px-2 py-1 text-xs text-base-black/60 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ↓
          </button>
          <select
            value={type}
            onChange={(event) => handleTypeChange(event.target.value as QuestionType)}
            className="ml-2 rounded-md border border-primary-200 px-2 py-1 text-xs"
            aria-label="Question type"
          >
            <option value="multipleChoice">Multiple choice</option>
            <option value="trueFalse">True / False</option>
            <option value="fillBlank">Fill in the blank</option>
            <option value="essay">Essay (Writing)</option>
            <option value="speaking">Speaking</option>
          </select>
          <button
            type="button"
            onClick={onDelete}
            className="ml-2 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      <label className="mt-3 flex flex-col gap-1 text-sm font-medium text-base-black">
        Prompt
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
          Accepted answers (comma-separated)
          <input
            type="text"
            value={acceptedAnswersText}
            onChange={(event) => setAcceptedAnswersText(event.target.value)}
            onBlur={() => void save()}
            placeholder="e.g. Paris, paris"
            className="rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
        </label>
      ) : type === 'essay' ? (
        <label className="mt-3 flex flex-col gap-1 text-sm font-medium text-base-black">
          Max score (teacher grades manually out of this many points, T-042)
          <input
            type="number"
            min={1}
            value={essayMaxScoreText}
            onChange={(event) => setEssayMaxScoreText(event.target.value)}
            onBlur={() => void save()}
            className="w-32 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
          <span className="text-xs font-normal text-base-black/50">
            The student submits free text; there are no choices or an auto-graded answer for this
            question type.
          </span>
        </label>
      ) : type === 'speaking' ? (
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            Response time allowed (seconds, T-052)
            <input
              type="number"
              min={5}
              max={300}
              value={allowedResponseSecondsText}
              onChange={(event) => setAllowedResponseSecondsText(event.target.value)}
              onBlur={() => void save()}
              className="w-32 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            Prompt audio URL (optional)
            <input
              type="text"
              value={promptAudioUrl}
              onChange={(event) => setPromptAudioUrl(event.target.value)}
              onBlur={() => void save()}
              placeholder="https://... (leave blank for a text-only prompt)"
              className="rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </label>
          <span className="text-xs font-normal text-base-black/50">
            The student records a spoken answer in-browser within the time allowed, and it is
            graded automatically (Mock AI grading, T-051) — you can review and override the score
            afterward from the attempt detail page.
          </span>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <span className="text-sm font-medium text-base-black">
            Choices (select the correct one)
          </span>
          {choices.map((choice, choiceIndex) => (
            <div key={choice.id ?? `new-${choiceIndex}`} className="flex items-center gap-2">
              <input
                type="radio"
                name={`correct-${question.id}`}
                checked={choice.isCorrect}
                onChange={() => markCorrect(choiceIndex)}
                aria-label={`Mark choice ${choiceIndex + 1} as correct`}
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
                  aria-label={`Remove choice ${choiceIndex + 1}`}
                  className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          {type === 'multipleChoice' && (
            <button
              type="button"
              onClick={addChoice}
              className="self-start rounded-md border border-primary-200 px-3 py-1 text-xs font-medium text-primary-700 hover:bg-primary-50"
            >
              + Add choice
            </button>
          )}
        </div>
      )}

      {saveError && <p className="mt-2 text-xs text-red-600">{saveError}</p>}
    </div>
  );
}

export default QuestionEditor;
