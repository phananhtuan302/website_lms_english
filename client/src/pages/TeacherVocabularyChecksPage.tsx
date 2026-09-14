import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
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
  const [students, setStudents] = useState<TeacherStudentSummaryDTO[] | null>(null);
  const [checks, setChecks] = useState<TeacherVocabularyCheckSummaryDTO[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  function reload() {
    teacherApi
      .listStudents()
      .then(setStudents)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load students.'));
    teacherApi
      .listVocabularyChecks()
      .then(setChecks)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load Vocabulary Checks.'));
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
      setError(err instanceof ApiError ? err.message : 'Failed to generate Vocabulary Check.');
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/teacher/dashboard" className="text-sm text-primary-600 hover:underline">
          ← Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-primary-700">Vocabulary Check</h1>
        <p className="mt-1 text-sm text-base-black/60">
          Generate a fixed 15-minute Vocabulary Check for a target student or group. Its questions
          are drawn only from vocabulary those students have already studied (status "learning" or
          "known") — never new/unseen words.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <form onSubmit={handleGenerate} className="rounded-xl border border-primary-200 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-600">
          Select target student(s)
        </h2>
        {!students && <p className="mt-2 text-sm text-base-black/60">Loading students...</p>}
        {students?.length === 0 && <p className="mt-2 text-sm text-base-black/60">No students yet.</p>}
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
          {isGenerating ? 'Generating...' : `Generate for ${selectedIds.size} selected`}
        </button>
      </form>

      <section>
        <h2 className="text-lg font-bold text-base-black">Generated Vocabulary Checks</h2>
        {!checks && <p className="mt-2 text-sm text-base-black/60">Loading...</p>}
        {checks?.length === 0 && (
          <p className="mt-2 text-sm text-base-black/60">None generated yet — use the form above.</p>
        )}
        <ul className="mt-3 flex flex-col gap-2">
          {checks?.map((check) => (
            <li
              key={check.id}
              className="rounded-lg border border-primary-100 bg-primary-50 px-4 py-3 text-sm"
            >
              <p className="font-medium text-base-black">{check.title}</p>
              <p className="mt-1 text-xs text-base-black/60">
                {check.timeLimitMinutes} min · {check.questionCount} question
                {check.questionCount === 1 ? '' : 's'} · assigned to{' '}
                {check.assignedStudents.map((s) => s.name).join(', ')} · generated{' '}
                {new Date(check.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default TeacherVocabularyChecksPage;
