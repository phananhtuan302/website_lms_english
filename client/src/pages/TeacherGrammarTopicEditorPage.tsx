import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { GrammarTopicDetailDTO, UnitDTO, UpdateGrammarExerciseRequest } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';
import GrammarExerciseEditor from '../components/GrammarExerciseEditor';
import LibraryBreadcrumb from '../components/LibraryBreadcrumb';

/** Default new-exercise shape — a sensible, editable placeholder, same convention as
 * `TeacherFlashcardSetEditorPage.tsx`'s `defaultCardBody`. Takes `t` since it's a
 * module-level function outside the component and can't call `useTranslation()` itself. */
function defaultExerciseBody(t: (key: string) => string): UpdateGrammarExerciseRequest {
  return {
    type: 'multipleChoice',
    prompt: t('teacherGrammarTopicEditor.defaultExercisePrompt'),
    choices: [
      { text: t('teacherGrammarTopicEditor.defaultCorrectAnswer'), isCorrect: true },
      { text: t('teacherGrammarTopicEditor.defaultWrongAnswer'), isCorrect: false },
    ],
  };
}

/**
 * Grammar topic editor (T-046/T-047/T-048): edit the topic's title/theory content/unit
 * tag, and add/edit/delete practice exercises. Same structure as
 * `TeacherFlashcardSetEditorPage.tsx`/`TeacherTestEditorPage.tsx`.
 */
function TeacherGrammarTopicEditorPage() {
  const { topicId } = useParams<{ topicId: string }>();
  const { t } = useTranslation();
  const [topic, setTopic] = useState<GrammarTopicDetailDTO | null>(null);
  const [title, setTitle] = useState('');
  const [theoryContent, setTheoryContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [units, setUnits] = useState<UnitDTO[]>([]);
  const [isAddingExercise, setIsAddingExercise] = useState(false);

  const refresh = useCallback(() => {
    if (!topicId) return;
    teacherApi
      .getGrammarTopic(topicId)
      .then((data) => {
        setTopic(data);
        setTitle(data.title);
        setTheoryContent(data.theoryContent);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t('teacherGrammarTopicEditor.loadFailed')));
  }, [topicId, t]);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    teacherApi
      .listUnits()
      .then(setUnits)
      .catch(() => undefined);
  }, []);

  if (!topicId) return null;

  async function handleSaveTitleAndTheory() {
    if (!topic) return;
    if (title.trim() === '' || theoryContent.trim() === '') return;
    if (title === topic.title && theoryContent === topic.theoryContent) return;
    try {
      const updated = await teacherApi.updateGrammarTopic(topicId!, {
        title: title.trim(),
        theoryContent: theoryContent.trim(),
      });
      setTopic(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('teacherGrammarTopicEditor.saveTitleTheoryFailed'));
    }
  }

  async function handleSaveUnit(unitId: string | null) {
    if (!topic) return;
    try {
      const updated = await teacherApi.updateGrammarTopic(topicId!, {
        title: topic.title,
        theoryContent: topic.theoryContent,
        unitId,
      });
      setTopic(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('teacherGrammarTopicEditor.saveUnitFailed'));
    }
  }

  async function handleAddExercise() {
    setIsAddingExercise(true);
    setError(null);
    try {
      const updated = await teacherApi.createGrammarExercise(topicId!, defaultExerciseBody(t));
      setTopic(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('teacherGrammarTopicEditor.addExerciseFailed'));
    } finally {
      setIsAddingExercise(false);
    }
  }

  async function handleSaveExercise(exerciseId: string, body: UpdateGrammarExerciseRequest) {
    const updated = await teacherApi.updateGrammarExercise(topicId!, exerciseId, body);
    setTopic(updated);
  }

  async function handleDeleteExercise(exerciseId: string) {
    try {
      const updated = await teacherApi.deleteGrammarExercise(topicId!, exerciseId);
      setTopic(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('teacherGrammarTopicEditor.deleteExerciseFailed'));
    }
  }

  if (!topic) {
    return (
      <div>
        <LibraryBreadcrumb section="grammar" linkSection />
        {error ? (
          <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : (
          <p className="mt-4 text-sm text-base-black/60">{t('common.loading')}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <LibraryBreadcrumb section="grammar" linkSection />
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={handleSaveTitleAndTheory}
          className="mt-2 w-full rounded-md border border-primary-200 px-3 py-2 text-2xl font-bold text-primary-700 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-medium text-base-black">
            {t('teacherGrammarTopicEditor.unitLabel')}
            <select
              value={topic.unitId ?? ''}
              onChange={(event) => handleSaveUnit(event.target.value === '' ? null : event.target.value)}
              className="rounded-md border border-primary-200 px-3 py-1.5 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            >
              <option value="">{t('teacherGrammarTopicEditor.noUnit')}</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-base-black">{t('teacherGrammarTopicEditor.theoryContentHeading')}</h2>
        <p className="text-sm text-base-black/60">{t('teacherGrammarTopicEditor.theoryContentHint')}</p>
        <textarea
          value={theoryContent}
          onChange={(event) => setTheoryContent(event.target.value)}
          onBlur={handleSaveTitleAndTheory}
          rows={10}
          className="rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-base-black">{t('teacherGrammarTopicEditor.practiceExercisesHeading')}</h2>
        {topic.exercises.length === 0 && (
          <p className="text-sm text-base-black/60">{t('teacherGrammarTopicEditor.noExercises')}</p>
        )}
        <div className="flex flex-col gap-3">
          {topic.exercises.map((exercise, index) => (
            <GrammarExerciseEditor
              key={exercise.id}
              exercise={exercise}
              index={index}
              onSave={(body) => handleSaveExercise(exercise.id, body)}
              onDelete={() => handleDeleteExercise(exercise.id)}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={handleAddExercise}
          disabled={isAddingExercise}
          className="self-start rounded-md bg-primary-500 px-4 py-2.5 sm:py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isAddingExercise ? t('teacherGrammarTopicEditor.adding') : t('teacherGrammarTopicEditor.addExercise')}
        </button>
      </section>
    </div>
  );
}

export default TeacherGrammarTopicEditorPage;
