import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  EXAM_IMPORT_MAX_IMAGES,
  type CommitImportedTestResponse,
  type GeneratedImportQuestionDTO,
  type GeneratedImportSectionDTO,
  type QuestionType,
} from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';
import { resizeExamPageImage } from '../lib/examImageResize';
import LibraryBreadcrumb from '../components/LibraryBreadcrumb';
import { Button, Input } from '../components/ui';

let nextKey = 0;
function freshKey(): string {
  nextKey += 1;
  return `k-${nextKey}`;
}

const QUESTION_TYPES: QuestionType[] = ['multipleChoice', 'trueFalse', 'fillBlank', 'matching', 'essay', 'speaking'];
const CHOICE_TYPES: QuestionType[] = ['multipleChoice', 'trueFalse', 'matching'];

interface DraftChoice {
  key: string;
  text: string;
  isCorrect: boolean;
}

interface DraftQuestion {
  key: string;
  type: QuestionType;
  prompt: string;
  choices: DraftChoice[];
  acceptedAnswersText: string;
  needsManualReview: boolean;
  reviewNote: string;
}

interface DraftSection {
  key: string;
  title: string;
  passageText: string;
  questions: DraftQuestion[];
}

interface UploadedImage {
  key: string;
  dataUrl: string;
  name: string;
}

function toDraftQuestion(generated: GeneratedImportQuestionDTO): DraftQuestion {
  return {
    key: freshKey(),
    type: generated.type,
    prompt: generated.prompt,
    choices: generated.choices.map((c) => ({ key: freshKey(), text: c.text, isCorrect: c.isCorrect })),
    acceptedAnswersText: generated.acceptedAnswers.join(', '),
    needsManualReview: generated.needsManualReview,
    reviewNote: generated.reviewNote,
  };
}

function toDraftSection(generated: GeneratedImportSectionDTO): DraftSection {
  return {
    key: freshKey(),
    title: generated.title,
    passageText: generated.passageText,
    questions: generated.questions.map(toDraftQuestion),
  };
}

function blankDraftQuestion(): DraftQuestion {
  return {
    key: freshKey(),
    type: 'multipleChoice',
    prompt: '',
    choices: [
      { key: freshKey(), text: '', isCorrect: true },
      { key: freshKey(), text: '', isCorrect: false },
    ],
    acceptedAnswersText: '',
    needsManualReview: false,
    reviewNote: '',
  };
}

/**
 * "Nhập đề từ ảnh bằng AI" (2026-10, feature 3 of the "AI Content Tools" set) — upload
 * exam-page photos → AI (vision) reads them → review/edit the draft → save as a brand-new
 * `Test`. Same overall "generate → editable preview → commit" shape as
 * `AiVocabGeneratorPanel.tsx`/`TeacherGrammarGeneratorPage.tsx`, with its own lightweight
 * question editor here (rather than reusing the full `QuestionEditor.tsx`, which is built
 * around a single already-persisted question with debounced auto-save — overkill for a
 * not-yet-persisted draft array edited as a whole right before one commit call).
 */
function TeacherExamImportPage() {
  const { t } = useTranslation();

  const [images, setImages] = useState<UploadedImage[]>([]);
  const [isResizing, setIsResizing] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [title, setTitle] = useState<string | null>(null);
  const [sections, setSections] = useState<DraftSection[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<CommitImportedTestResponse | null>(null);

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setImageError(null);

    const files = Array.from(fileList);
    if (images.length + files.length > EXAM_IMPORT_MAX_IMAGES) {
      setImageError(t('teacherExamImport.tooManyImages', { max: EXAM_IMPORT_MAX_IMAGES }));
      return;
    }

    setIsResizing(true);
    try {
      const resized = await Promise.all(
        files.map(async (file) => ({ key: freshKey(), dataUrl: await resizeExamPageImage(file), name: file.name })),
      );
      setImages((prev) => [...prev, ...resized]);
    } catch {
      setImageError(t('teacherExamImport.resizeFailed'));
    } finally {
      setIsResizing(false);
    }
  }

  function removeImage(key: string) {
    setImages((prev) => prev.filter((img) => img.key !== key));
  }

  function moveImage(key: string, direction: 'up' | 'down') {
    setImages((prev) => {
      const index = prev.findIndex((img) => img.key === key);
      const target = direction === 'up' ? index - 1 : index + 1;
      if (index === -1 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleGenerate() {
    if (images.length === 0 || isGenerating) return;
    setIsGenerating(true);
    setGenerateError(null);
    setResult(null);
    try {
      const draft = await teacherApi.importTestFromImages({ images: images.map((img) => img.dataUrl) });
      setTitle(draft.title);
      setSections(draft.sections.map(toDraftSection));
    } catch (err) {
      setGenerateError(err instanceof ApiError ? err.message : t('teacherExamImport.generateError'));
    } finally {
      setIsGenerating(false);
    }
  }

  function updateSection(key: string, patch: Partial<DraftSection>) {
    setSections((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function removeSection(key: string) {
    setSections((prev) => prev.filter((s) => s.key !== key));
  }

  function addSection() {
    setSections((prev) => [
      ...prev,
      { key: freshKey(), title: `Phần ${prev.length + 1}`, passageText: '', questions: [blankDraftQuestion()] },
    ]);
  }

  function updateQuestion(sectionKey: string, questionKey: string, patch: Partial<DraftQuestion>) {
    setSections((prev) =>
      prev.map((s) =>
        s.key === sectionKey
          ? { ...s, questions: s.questions.map((q) => (q.key === questionKey ? { ...q, ...patch } : q)) }
          : s,
      ),
    );
  }

  function handleQuestionTypeChange(sectionKey: string, questionKey: string, newType: QuestionType) {
    setSections((prev) =>
      prev.map((s) => {
        if (s.key !== sectionKey) return s;
        return {
          ...s,
          questions: s.questions.map((q) => {
            if (q.key !== questionKey) return q;
            const needsChoices = CHOICE_TYPES.includes(newType);
            const choices =
              needsChoices && q.choices.length < 2
                ? [
                    { key: freshKey(), text: '', isCorrect: true },
                    { key: freshKey(), text: '', isCorrect: false },
                  ]
                : q.choices;
            return { ...q, type: newType, choices };
          }),
        };
      }),
    );
  }

  function removeQuestion(sectionKey: string, questionKey: string) {
    setSections((prev) =>
      prev.map((s) => (s.key === sectionKey ? { ...s, questions: s.questions.filter((q) => q.key !== questionKey) } : s)),
    );
  }

  function addQuestion(sectionKey: string) {
    setSections((prev) =>
      prev.map((s) => (s.key === sectionKey ? { ...s, questions: [...s.questions, blankDraftQuestion()] } : s)),
    );
  }

  function updateChoice(sectionKey: string, questionKey: string, choiceKey: string, patch: Partial<DraftChoice>) {
    setSections((prev) =>
      prev.map((s) =>
        s.key === sectionKey
          ? {
              ...s,
              questions: s.questions.map((q) =>
                q.key === questionKey
                  ? { ...q, choices: q.choices.map((c) => (c.key === choiceKey ? { ...c, ...patch } : c)) }
                  : q,
              ),
            }
          : s,
      ),
    );
  }

  function markCorrectChoice(sectionKey: string, questionKey: string, choiceKey: string) {
    setSections((prev) =>
      prev.map((s) =>
        s.key === sectionKey
          ? {
              ...s,
              questions: s.questions.map((q) =>
                q.key === questionKey
                  ? { ...q, choices: q.choices.map((c) => ({ ...c, isCorrect: c.key === choiceKey })) }
                  : q,
              ),
            }
          : s,
      ),
    );
  }

  function addChoice(sectionKey: string, questionKey: string) {
    setSections((prev) =>
      prev.map((s) =>
        s.key === sectionKey
          ? {
              ...s,
              questions: s.questions.map((q) =>
                q.key === questionKey ? { ...q, choices: [...q.choices, { key: freshKey(), text: '', isCorrect: false }] } : q,
              ),
            }
          : s,
      ),
    );
  }

  function removeChoice(sectionKey: string, questionKey: string, choiceKey: string) {
    setSections((prev) =>
      prev.map((s) =>
        s.key === sectionKey
          ? {
              ...s,
              questions: s.questions.map((q) =>
                q.key === questionKey ? { ...q, choices: q.choices.filter((c) => c.key !== choiceKey) } : q,
              ),
            }
          : s,
      ),
    );
  }

  async function handleSave() {
    if (title === null || !title.trim() || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    setResult(null);
    try {
      const response = await teacherApi.commitImportedTest({
        title: title.trim(),
        sections: sections.map((s) => ({
          title: s.title,
          passageText: s.passageText,
          questions: s.questions.map((q) => ({
            type: q.type,
            prompt: q.prompt,
            choices: q.choices.map((c) => ({ text: c.text, isCorrect: c.isCorrect })),
            acceptedAnswers: q.acceptedAnswersText
              .split(',')
              .map((a) => a.trim())
              .filter(Boolean),
            needsManualReview: q.needsManualReview,
            reviewNote: q.reviewNote,
          })),
        })),
      });
      setResult(response);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t('teacherExamImport.saveError'));
    } finally {
      setIsSaving(false);
    }
  }

  const typeLabel: Record<QuestionType, string> = {
    multipleChoice: t('teacherExamImport.typeLabel.multipleChoice'),
    trueFalse: t('teacherExamImport.typeLabel.trueFalse'),
    fillBlank: t('teacherExamImport.typeLabel.fillBlank'),
    matching: t('teacherExamImport.typeLabel.matching'),
    essay: t('teacherExamImport.typeLabel.essay'),
    speaking: t('teacherExamImport.typeLabel.speaking'),
  };

  return (
    <div>
      <LibraryBreadcrumb section="tests" linkSection />
      <h1 className="mt-2 text-2xl font-bold text-primary-700">{t('teacherExamImport.heading')}</h1>
      <p className="mt-1 text-sm text-base-black/60">
        {t('teacherExamImport.subtitle', { max: EXAM_IMPORT_MAX_IMAGES })}
      </p>

      <section className="mt-6 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          {t('teacherExamImport.fileInputLabel')}
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={isResizing || images.length >= EXAM_IMPORT_MAX_IMAGES}
            onChange={(e) => {
              void handleFilesSelected(e.target.files);
              e.target.value = '';
            }}
            className="text-sm text-base-black/80"
          />
        </label>

        {imageError && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {imageError}
          </p>
        )}

        {images.length > 0 && (
          <ol className="flex flex-col gap-2">
            {images.map((img, index) => (
              <li
                key={img.key}
                className="flex items-center gap-3 rounded-md border border-primary-100 bg-base-white p-2"
              >
                <img src={img.dataUrl} alt={img.name} className="h-16 w-16 rounded object-cover" />
                <span className="flex-1 truncate text-sm text-base-black/70">
                  {t('teacherExamImport.pageLabel', { number: index + 1 })} — {img.name}
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => moveImage(img.key, 'up')} disabled={index === 0}>
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => moveImage(img.key, 'down')}
                  disabled={index === images.length - 1}
                >
                  ↓
                </Button>
                <Button type="button" variant="ghost" tone="danger" size="sm" onClick={() => removeImage(img.key)}>
                  {t('teacherExamImport.removeImageButton')}
                </Button>
              </li>
            ))}
          </ol>
        )}

        <Button type="button" onClick={() => void handleGenerate()} disabled={images.length === 0 || isGenerating}>
          {isGenerating ? t('teacherExamImport.generating') : t('teacherExamImport.generateButton')}
        </Button>
      </section>

      {generateError && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {generateError}
        </p>
      )}

      {title !== null && (
        <div className="mt-8 flex flex-col gap-6">
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            {t('teacherExamImport.titleLabel')}
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          {sections.map((section) => (
            <section key={section.key} className="flex flex-col gap-3 rounded-lg border border-primary-200 bg-base-white p-4">
              <div className="flex items-center justify-between gap-3">
                <Input
                  value={section.title}
                  onChange={(e) => updateSection(section.key, { title: e.target.value })}
                  className="max-w-xs font-semibold"
                />
                <Button type="button" variant="ghost" tone="danger" size="sm" onClick={() => removeSection(section.key)}>
                  {t('teacherExamImport.removeSectionButton')}
                </Button>
              </div>

              <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
                {t('teacherExamImport.passageTextLabel')}
                <textarea
                  value={section.passageText}
                  onChange={(e) => updateSection(section.key, { passageText: e.target.value })}
                  rows={4}
                  className="rounded-md border border-primary-200 bg-base-white px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                />
              </label>

              <div className="flex flex-col gap-3">
                {section.questions.map((question, questionIndex) => (
                  <div key={question.key} className="rounded-md border border-primary-100 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700">
                        {t('teacherExamImport.questionLabel', { number: questionIndex + 1 })}
                      </span>
                      <div className="flex items-center gap-2">
                        <select
                          value={question.type}
                          onChange={(e) => handleQuestionTypeChange(section.key, question.key, e.target.value as QuestionType)}
                          className="rounded-md border border-primary-200 px-2 py-1 text-xs"
                        >
                          {QUESTION_TYPES.map((qt) => (
                            <option key={qt} value={qt}>
                              {typeLabel[qt]}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="ghost"
                          tone="danger"
                          size="sm"
                          onClick={() => removeQuestion(section.key, question.key)}
                        >
                          {t('teacherExamImport.removeQuestionButton')}
                        </Button>
                      </div>
                    </div>

                    {question.needsManualReview && (
                      <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        {t('teacherExamImport.needsReviewBadge')}
                        {question.reviewNote ? `: ${question.reviewNote}` : ''}
                      </p>
                    )}

                    <label className="mt-2 flex flex-col gap-1 text-sm font-medium text-base-black">
                      {t('teacherExamImport.promptLabel')}
                      <textarea
                        value={question.prompt}
                        onChange={(e) => updateQuestion(section.key, question.key, { prompt: e.target.value })}
                        rows={2}
                        className="rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                      />
                    </label>

                    {question.type === 'fillBlank' && (
                      <label className="mt-2 flex flex-col gap-1 text-sm font-medium text-base-black">
                        {t('teacherExamImport.acceptedAnswersLabel')}
                        <Input
                          value={question.acceptedAnswersText}
                          onChange={(e) => updateQuestion(section.key, question.key, { acceptedAnswersText: e.target.value })}
                        />
                      </label>
                    )}

                    {CHOICE_TYPES.includes(question.type) && (
                      <div className="mt-2 flex flex-col gap-2">
                        {question.choices.map((choice) => (
                          <div key={choice.key} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`correct-${question.key}`}
                              checked={choice.isCorrect}
                              onChange={() => markCorrectChoice(section.key, question.key, choice.key)}
                            />
                            <Input
                              size="sm"
                              value={choice.text}
                              onChange={(e) => updateChoice(section.key, question.key, choice.key, { text: e.target.value })}
                              className="flex-1"
                            />
                            {question.choices.length > 2 && (
                              <Button
                                type="button"
                                variant="ghost"
                                tone="danger"
                                size="sm"
                                onClick={() => removeChoice(section.key, question.key, choice.key)}
                              >
                                {t('teacherExamImport.removeChoiceButton')}
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => addChoice(section.key, question.key)}>
                          {t('teacherExamImport.addChoiceButton')}
                        </Button>
                      </div>
                    )}

                    {(question.type === 'essay' || question.type === 'speaking') && (
                      <p className="mt-2 text-xs text-base-black/60">{t('teacherExamImport.essaySpeakingHint')}</p>
                    )}
                  </div>
                ))}
              </div>

              <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => addQuestion(section.key)}>
                {t('teacherExamImport.addQuestionButton')}
              </Button>
            </section>
          ))}

          <Button type="button" variant="outline" className="self-start" onClick={addSection}>
            {t('teacherExamImport.addSectionButton')}
          </Button>

          {saveError && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {saveError}
            </p>
          )}

          {result ? (
            <div className="flex flex-col gap-2 rounded-md border border-primary-200 bg-primary-50 p-4">
              <p className="text-sm font-medium text-base-black">
                {t('teacherExamImport.resultCreated', { count: result.createdQuestionCount })}
              </p>
              {result.errors.length > 0 && (
                <ul className="flex flex-col gap-1 text-sm text-red-700">
                  {result.errors.map((rowError, index) => (
                    <li key={index}>
                      {t('teacherExamImport.rowError', {
                        section: rowError.sectionIndex + 1,
                        question: rowError.questionIndex + 1,
                        reason: rowError.message,
                      })}
                    </li>
                  ))}
                </ul>
              )}
              <Link to={`/teacher/tests/${result.test.id}`} className="self-start">
                <Button type="button" variant="outline" size="sm">
                  {t('teacherExamImport.openTestButton')}
                </Button>
              </Link>
            </div>
          ) : (
            <Button type="button" className="self-start" onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? t('teacherExamImport.saving') : t('teacherExamImport.saveButton')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default TeacherExamImportPage;
