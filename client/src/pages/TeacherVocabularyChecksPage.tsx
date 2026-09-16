import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  ClassDTO,
  FlashcardSetSummaryDTO,
  TeacherStudentSummaryDTO,
  TeacherVocabularyCheckSummaryDTO,
  UnitDTO,
} from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';

/**
 * Teacher: generate a Vocabulary Check (T-038, redesigned by T-086 to a Unit-based random
 * pool) for a target student or group, and see the ones already generated. The generated
 * test's QUESTION POOL is now drawn server-side from EVERY `FlashcardCard` across every
 * `FlashcardSet` tagged with the teacher-picked `unitId` (see
 * `server/src/lib/vocabularyCheckGenerator.ts`), picked entirely at random — completely
 * independent of whether the target student(s) have studied those words. This page
 * collects WHO it's for (unchanged), plus the new `unitId`/`questionCount`/
 * `timeLimitMinutes` fields the teacher now explicitly chooses.
 *
 * The "words in this unit" hint next to the Unit picker is computed client-side from
 * `teacherApi.listFlashcardSets()` (summing `cardCount` for every set tagged with the
 * selected unit) rather than a new endpoint — that data is already fetched by other
 * teacher pages and is small enough to just reuse here.
 *
 * T-097: reached with `?classId=` (from `TeacherClassWorkspacePage`'s hub), the target-
 * student list DEFAULTS to that class's own roster, filtered client-side using each
 * student's own `classId` (`TeacherStudentSummaryDTO`'s new field, from the SAME
 * `GET /api/teacher/students` call already made here — no new endpoint). The full
 * "every student, any class" roster T-076 deliberately kept is still one toggle away —
 * this only changes the DEFAULT, per that task's own documented "any teacher, any
 * student" design, which this does not remove.
 */
function TeacherVocabularyChecksPage() {
  const { t } = useTranslation();
  const [students, setStudents] = useState<TeacherStudentSummaryDTO[] | null>(null);
  const [checks, setChecks] = useState<TeacherVocabularyCheckSummaryDTO[] | null>(null);
  const [units, setUnits] = useState<UnitDTO[] | null>(null);
  const [flashcardSets, setFlashcardSets] = useState<FlashcardSetSummaryDTO[] | null>(null);
  const [classes, setClasses] = useState<ClassDTO[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [unitId, setUnitId] = useState('');
  const [questionCount, setQuestionCount] = useState('');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState('15');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [searchParams] = useSearchParams();
  const scopeClassId = searchParams.get('classId') ?? '';
  // T-097: starts scoped (`false` = "class roster only") whenever arriving with
  // `?classId=`; irrelevant (never read, since `visibleStudents` below only narrows when
  // `scopeClassId` is set) when reached without one.
  const [showAllStudents, setShowAllStudents] = useState(false);

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
    teacherApi
      .listUnits()
      .then(setUnits)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('teacherVocabularyChecks.loadUnitsFailed')));
    teacherApi
      .listFlashcardSets()
      .then(setFlashcardSets)
      .catch(() => undefined);
    if (scopeClassId) {
      teacherApi
        .listClasses()
        .then(setClasses)
        .catch(() => setClasses([]));
    }
  }

  const unitWordCount =
    unitId && flashcardSets
      ? flashcardSets.filter((set) => set.unitId === unitId).reduce((sum, set) => sum + set.cardCount, 0)
      : null;

  // `t` is stable in practice (site-wide, admin-controlled language — PROJECT_PLAN
  // Guiding Principle 3/Assumption A13), safe to omit from this dependency list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, []);

  const scopedClassName = classes?.find((c) => c.id === scopeClassId)?.name ?? null;
  // T-097: the roster actually shown/selectable — narrowed to the class roster when
  // arriving with `?classId=` UNLESS the teacher has expanded back to "every student"
  // (T-076's kept capability). Reached without `?classId=`, this is just `students`,
  // unchanged from before this task.
  const visibleStudents =
    scopeClassId && !showAllStudents ? (students?.filter((s) => s.classId === scopeClassId) ?? null) : students;

  function toggleStudent(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allStudentsSelected =
    visibleStudents !== null && visibleStudents.length > 0 && visibleStudents.every((s) => selectedIds.has(s.id));

  function toggleSelectAll() {
    if (!visibleStudents) return;
    setSelectedIds((prev) => {
      if (allStudentsSelected) {
        const next = new Set(prev);
        visibleStudents.forEach((s) => next.delete(s.id));
        return next;
      }
      return new Set([...prev, ...visibleStudents.map((s) => s.id)]);
    });
  }

  const parsedQuestionCount = Number(questionCount);
  const parsedTimeLimitMinutes = Number(timeLimitMinutes);
  const canSubmit =
    selectedIds.size > 0 &&
    unitId !== '' &&
    questionCount.trim() !== '' &&
    Number.isInteger(parsedQuestionCount) &&
    parsedQuestionCount > 0 &&
    timeLimitMinutes.trim() !== '' &&
    Number.isInteger(parsedTimeLimitMinutes) &&
    parsedTimeLimitMinutes >= 1 &&
    parsedTimeLimitMinutes <= 480;

  async function handleGenerate(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setIsGenerating(true);
    setError(null);
    try {
      await teacherApi.generateVocabularyCheck({
        studentIds: [...selectedIds],
        unitId,
        questionCount: parsedQuestionCount,
        timeLimitMinutes: parsedTimeLimitMinutes,
        title: title.trim() || undefined,
      });
      setSelectedIds(new Set());
      setUnitId('');
      setQuestionCount('');
      setTimeLimitMinutes('15');
      setTitle('');
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
        {scopeClassId && (
          <p className="mt-1 text-sm text-primary-600">
            {scopedClassName ? t('classFilter.lockedLabel', { className: scopedClassName }) : t('common.loading')}{' '}
            <Link to="/teacher/classes" className="font-medium underline">
              {t('classFilter.switchClass')}
            </Link>
          </p>
        )}
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
        {scopeClassId && students && students.length > 0 && (
          <p className="mt-1 text-xs text-base-black/60">
            {showAllStudents
              ? t('teacherVocabularyChecks.showingAllStudents')
              : t('teacherVocabularyChecks.showingClassStudents', { className: scopedClassName ?? '' })}{' '}
            <button
              type="button"
              onClick={() => setShowAllStudents((prev) => !prev)}
              className="font-medium text-primary-600 underline"
            >
              {showAllStudents
                ? t('teacherVocabularyChecks.showClassOnlyLink')
                : t('teacherVocabularyChecks.showAllStudentsLink')}
            </button>
          </p>
        )}
        {!students && (
          <p className="mt-2 text-sm text-base-black/60">{t('teacherVocabularyChecks.loadingStudents')}</p>
        )}
        {students && students.length > 0 && visibleStudents?.length === 0 && (
          <p className="mt-2 text-sm text-base-black/60">{t('teacherVocabularyChecks.noStudentsInClass')}</p>
        )}
        {students?.length === 0 && (
          <p className="mt-2 text-sm text-base-black/60">{t('teacherVocabularyChecks.noStudents')}</p>
        )}
        {visibleStudents && visibleStudents.length > 0 && (
          <label className="mt-2 flex items-center gap-2 text-sm font-medium text-base-black">
            <input
              type="checkbox"
              checked={allStudentsSelected}
              onChange={toggleSelectAll}
              className="h-4 w-4 rounded border-primary-300 text-primary-600 focus:ring-primary-200"
            />
            {t('teacherVocabularyChecks.selectAll')}
          </label>
        )}
        <ul className="mt-3 flex flex-col gap-2">
          {visibleStudents?.map((student) => (
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

        <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-primary-600">
          {t('teacherVocabularyChecks.selectUnit')}
        </h2>
        <label className="mt-2 flex flex-col gap-1 text-sm text-base-black">
          <select
            value={unitId}
            onChange={(event) => setUnitId(event.target.value)}
            className="rounded-md border border-primary-200 px-3 py-1.5 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          >
            <option value="">{t('teacherVocabularyChecks.unitPlaceholder')}</option>
            {units?.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
          {unitId && unitWordCount !== null && (
            <span className="text-xs text-base-black/60">
              {t('teacherVocabularyChecks.unitWordCount', { count: unitWordCount })}
            </span>
          )}
        </label>

        <div className="mt-4 flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 text-sm text-base-black">
            {t('teacherVocabularyChecks.questionCountLabel')}
            <input
              type="number"
              min={1}
              value={questionCount}
              onChange={(event) => setQuestionCount(event.target.value)}
              className="w-32 rounded-md border border-primary-200 px-3 py-1.5 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-base-black">
            {t('teacherVocabularyChecks.timeLimitLabel')}
            <input
              type="number"
              min={1}
              max={480}
              value={timeLimitMinutes}
              onChange={(event) => setTimeLimitMinutes(event.target.value)}
              className="w-32 rounded-md border border-primary-200 px-3 py-1.5 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </label>
        </div>

        <label className="mt-4 flex flex-col gap-1 text-sm text-base-black">
          {t('teacherVocabularyChecks.titleLabel')}
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('teacherVocabularyChecks.titlePlaceholder')}
            className="w-96 rounded-md border border-primary-200 px-3 py-1.5 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
        </label>

        <button
          type="submit"
          disabled={!canSubmit || isGenerating}
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
