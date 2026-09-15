import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TeacherVocabProgressDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';

/**
 * Teacher's per-student + per-class vocabulary progress view for one owned flashcard
 * set (T-030). `classSummary` rolls up every student row below it — see
 * `teacherVocabProgress.routes.ts`'s doc comment for why "the class" is the full
 * student roster (this schema has no smaller Class/cohort subdivision).
 */
function TeacherFlashcardSetProgressPage() {
  const { t } = useTranslation();
  const { setId } = useParams<{ setId: string }>();
  const [progress, setProgress] = useState<TeacherVocabProgressDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!setId) return;
    teacherApi
      .getVocabSetProgress(setId)
      .then(setProgress)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('teacherFlashcardSetProgress.loadError')));
  }, [setId, t]);

  if (!setId) return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to={`/teacher/flashcard-sets/${setId}`} className="text-sm text-primary-600 hover:underline">
          {t('teacherFlashcardSetProgress.backToEditor')}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-primary-700">
          {progress
            ? t('teacherFlashcardSetProgress.headingWithSet', { setName: progress.setName })
            : t('teacherFlashcardSetProgress.heading')}
        </h1>
        <p className="mt-1 text-sm text-base-black/60">{t('teacherFlashcardSetProgress.subtitle')}</p>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {!error && !progress && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}

      {progress && (
        <>
          <section className="rounded-xl border border-primary-200 p-4">
            <h2 className="text-lg font-bold text-base-black">
              {t('teacherFlashcardSetProgress.classSummaryHeading', { count: progress.classSummary.studentCount })}
            </h2>
            <div className="mt-3 flex flex-wrap gap-6 text-sm text-base-black/80">
              <span>{t('teacherFlashcardSetProgress.knownAllLabel')} <strong className="text-base-black">{progress.classSummary.knownCount}</strong></span>
              <span>{t('teacherFlashcardSetProgress.learningLabel')} <strong className="text-base-black">{progress.classSummary.learningCount}</strong></span>
              <span>{t('teacherFlashcardSetProgress.newLabel')} <strong className="text-base-black">{progress.classSummary.newCount}</strong></span>
              <span>{t('teacherFlashcardSetProgress.cardsInSetLabel', { count: progress.cardCount })}</span>
            </div>
            <div className="mt-4 overflow-x-auto rounded-lg border border-primary-100">
              <table className="min-w-full divide-y divide-primary-100 text-sm">
                <thead className="bg-primary-50 text-left text-xs font-semibold uppercase tracking-wide text-primary-700">
                  <tr>
                    <th className="px-4 py-2">{t('teacherFlashcardSetProgress.colExerciseType')}</th>
                    <th className="px-4 py-2">{t('teacherFlashcardSetProgress.colAttempted')}</th>
                    <th className="px-4 py-2">{t('teacherFlashcardSetProgress.colCorrect')}</th>
                    <th className="px-4 py-2">{t('teacherFlashcardSetProgress.colAccuracy')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary-100">
                  {progress.classSummary.activityStats.map((stat) => (
                    <tr key={stat.type}>
                      <td className="px-4 py-2 font-medium text-base-black">
                        {t(`teacherFlashcardSetProgress.activity.${stat.type}`, { defaultValue: stat.type })}
                      </td>
                      <td className="px-4 py-2 text-base-black/80">{stat.attempted}</td>
                      <td className="px-4 py-2 text-base-black/80">{stat.correct}</td>
                      <td className="px-4 py-2 text-base-black/80">
                        {stat.accuracyPercent === null ? '—' : `${stat.accuracyPercent}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-bold text-base-black">{t('teacherFlashcardSetProgress.perStudentHeading')}</h2>
            <div className="mt-3 overflow-x-auto rounded-xl border border-primary-200">
              <table className="min-w-full divide-y divide-primary-100 text-sm">
                <thead className="bg-primary-50 text-left text-xs font-semibold uppercase tracking-wide text-primary-700">
                  <tr>
                    <th className="px-4 py-3">{t('teacherFlashcardSetProgress.colStudent')}</th>
                    <th className="px-4 py-3">{t('teacherFlashcardSetProgress.colKnown')}</th>
                    <th className="px-4 py-3">{t('teacherFlashcardSetProgress.colLearning')}</th>
                    <th className="px-4 py-3">{t('teacherFlashcardSetProgress.colNew')}</th>
                    <th className="px-4 py-3">{t('teacherFlashcardSetProgress.colOverallAccuracy')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary-100">
                  {progress.students.map((student) => {
                    const totalAttempted = student.activityStats.reduce((sum, s) => sum + s.attempted, 0);
                    const totalCorrect = student.activityStats.reduce((sum, s) => sum + s.correct, 0);
                    const overallAccuracy = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 1000) / 10 : null;
                    const hasActivity = totalAttempted > 0 || student.knownCount + student.learningCount > 0;
                    return (
                      <tr key={student.studentId} className={hasActivity ? '' : 'bg-red-50/40'}>
                        <td className="px-4 py-3 font-medium text-base-black">
                          {student.studentName}
                          {!hasActivity && (
                            <span className="ml-2 text-xs font-normal text-red-600">
                              {t('teacherFlashcardSetProgress.hasntPracticed')}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-base-black/80">{student.knownCount}</td>
                        <td className="px-4 py-3 text-base-black/80">{student.learningCount}</td>
                        <td className="px-4 py-3 text-base-black/80">{student.newCount}</td>
                        <td className="px-4 py-3 text-base-black/80">
                          {overallAccuracy === null ? '—' : `${overallAccuracy}% (${totalCorrect}/${totalAttempted})`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default TeacherFlashcardSetProgressPage;
