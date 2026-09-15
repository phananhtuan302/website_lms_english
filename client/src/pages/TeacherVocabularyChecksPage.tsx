import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TeacherStudentSummaryDTO, TeacherVocabularyCheckSummaryDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';

/**
 * Teacher: generate a Vocabulary Check (T-038, Assumption A8) for a target student or
 * group, and see the ones already generated. The generated test's QUESTION POOL is drawn
 * server-side from the selected student(s)' own `FlashcardProgress` (`learning`/`known`
 * cards only — see `server/src/lib/vocabularyCheckGenerator.ts`); this page only collects
 * WHO it's for.
 */
function TeacherVocabularyChecksPage() {
  const { t } = useTranslation();
  const [students, setStudents] = useState<TeacherStudentSummaryDTO[] | null>(null);
  const [checks, setChecks] = useState<TeacherVocabularyCheckSummaryDTO[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  function reload() {
    teacherApi
      .listStudents()
      .then(setStudents)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : t('teacherVocabularyChecks.loadStudentsFailed')),
      );
    teacherApi
      .listVocabularyChecks()
      .then(setChecks)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : t('teacherVocabularyChecks.loadChecksFailed')),
      );
  }

  useEffect(reload, []);

  function toggleStudent(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleGenerate(event: FormEvent) {
    event.preventDefault();
    if (selectedIds.size === 0) return;
    setIsGenerating(true);
    setError(null);
    try {
      await teacherApi.generateVocabularyCheck({ studentIds: [...selectedIds] });
      setSelectedIds(new Set());
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('teacherVocabularyChecks.generateFailed'));
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/teacher/dashboard" className="text-sm text-primary-600 hover:underline">
          {t('teacherVocabularyChecks.backToDashboard')}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-primary-700">
          {t('teacherVocabularyChecks.heading')}
        </h1>
        <p className="mt-1 text-sm text-base-black/60">{t('teacherVocabularyChecks.description')}</p>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <form onSubmit={handleGenerate} className="rounded-xl border border-primary-200 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-600">
          {t('teacherVocabularyChecks.selectStudents')}
        </h2>
        {!students && (
          <p className="mt-2 text-sm text-base-black/60">{t('teacherVocabularyChecks.loadingStudents')}</p>
        )}
        {students?.length === 0 && (
          <p className="mt-2 text-sm text-base-black/60">{t('teacherVocabularyChecks.noStudents')}</p>
        )}
        <ul className="mt-3 flex flex-col gap-2">
          {students?.map((student) => (
            <li key={student.id}>
              <label className="flex items-center gap-2 text-sm text-base-black">
                <input
                  type="checkbox"
                  checked={selectedIds.has(student.id)}
                  onChange={() => toggleStudent(student.id)}
                  className="h-4 w-4 rounded border-primary-300 text-primary-600 focus:ring-primary-200"
                />
                {student.name} <span className="text-xs text-base-black/50">({student.email})</span>
              </label>
            </li>
          ))}
        </ul>
        <button
          type="submit"
          disabled={selectedIds.size === 0 || isGenerating}
          className="mt-4 rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isGenerating
            ? t('teacherVocabularyChecks.generating')
            : t('teacherVocabularyChecks.generateFor', { count: selectedIds.size })}
        </button>
      </form>

      <section>
        <h2 className="text-lg font-bold text-base-black">
          {t('teacherVocabularyChecks.generatedHeading')}
        </h2>
        {!checks && <p className="mt-2 text-sm text-base-black/60">{t('common.loading')}</p>}
        {checks?.length === 0 && (
          <p className="mt-2 text-sm text-base-black/60">{t('teacherVocabularyChecks.noneGenerated')}</p>
        )}
        <ul className="mt-3 flex flex-col gap-2">
          {checks?.map((check) => (
            <li
              key={check.id}
              className="rounded-lg border border-primary-100 bg-primary-50 px-4 py-3 text-sm"
            >
              <p className="font-medium text-base-black">{check.title}</p>
              <p className="mt-1 text-xs text-base-black/60">
                {t('teacherVocabularyChecks.detailLine', {
                  count: check.questionCount,
                  minutes: check.timeLimitMinutes,
                  students: check.assignedStudents.map((s) => s.name).join(', '),
                  date: new Date(check.createdAt).toLocaleString(),
                })}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default TeacherVocabularyChecksPage;
