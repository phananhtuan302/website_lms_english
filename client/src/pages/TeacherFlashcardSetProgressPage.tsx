import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { TeacherVocabProgressDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';

const ACTIVITY_LABELS: Record<string, string> = {
  fillBlank: 'Fill in the blank',
  unscramble: 'Unscramble',
  listenAndType: 'Listen and type',
  ipaToWord: 'IPA to word',
  matching: 'Matching',
  sentence: 'Use in a sentence',
  spaceShooter: 'Space shooter game',
  runner: 'Runner game',
};

/**
 * Teacher's per-student + per-class vocabulary progress view for one owned flashcard
 * set (T-030). `classSummary` rolls up every student row below it — see
 * `teacherVocabProgress.routes.ts`'s doc comment for why "the class" is the full
 * student roster (this schema has no smaller Class/cohort subdivision).
 */
function TeacherFlashcardSetProgressPage() {
  const { setId } = useParams<{ setId: string }>();
  const [progress, setProgress] = useState<TeacherVocabProgressDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!setId) return;
    teacherApi
      .getVocabSetProgress(setId)
      .then(setProgress)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load progress.'));
  }, [setId]);

  if (!setId) return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to={`/teacher/flashcard-sets/${setId}`} className="text-sm text-primary-600 hover:underline">
          ← Back to set editor
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-primary-700">
          {progress ? `Student progress — ${progress.setName}` : 'Student progress'}
        </h1>
        <p className="mt-1 text-sm text-base-black/60">
          Every student account is listed below, including ones who haven&apos;t practiced yet.
        </p>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {!error && !progress && <p className="text-sm text-base-black/60">Loading...</p>}

      {progress && (
        <>
          <section className="rounded-xl border border-primary-200 p-4">
            <h2 className="text-lg font-bold text-base-black">Class summary ({progress.classSummary.studentCount} students)</h2>
            <div className="mt-3 flex flex-wrap gap-6 text-sm text-base-black/80">
              <span>Known (all students): <strong className="text-base-black">{progress.classSummary.knownCount}</strong></span>
              <span>Learning: <strong className="text-base-black">{progress.classSummary.learningCount}</strong></span>
              <span>New: <strong className="text-base-black">{progress.classSummary.newCount}</strong></span>
              <span>Cards in set: {progress.cardCount}</span>
            </div>
            <div className="mt-4 overflow-x-auto rounded-lg border border-primary-100">
              <table className="min-w-full divide-y divide-primary-100 text-sm">
                <thead className="bg-primary-50 text-left text-xs font-semibold uppercase tracking-wide text-primary-700">
                  <tr>
                    <th className="px-4 py-2">Exercise type</th>
                    <th className="px-4 py-2">Attempted</th>
                    <th className="px-4 py-2">Correct</th>
                    <th className="px-4 py-2">Accuracy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary-100">
                  {progress.classSummary.activityStats.map((stat) => (
                    <tr key={stat.type}>
                      <td className="px-4 py-2 font-medium text-base-black">{ACTIVITY_LABELS[stat.type] ?? stat.type}</td>
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
            <h2 className="text-lg font-bold text-base-black">Per student</h2>
            <div className="mt-3 overflow-x-auto rounded-xl border border-primary-200">
              <table className="min-w-full divide-y divide-primary-100 text-sm">
                <thead className="bg-primary-50 text-left text-xs font-semibold uppercase tracking-wide text-primary-700">
                  <tr>
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Known</th>
                    <th className="px-4 py-3">Learning</th>
                    <th className="px-4 py-3">New</th>
                    <th className="px-4 py-3">Overall exercise accuracy</th>
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
                            <span className="ml-2 text-xs font-normal text-red-600">Hasn&apos;t practiced</span>
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
