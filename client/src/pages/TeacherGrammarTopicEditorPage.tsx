import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { GrammarTopicDetailDTO, UnitDTO, UpdateGrammarExerciseRequest } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';
import { useAuth } from '../context/useAuth';
import GrammarExerciseEditor from '../components/GrammarExerciseEditor';
import LibraryBreadcrumb from '../components/LibraryBreadcrumb';
import RichTextEditor from '../components/RichTextEditor';

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
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

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

  const defaultBackLink = user?.role === 'admin' ? '/admin/grammar-topics' : '/teacher/grammar-topics';
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;

  const handleBack = () => {
    if (returnTo) {
      navigate(returnTo);
    } else if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate(defaultBackLink);
    }
  };

  const backButtonElement = (
    <button
      type="button"
      onClick={handleBack}
      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50"
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      {returnTo ? 'Quay lại' : 'Quay lại danh sách'}
    </button>
  );

  if (!topic) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          {backButtonElement}
          <span className="text-slate-300">|</span>
          <LibraryBreadcrumb section="grammar" linkSection />
        </div>
        {error ? (
          <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : (
          <p className="mt-4 text-sm text-slate-500">{t('common.loading')}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-6">
      {/* Top Header Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            {backButtonElement}
            <span className="text-slate-300">|</span>
            <LibraryBreadcrumb section="grammar" linkSection />
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
            Tiêu đề chủ đề ngữ pháp
          </label>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={handleSaveTitleAndTheory}
            placeholder="Nhập tiêu đề chủ đề ngữ pháp..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-lg font-bold text-slate-900 shadow-2xs transition-colors focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />

          <div className="mt-4 max-w-sm">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="unit-select" className="text-xs font-semibold text-slate-700">
                {t('teacherGrammarTopicEditor.unitLabel')}
              </label>
              <select
                id="unit-select"
                value={topic.unitId ?? ''}
                onChange={(event) => handleSaveUnit(event.target.value === '' ? null : event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-2xs focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                <option value="">{t('teacherGrammarTopicEditor.noUnit')}</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error && <p className="mt-3 text-xs font-medium text-rose-600">{error}</p>}
      </div>

      {/* Theory Content Card */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-base font-bold text-slate-900">{t('teacherGrammarTopicEditor.theoryContentHeading')}</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Trình soạn thảo văn bản giàu định dạng (CKEditor). Nội dung được tự động lưu khi bạn rời khỏi ô nhập hoặc có thể chỉnh sửa trực tiếp.
          </p>
        </div>
        <div className="mt-4">
          <RichTextEditor
            value={theoryContent}
            onChange={(val) => setTheoryContent(val)}
            onBlur={handleSaveTitleAndTheory}
            placeholder="Nhập nội dung giải thích lý thuyết ngữ pháp..."
          />
        </div>
      </section>

      {/* Practice Exercises Card */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">{t('teacherGrammarTopicEditor.practiceExercisesHeading')}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Tổng số bài tập: <span className="font-semibold text-slate-700">{topic.exercises.length}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddExercise}
            disabled={isAddingExercise}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs transition-all hover:bg-primary-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {isAddingExercise ? t('teacherGrammarTopicEditor.adding') : t('teacherGrammarTopicEditor.addExercise')}
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {topic.exercises.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-400">
              {t('teacherGrammarTopicEditor.noExercises')}
            </div>
          ) : (
            topic.exercises.map((exercise, index) => (
              <GrammarExerciseEditor
                key={exercise.id}
                exercise={exercise}
                index={index}
                onSave={(body) => handleSaveExercise(exercise.id, body)}
                onDelete={() => handleDeleteExercise(exercise.id)}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

export default TeacherGrammarTopicEditorPage;
