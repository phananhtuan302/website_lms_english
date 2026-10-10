import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  CommitGeneratedGrammarLessonResponse,
  GeneratedGrammarExerciseDTO,
  GrammarExerciseDTO,
  UpdateGrammarExerciseRequest,
} from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';
import GrammarExerciseEditor from '../components/GrammarExerciseEditor';
import LibraryBreadcrumb from '../components/LibraryBreadcrumb';
import { Button, Input } from '../components/ui';

let nextDraftId = 0;
function freshId(): string {
  nextDraftId += 1;
  return `draft-${nextDraftId}`;
}

/** A draft exercise as the reused `GrammarExerciseEditor` expects (`GrammarExerciseDTO`,
 * with synthetic ids since nothing is persisted yet), plus the AI's `explanation` shown
 * alongside it for the teacher's benefit — `explanation` is never sent to the commit
 * endpoint (`GrammarExercise` has no such column). */
interface DraftExercise extends GrammarExerciseDTO {
  explanation: string;
}

function toDraftExercise(generated: GeneratedGrammarExerciseDTO): DraftExercise {
  return {
    id: freshId(),
    type: generated.type,
    prompt: generated.prompt,
    order: 0,
    acceptedAnswers: generated.acceptedAnswers,
    choices: generated.choices.map((c, index) => ({ id: freshId(), text: c.text, isCorrect: c.isCorrect, order: index + 1 })),
    explanation: generated.explanation,
  };
}

function blankDraftExercise(): DraftExercise {
  return {
    id: freshId(),
    type: 'multipleChoice',
    prompt: '',
    order: 0,
    acceptedAnswers: [],
    choices: [
      { id: freshId(), text: '', isCorrect: true, order: 1 },
      { id: freshId(), text: '', isCorrect: false, order: 2 },
    ],
    explanation: '',
  };
}

/**
 * "Tạo bài ngữ pháp bằng AI" (2026-10, feature 2 of the "AI Content Tools" set) —
 * generate → review/edit → save, same overall shape as `AiVocabGeneratorPanel.tsx`.
 * Unlike vocabulary generation (which adds into an EXISTING set), a generated grammar
 * lesson is always a brand-new `GrammarTopic`, so this is its own page (reached from
 * `TeacherGrammarPage.tsx`) rather than a panel embedded in an existing topic's editor.
 *
 * Reuses `GrammarExerciseEditor` (built for editing an already-persisted exercise) for the
 * draft list too — it only needs synthetic ids and a locally-wired `onSave`/`onDelete` that
 * update this page's draft array instead of calling the API, since the component itself
 * never calls `teacherApi` directly.
 */
function TeacherGrammarGeneratorPage() {
  const { t } = useTranslation();

  const [topic, setTopic] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [title, setTitle] = useState<string | null>(null);
  const [theoryContent, setTheoryContent] = useState('');
  const [exercises, setExercises] = useState<DraftExercise[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<CommitGeneratedGrammarLessonResponse | null>(null);

  async function handleGenerate() {
    if (!topic.trim() || isGenerating) return;
    setIsGenerating(true);
    setGenerateError(null);
    setResult(null);
    try {
      const draft = await teacherApi.generateGrammarLesson({ topic: topic.trim() });
      setTitle(draft.title);
      setTheoryContent(draft.theoryContentMarkdown);
      setExercises(draft.exercises.map(toDraftExercise));
    } catch (err) {
      setGenerateError(err instanceof ApiError ? err.message : t('teacherGrammarGenerator.generateError'));
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleUpdateExercise(id: string, body: UpdateGrammarExerciseRequest) {
    setExercises((prev) =>
      prev.map((ex) =>
        ex.id === id
          ? {
              ...ex,
              type: body.type,
              prompt: body.prompt,
              acceptedAnswers: body.acceptedAnswers ?? [],
              choices: (body.choices ?? []).map((c, index) => ({
                id: c.id ?? freshId(),
                text: c.text,
                isCorrect: c.isCorrect,
                order: index + 1,
              })),
            }
          : ex,
      ),
    );
  }

  function handleDeleteExercise(id: string) {
    setExercises((prev) => prev.filter((ex) => ex.id !== id));
  }

  async function handleSave() {
    if (title === null || !title.trim() || !theoryContent.trim() || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    setResult(null);
    try {
      const response = await teacherApi.commitGeneratedGrammarLesson({
        title: title.trim(),
        theoryContent: theoryContent.trim(),
        exercises: exercises.map((ex) => ({
          type: ex.type,
          prompt: ex.prompt,
          choices: ex.choices.map((c) => ({ text: c.text, isCorrect: c.isCorrect })),
          acceptedAnswers: ex.acceptedAnswers,
          explanation: ex.explanation,
        })),
      });
      setResult(response);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t('teacherGrammarGenerator.saveError'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <LibraryBreadcrumb section="grammar" />
      <h1 className="mt-2 text-2xl font-bold text-primary-700">{t('teacherGrammarGenerator.heading')}</h1>
      <p className="mt-1 text-sm text-base-black/60">{t('teacherGrammarGenerator.subtitle')}</p>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-base-black">
          {t('teacherGrammarGenerator.topicLabel')}
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={t('teacherGrammarGenerator.topicPlaceholder')}
          />
        </label>
        <Button type="button" onClick={() => void handleGenerate()} disabled={!topic.trim() || isGenerating}>
          {isGenerating ? t('teacherGrammarGenerator.generating') : t('teacherGrammarGenerator.generateButton')}
        </Button>
      </div>

      {generateError && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {generateError}
        </p>
      )}

      {title !== null && (
        <div className="mt-8 flex flex-col gap-6">
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            {t('teacherGrammarGenerator.titleLabel')}
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            {t('teacherGrammarGenerator.theoryContentLabel')}
            <textarea
              value={theoryContent}
              onChange={(e) => setTheoryContent(e.target.value)}
              rows={14}
              className="rounded-md border border-primary-200 bg-base-white px-3 py-2 font-mono text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </label>

          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-bold text-base-black">{t('teacherGrammarGenerator.exercisesHeading')}</h2>
            <div className="flex flex-col gap-3">
              {exercises.map((exercise, index) => (
                <div key={exercise.id} className="flex flex-col gap-2">
                  <GrammarExerciseEditor
                    exercise={exercise}
                    index={index}
                    onSave={(body) => handleUpdateExercise(exercise.id, body)}
                    onDelete={() => handleDeleteExercise(exercise.id)}
                  />
                  {exercise.explanation && (
                    <p className="rounded-md bg-primary-50 px-3 py-2 text-xs text-base-black/70">
                      {t('teacherGrammarGenerator.explanationLabel')}: {exercise.explanation}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" className="self-start" onClick={() => setExercises((prev) => [...prev, blankDraftExercise()])}>
              {t('teacherGrammarGenerator.addExerciseButton')}
            </Button>
          </section>

          {saveError && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {saveError}
            </p>
          )}

          {result ? (
            <div className="flex flex-col gap-2 rounded-md border border-primary-200 bg-primary-50 p-4">
              <p className="text-sm font-medium text-base-black">
                {t('teacherGrammarGenerator.resultCreated', { count: result.createdExerciseCount })}
              </p>
              {result.errors.length > 0 && (
                <ul className="flex flex-col gap-1 text-sm text-red-700">
                  {result.errors.map((rowError) => (
                    <li key={rowError.index}>
                      {t('teacherGrammarGenerator.rowError', { number: rowError.index + 1, reason: rowError.message })}
                    </li>
                  ))}
                </ul>
              )}
              <Link to={`/teacher/grammar-topics/${result.topic.id}`} className="self-start">
                <Button type="button" variant="outline" size="sm">
                  {t('teacherGrammarGenerator.openTopicButton')}
                </Button>
              </Link>
            </div>
          ) : (
            <Button type="button" className="self-start" onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? t('teacherGrammarGenerator.saving') : t('teacherGrammarGenerator.saveButton')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default TeacherGrammarGeneratorPage;
