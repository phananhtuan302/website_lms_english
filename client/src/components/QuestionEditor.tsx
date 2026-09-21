import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { QuestionDTO, QuestionType, UpdateQuestionRequest } from '@platform/shared';
import { HoldSave } from '../lib/serialSaver';
import { useSerialSaver } from '../lib/editorSave';
import { newUuid } from '../lib/ids';

interface QuestionEditorProps {
  question: QuestionDTO;
  index: number;
  count: number;
  /** Saves the question's full current state; resolves when the server has it. */
  onSave: (body: UpdateQuestionRequest) => Promise<void>;
  /** Best-effort write while the page is closing / reloading (a keepalive request). */
  onSaveOnUnload?: (body: UpdateQuestionRequest) => void;
  onDelete: () => void;
  onMove: (direction: 'up' | 'down') => void;
}

interface ChoiceDraft {
  /** Real id for a choice that already exists, or a UUID invented here for a new one — either
   * way the server treats a repeated save of it as the same choice. */
  id: string;
  text: string;
  isCorrect: boolean;
}

interface Draft {
  prompt: string;
  type: QuestionType;
  choices: ChoiceDraft[];
  acceptedAnswersText: string;
  essayMaxScoreText: string;
  allowedResponseSecondsText: string;
  promptAudioUrl: string;
}

/** How long the "Hoàn tác" (undo) bar stays after a choice is removed. */
const UNDO_VISIBLE_MS = 6000;
/** Numbers are single values: save them sooner than free text so a quick reload keeps them. */
const NUMBER_DEBOUNCE_MS = 300;

/** A whole number within [min, max], or `null` for empty / half-typed / out-of-range text. */
function parseWholeNumber(text: string, min: number, max: number): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= min && value <= max ? value : null;
}

/**
 * Turns the on-screen draft into the request body, or throws `HoldSave` with a calm hint when it
 * is not ready to save yet (a half-typed number, an empty prompt, an empty answer box). Empty
 * NON-correct choices are simply left out of the request — they stay on screen and are saved as
 * soon as they get text — so a brand-new empty choice never blocks (or errors) the rest.
 */
function buildBody(draft: Draft, t: TFunction): UpdateQuestionRequest {
  if (draft.prompt.trim() === '') throw new HoldSave(t('questionEditor.hold.prompt'));
  const { type, prompt } = draft;

  if (type === 'fillBlank') {
    const acceptedAnswers = draft.acceptedAnswersText
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
    if (acceptedAnswers.length === 0) throw new HoldSave(t('questionEditor.hold.acceptedAnswer'));
    return { type, prompt, acceptedAnswers };
  }
  if (type === 'essay') {
    const essayMaxScore = parseWholeNumber(draft.essayMaxScoreText, 1, 1000);
    if (essayMaxScore === null) throw new HoldSave(t('questionEditor.hold.essayScore'));
    return { type, prompt, essayMaxScore };
  }
  if (type === 'speaking') {
    const allowedResponseSeconds = parseWholeNumber(draft.allowedResponseSecondsText, 5, 300);
    if (allowedResponseSeconds === null) throw new HoldSave(t('questionEditor.hold.speakingSeconds'));
    const url = draft.promptAudioUrl.trim();
    return { type, prompt, allowedResponseSeconds, promptAudioUrl: url === '' ? null : url };
  }

  const filled = draft.choices.filter((c) => c.text.trim() !== '');
  if (draft.choices.some((c) => c.isCorrect && c.text.trim() === '')) {
    throw new HoldSave(t('questionEditor.hold.correctEmpty'));
  }
  if (filled.length < 2) throw new HoldSave(t('questionEditor.hold.twoChoices'));
  return {
    type,
    prompt,
    choices: filled.map((c) => ({ id: c.id, text: c.text, isCorrect: c.isCorrect })),
  };
}

function initialDraft(question: QuestionDTO): Draft {
  return {
    prompt: question.prompt,
    type: question.type,
    choices: question.choices.map((c) => ({ id: c.id, text: c.text, isCorrect: c.isCorrect })),
    acceptedAnswersText: question.acceptedAnswers.join(', '),
    // Essay max score (T-042) defaults to 10 (matches the server's own default) when a question
    // has none yet, e.g. right after switching TO essay from another type.
    essayMaxScoreText: String(question.essayMaxScore ?? 10),
    // Speaking (T-052) — response window defaults to 60 seconds; prompt audio is optional.
    allowedResponseSecondsText: String(question.allowedResponseSeconds ?? 60),
    promptAudioUrl: question.promptAudioUrl ?? '',
  };
}

const inputClass =
  'rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200';

/**
 * Editor for a single question of any type. It keeps its own draft and saves it by itself — no
 * Save button: every change (typing, choosing the right answer, adding / removing an answer, a
 * number) is written to the server after a short pause, and immediately on blur or when the
 * teacher leaves. All the saving rules (one request at a time, latest state wins, retry, the
 * status line) live in `useSerialSaver`.
 */
function QuestionEditor({
  question,
  index,
  count,
  onSave,
  onSaveOnUnload,
  onDelete,
  onMove,
}: QuestionEditorProps) {
  const { t } = useTranslation();
  const [draft, setDraftState] = useState<Draft>(() => initialDraft(question));
  // Always the newest draft, even between two events that happen before React re-renders.
  const draftRef = useRef(draft);
  const [undo, setUndo] = useState<{ choice: ChoiceDraft; index: number } | null>(null);
  const focusChoiceId = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const saver = useSerialSaver<Draft>(
    `question:${question.id}`,
    async (value) => {
      await onSave(buildBody(value, t));
    },
    {
      saveOnUnload: (value) => {
        try {
          onSaveOnUnload?.(buildBody(value, t));
        } catch {
          // Not ready to save (held) — nothing to send.
        }
      },
    },
  );

  function update(patch: Partial<Draft>, options: { immediate?: boolean; delayMs?: number } = {}) {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraftState(next);
    saver.schedule(next, options);
  }

  // The "Hoàn tác" bar disappears by itself.
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  // Put the cursor into a freshly added choice.
  useEffect(() => {
    const id = focusChoiceId.current;
    if (!id) return;
    focusChoiceId.current = null;
    rootRef.current?.querySelector<HTMLInputElement>(`input[data-choice-id="${id}"]`)?.focus();
  }, [draft.choices.length]);

  function handleTypeChange(newType: QuestionType) {
    let choices = draftRef.current.choices;
    if (newType === 'trueFalse') {
      choices = [
        { id: newUuid(), text: t('questionEditor.trueLabel'), isCorrect: true },
        { id: newUuid(), text: t('questionEditor.falseLabel'), isCorrect: false },
      ];
    } else if (newType === 'multipleChoice' && choices.length < 2) {
      choices = ['A', 'B', 'C', 'D'].map((letter, i) => ({
        id: newUuid(),
        text: t('teacherTestEditor.defaultQuestions.option', { letter }),
        isCorrect: i === 0,
      }));
    }
    setUndo(null);
    update({ type: newType, choices }, { immediate: true });
  }

  function markCorrect(choiceId: string) {
    update(
      { choices: draftRef.current.choices.map((c) => ({ ...c, isCorrect: c.id === choiceId })) },
      { immediate: true },
    );
  }

  function updateChoiceText(choiceId: string, text: string) {
    update({ choices: draftRef.current.choices.map((c) => (c.id === choiceId ? { ...c, text } : c)) });
  }

  function addChoice() {
    const choice: ChoiceDraft = { id: newUuid(), text: '', isCorrect: false };
    focusChoiceId.current = choice.id;
    // An empty choice is not sent yet (it would be rejected); it is saved once it has text.
    update({ choices: [...draftRef.current.choices, choice] }, { immediate: true });
  }

  function removeChoice(choiceId: string) {
    const list = draftRef.current.choices;
    const at = list.findIndex((c) => c.id === choiceId);
    if (at === -1) return;
    const removed = list[at];
    let next = list.filter((c) => c.id !== choiceId);
    if (removed.isCorrect && next.length > 0) {
      // The right answer went away: hand the tick to the first answer that has text.
      const heir = next.find((c) => c.text.trim() !== '') ?? next[0];
      next = next.map((c) => (c.id === heir.id ? { ...c, isCorrect: true } : c));
    }
    setUndo({ choice: removed, index: at });
    update({ choices: next }, { immediate: true });
  }

  function undoRemoveChoice() {
    if (!undo) return;
    const current = draftRef.current.choices;
    const at = Math.min(undo.index, current.length);
    let next = [...current.slice(0, at), undo.choice, ...current.slice(at)];
    // It was the right answer when it was removed: it gets the tick back.
    if (undo.choice.isCorrect) {
      next = next.map((c) => ({ ...c, isCorrect: c.id === undo.choice.id }));
    }
    setUndo(null);
    update({ choices: next }, { immediate: true });
  }

  function handleDelete() {
    if (!window.confirm(t('questionEditor.confirmDelete', { number: index + 1 }))) return;
    // Nothing pending should be sent for a question that is about to disappear.
    saver.cancel();
    onDelete();
  }

  const typeLabel: Record<QuestionType, string> = {
    multipleChoice: t('questionEditor.types.multipleChoice'),
    trueFalse: t('questionEditor.types.trueFalse'),
    fillBlank: t('questionEditor.types.fillBlank'),
    essay: t('questionEditor.types.essay'),
    speaking: t('questionEditor.types.speaking'),
  };

  const { type } = draft;
  const hasEmptyChoice = draft.choices.some((c) => c.text.trim() === '');
  const flush = () => void saver.flush();

  return (
    <div ref={rootRef} className="rounded-lg border border-primary-100 bg-base-white p-4" data-testid="question-editor">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700">
          {t('questionEditor.questionHeading', { number: index + 1, type: typeLabel[type] })}
        </span>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => onMove('up')}
            disabled={index === 0}
            aria-label={t('questionEditor.moveUpAriaLabel')}
            className="rounded px-2 py-3 sm:py-1 text-xs text-base-black/60 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove('down')}
            disabled={index === count - 1}
            aria-label={t('questionEditor.moveDownAriaLabel')}
            className="rounded px-2 py-3 sm:py-1 text-xs text-base-black/60 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ↓
          </button>
          <select
            value={type}
            onChange={(event) => handleTypeChange(event.target.value as QuestionType)}
            className="ml-2 rounded-md border border-primary-200 px-2 py-1 text-xs"
            aria-label={t('questionEditor.questionTypeAriaLabel')}
          >
            <option value="multipleChoice">{t('questionEditor.types.multipleChoice')}</option>
            <option value="trueFalse">{t('questionEditor.types.trueFalse')}</option>
            <option value="fillBlank">{t('questionEditor.types.fillBlank')}</option>
            <option value="essay">{t('questionEditor.types.essay')}</option>
            <option value="speaking">{t('questionEditor.types.speaking')}</option>
          </select>
          <button
            type="button"
            onClick={handleDelete}
            className="ml-2 whitespace-nowrap rounded px-2 py-3 sm:py-1 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            {t('questionEditor.deleteButton')}
          </button>
        </div>
      </div>

      <label className="mt-3 flex flex-col gap-1 text-sm font-medium text-base-black">
        {t('questionEditor.promptLabel')}
        <textarea
          value={draft.prompt}
          onChange={(event) => update({ prompt: event.target.value })}
          onBlur={flush}
          rows={2}
          className={inputClass}
        />
      </label>

      {type === 'fillBlank' ? (
        <label className="mt-3 flex flex-col gap-1 text-sm font-medium text-base-black">
          {t('questionEditor.acceptedAnswersLabel')}
          <input
            type="text"
            value={draft.acceptedAnswersText}
            onChange={(event) => update({ acceptedAnswersText: event.target.value })}
            onBlur={flush}
            placeholder={t('questionEditor.acceptedAnswersPlaceholder')}
            className={inputClass}
          />
        </label>
      ) : type === 'essay' ? (
        <label className="mt-3 flex flex-col gap-1 text-sm font-medium text-base-black">
          {t('questionEditor.essayMaxScoreLabel')}
          <input
            type="number"
            min={1}
            max={1000}
            value={draft.essayMaxScoreText}
            onChange={(event) =>
              update({ essayMaxScoreText: event.target.value }, { delayMs: NUMBER_DEBOUNCE_MS })
            }
            onBlur={flush}
            className={`${inputClass} w-32`}
          />
          <span className="text-xs font-normal text-base-black/50">{t('questionEditor.essayHint')}</span>
        </label>
      ) : type === 'speaking' ? (
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            {t('questionEditor.speakingResponseTimeLabel')}
            <input
              type="number"
              min={5}
              max={300}
              value={draft.allowedResponseSecondsText}
              onChange={(event) =>
                update({ allowedResponseSecondsText: event.target.value }, { delayMs: NUMBER_DEBOUNCE_MS })
              }
              onBlur={flush}
              className={`${inputClass} w-32`}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            {t('questionEditor.speakingPromptAudioLabel')}
            <input
              type="text"
              value={draft.promptAudioUrl}
              onChange={(event) => update({ promptAudioUrl: event.target.value })}
              onBlur={flush}
              placeholder={t('questionEditor.speakingPromptAudioPlaceholder')}
              className={inputClass}
            />
          </label>
          <span className="text-xs font-normal text-base-black/50">{t('questionEditor.speakingHint')}</span>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <span className="text-sm font-medium text-base-black">{t('questionEditor.choicesLabel')}</span>
          <p className="text-sm font-semibold text-green-800">{t('questionEditor.pickCorrectHint')}</p>
          <div role="radiogroup" aria-label={t('questionEditor.choicesLabel')} className="flex flex-col gap-2">
            {draft.choices.map((choice, choiceIndex) => (
              <div
                key={choice.id}
                data-testid="choice-row"
                data-correct={choice.isCorrect ? 'true' : 'false'}
                className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-2 py-1.5 ${
                  choice.isCorrect ? 'border-green-500 bg-green-50' : 'border-primary-200 bg-base-white'
                }`}
              >
                <label
                  className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center"
                  title={t('questionEditor.markCorrectAriaLabel', { number: choiceIndex + 1 })}
                >
                  <input
                    type="radio"
                    name={`correct-${question.id}`}
                    checked={choice.isCorrect}
                    onChange={() => markCorrect(choice.id)}
                    aria-label={t('questionEditor.markCorrectAriaLabel', { number: choiceIndex + 1 })}
                    className="h-6 w-6 cursor-pointer accent-green-600"
                  />
                </label>
                <span aria-hidden="true" className="w-5 shrink-0 text-center text-sm font-bold text-base-black/70">
                  {String.fromCharCode(65 + choiceIndex)}
                </span>
                <input
                  type="text"
                  data-choice-id={choice.id}
                  value={choice.text}
                  disabled={type === 'trueFalse'}
                  onChange={(event) => updateChoiceText(choice.id, event.target.value)}
                  onBlur={flush}
                  aria-label={t('questionEditor.choiceTextAriaLabel', { number: choiceIndex + 1 })}
                  className={`${inputClass} min-w-0 flex-1 basis-40 disabled:bg-primary-50`}
                />
                <div className="ml-auto flex items-center gap-2">
                  {choice.isCorrect && (
                    <span className="rounded-full bg-green-600 px-2.5 py-0.5 text-xs font-semibold text-base-white">
                      {t('questionEditor.correctPill')}
                    </span>
                  )}
                  {type === 'multipleChoice' && draft.choices.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeChoice(choice.id)}
                      aria-label={t('questionEditor.removeChoiceAriaLabel', { number: choiceIndex + 1 })}
                      className="rounded px-2 py-3 sm:py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      {t('questionEditor.removeButton')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {hasEmptyChoice && type === 'multipleChoice' && (
            <p className="text-xs text-amber-800" data-testid="empty-choice-hint">
              {t('questionEditor.emptyChoiceHint')}
            </p>
          )}
          {type === 'multipleChoice' && (
            <button
              type="button"
              onClick={addChoice}
              className="self-start rounded-md border border-primary-200 px-3 py-3 text-xs font-medium text-primary-700 hover:bg-primary-50 sm:py-1"
            >
              {t('questionEditor.addChoiceButton')}
            </button>
          )}
        </div>
      )}

      {undo && (
        <div
          role="status"
          data-testid="undo-toast"
          className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-lg bg-base-black px-4 py-3 text-sm text-base-white shadow-lg"
        >
          <span>{t('questionEditor.choiceRemoved')}</span>
          <button
            type="button"
            onClick={undoRemoveChoice}
            className="rounded-md bg-base-white px-3 py-2 text-sm font-semibold text-base-black hover:bg-primary-100"
          >
            {t('questionEditor.undo')}
          </button>
        </div>
      )}
    </div>
  );
}

export default QuestionEditor;
