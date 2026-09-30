import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { QuestionType, SectionDTO, UpdateQuestionRequest, UpdateSectionRequest } from '@platform/shared';
import QuestionEditor from './QuestionEditor';
import { HoldSave } from '../lib/serialSaver';
import { useSerialSaver } from '../lib/editorSave';
import { sendKeepalive } from '../lib/keepaliveRequest';

// T-090: this project has never used real file/object storage — a file picked here is read
// client-side via `FileReader` into a base64 `data:` URL string and written into the SAME
// `passageImageUrl`/`audioUrl` text field the URL input uses — no schema change, no upload
// endpoint. 5 MB keeps the resulting string (base64 inflates raw bytes by ~33%) from bloating the
// section-update payload and the `Section` row, while still fitting a passage image or a short clip.
const MAX_SECTION_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_SECTION_UPLOAD_MB = 5;
/** Largest request the browser is allowed to send while the page is closing. */
const KEEPALIVE_MAX_CHARS = 60_000;
const NUMBER_DEBOUNCE_MS = 300;

interface SectionDraft {
  title: string;
  passageText: string;
  passageImageUrl: string;
  audioUrl: string;
  maxPlayCountText: string;
}

interface TestSectionEditorProps {
  testId: string;
  section: SectionDTO;
  index: number;
  count: number;
  onMove: (direction: 'up' | 'down') => void;
  onDelete: () => void;
  onAddQuestion: (type: QuestionType) => void;
  onSaveQuestion: (questionId: string, body: UpdateQuestionRequest) => Promise<void>;
  onSaveQuestionOnUnload: (questionId: string, body: UpdateQuestionRequest) => void;
  onDeleteQuestion: (questionId: string) => void;
  onMoveQuestion: (questionId: string, direction: 'up' | 'down') => void;
  /** True for a question created by "+ Trắc nghiệm" earlier in this same editing session and not
   * yet touched — see `QuestionEditor`'s matching prop. */
  isQuestionFreshDefault: (questionId: string) => boolean;
  onQuestionFirstEdit: (questionId: string) => void;
  /** Saves a section's full state. */
  onSaveSection: (sectionId: string, body: UpdateSectionRequest) => Promise<void>;
}

const inputClass =
  'rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200';
const addButtonClass =
  'rounded-md border border-primary-300 bg-base-white px-3 py-3 text-xs font-medium text-primary-700 hover:bg-primary-100 sm:py-1.5';

function isDataUrl(value: string): boolean {
  return value.startsWith('data:');
}

/**
 * One "nhóm câu" (section) of the test editor: its name, the optional reading passage / listening
 * audio, its questions and the "add a question" buttons. Like `QuestionEditor` it saves itself —
 * the whole section state after a short pause, on blur and when the teacher leaves.
 */
function TestSectionEditor({
  testId,
  section,
  index,
  count,
  onMove,
  onDelete,
  onAddQuestion,
  onSaveQuestion,
  onSaveQuestionOnUnload,
  onDeleteQuestion,
  onMoveQuestion,
  onSaveSection,
  isQuestionFreshDefault,
  onQuestionFirstEdit,
}: TestSectionEditorProps) {
  const { t } = useTranslation();
  const [draft, setDraftState] = useState<SectionDraft>(() => ({
    title: section.title,
    passageText: section.passageText ?? '',
    passageImageUrl: section.passageImageUrl ?? '',
    audioUrl: section.audioUrl ?? '',
    maxPlayCountText: section.maxPlayCount != null ? String(section.maxPlayCount) : '',
  }));
  const draftRef = useRef(draft);
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});

  function buildBody(value: SectionDraft): UpdateSectionRequest {
    if (value.title.trim() === '') throw new HoldSave(t('teacherTestEditor.sections.hold.title'));
    const plays = value.maxPlayCountText.trim();
    let maxPlayCount: number | null = null;
    if (plays !== '') {
      if (!/^\d+$/.test(plays) || Number(plays) < 1) {
        throw new HoldSave(t('teacherTestEditor.sections.hold.maxPlays'));
      }
      maxPlayCount = Number(plays);
    }
    return {
      title: value.title.trim(),
      passageText: value.passageText === '' ? null : value.passageText,
      passageImageUrl: value.passageImageUrl.trim() === '' ? null : value.passageImageUrl.trim(),
      audioUrl: value.audioUrl.trim() === '' ? null : value.audioUrl.trim(),
      maxPlayCount,
    };
  }

  const saver = useSerialSaver<SectionDraft>(
    `section:${section.id}`,
    async (value) => {
      await onSaveSection(section.id, buildBody(value));
    },
    {
      saveOnUnload: (value) => {
        try {
          const body = buildBody(value);
          if (JSON.stringify(body).length > KEEPALIVE_MAX_CHARS) return;
          sendKeepalive('PATCH', `/api/teacher/tests/${testId}/sections/${section.id}`, body);
        } catch {
          // Not ready to save (held) — nothing to send.
        }
      },
    },
  );

  function update(patch: Partial<SectionDraft>, options: { immediate?: boolean; delayMs?: number } = {}) {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraftState(next);
    saver.schedule(next, options);
  }

  const flush = () => void saver.flush();

  function handleFileUpload(field: 'passageImageUrl' | 'audioUrl', file: File | null) {
    if (!file) return;
    if (file.size > MAX_SECTION_UPLOAD_BYTES) {
      setUploadErrors((prev) => ({
        ...prev,
        [field]: t('teacherTestEditor.sections.uploadTooLarge', { limitMb: MAX_SECTION_UPLOAD_MB }),
      }));
      return;
    }
    setUploadErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl === 'string') update({ [field]: dataUrl }, { immediate: true });
    };
    reader.onerror = () => {
      setUploadErrors((prev) => ({ ...prev, [field]: t('teacherTestEditor.sections.uploadReadFailed') }));
    };
    reader.readAsDataURL(file);
  }

  function handleDelete() {
    if (!window.confirm(t('teacherTestEditor.sections.confirmDelete', { title: draft.title }))) return;
    saver.cancel();
    onDelete();
  }

  /** URL text box, or — for a file picked from the computer — a one-line note with a remove button. */
  function renderUrlField(field: 'passageImageUrl' | 'audioUrl') {
    const value = draft[field];
    if (isDataUrl(value)) {
      return (
        <span className="flex flex-wrap items-center gap-2 rounded-md border border-primary-200 bg-primary-50 px-3 py-2 text-sm font-normal">
          {t('teacherTestEditor.sections.uploadedFile')}
          <button
            type="button"
            onClick={() => update({ [field]: '' }, { immediate: true })}
            className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            {t('teacherTestEditor.sections.removeUploadedFile')}
          </button>
        </span>
      );
    }
    return (
      <input
        type="text"
        value={value}
        onChange={(event) => update({ [field]: event.target.value })}
        onBlur={flush}
        placeholder={t('teacherTestEditor.sections.urlPlaceholder')}
        className={inputClass}
      />
    );
  }

  return (
    <div className="rounded-xl border border-primary-200 bg-primary-50 p-4" data-testid="section-editor">
      <div className="flex items-center justify-between gap-3">
        <input
          type="text"
          value={draft.title}
          onChange={(event) => update({ title: event.target.value })}
          onBlur={flush}
          aria-label={t('teacherTestEditor.sections.titleAriaLabel')}
          className="min-w-0 flex-1 rounded-md border border-primary-200 bg-base-white px-3 py-1.5 text-base font-semibold text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onMove('up')}
            disabled={index === 0}
            aria-label={t('teacherTestEditor.sections.moveUp')}
            className="rounded px-2 py-3 sm:py-1 text-xs text-base-black/60 hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove('down')}
            disabled={index === count - 1}
            aria-label={t('teacherTestEditor.sections.moveDown')}
            className="rounded px-2 py-3 sm:py-1 text-xs text-base-black/60 hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="ml-2 whitespace-nowrap rounded px-2 py-3 sm:py-1 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            {t('teacherTestEditor.sections.delete')}
          </button>
        </div>
      </div>

      <details className="mt-3 rounded-lg border border-primary-100 bg-base-white p-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-primary-600">
          {t('teacherTestEditor.sections.contentSummary')}
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black sm:col-span-2">
            {t('teacherTestEditor.sections.passageTextLabel')}
            <textarea
              value={draft.passageText}
              onChange={(event) => update({ passageText: event.target.value })}
              onBlur={flush}
              rows={3}
              placeholder={t('teacherTestEditor.sections.passageTextPlaceholder')}
              className={inputClass}
            />
          </label>
          <div className="flex flex-col gap-1 text-sm font-medium text-base-black">
            {t('teacherTestEditor.sections.passageImageUrlLabel')}
            {renderUrlField('passageImageUrl')}
            <span className="text-xs font-normal text-base-black/50">
              {t('teacherTestEditor.sections.orUploadFile')}
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                handleFileUpload('passageImageUrl', event.target.files?.[0] ?? null);
                event.target.value = '';
              }}
              className="text-xs text-base-black/70 file:mr-2 file:rounded-md file:border-0 file:bg-primary-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-700 hover:file:bg-primary-200"
            />
            {uploadErrors.passageImageUrl && (
              <span className="text-xs font-normal text-red-600">{uploadErrors.passageImageUrl}</span>
            )}
          </div>
          <div className="flex flex-col gap-1 text-sm font-medium text-base-black">
            {t('teacherTestEditor.sections.audioUrlLabel')}
            {renderUrlField('audioUrl')}
            <span className="text-xs font-normal text-base-black/50">
              {t('teacherTestEditor.sections.orUploadFile')}
            </span>
            <input
              type="file"
              accept="audio/*"
              onChange={(event) => {
                handleFileUpload('audioUrl', event.target.files?.[0] ?? null);
                event.target.value = '';
              }}
              className="text-xs text-base-black/70 file:mr-2 file:rounded-md file:border-0 file:bg-primary-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-700 hover:file:bg-primary-200"
            />
            {uploadErrors.audioUrl && (
              <span className="text-xs font-normal text-red-600">{uploadErrors.audioUrl}</span>
            )}
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            {t('teacherTestEditor.sections.maxPlaysLabel')}
            <input
              type="number"
              min={1}
              value={draft.maxPlayCountText}
              onChange={(event) => update({ maxPlayCountText: event.target.value }, { delayMs: NUMBER_DEBOUNCE_MS })}
              onBlur={flush}
              placeholder={t('teacherTestEditor.sections.maxPlaysPlaceholder')}
              className={`${inputClass} w-40`}
            />
          </label>
        </div>
      </details>

      <div className="mt-4 flex flex-col gap-3">
        {section.questions.map((question, questionIndex) => (
          <QuestionEditor
            key={question.id}
            question={question}
            index={questionIndex}
            count={section.questions.length}
            onSave={(body) => onSaveQuestion(question.id, body)}
            onSaveOnUnload={(body) => onSaveQuestionOnUnload(question.id, body)}
            onDelete={() => onDeleteQuestion(question.id)}
            onMove={(direction) => onMoveQuestion(question.id, direction)}
            isFreshDefault={isQuestionFreshDefault(question.id)}
            onFirstEdit={() => onQuestionFirstEdit(question.id)}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => onAddQuestion('multipleChoice')} className={addButtonClass}>
          {t('teacherTestEditor.sections.addMultipleChoice')}
        </button>
        <button type="button" onClick={() => onAddQuestion('trueFalse')} className={addButtonClass}>
          {t('teacherTestEditor.sections.addTrueFalse')}
        </button>
        <button type="button" onClick={() => onAddQuestion('fillBlank')} className={addButtonClass}>
          {t('teacherTestEditor.sections.addFillBlank')}
        </button>
        <button type="button" onClick={() => onAddQuestion('essay')} className={addButtonClass}>
          {t('teacherTestEditor.sections.addEssay')}
        </button>
        <button type="button" onClick={() => onAddQuestion('speaking')} className={addButtonClass}>
          {t('teacherTestEditor.sections.addSpeaking')}
        </button>
        <button type="button" onClick={() => onAddQuestion('matching')} className={addButtonClass}>
          {t('teacherTestEditor.sections.addMatching')}
        </button>
      </div>
    </div>
  );
}

export default TestSectionEditor;
