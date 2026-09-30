import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ClassRosterStudentDTO } from '@platform/shared';
import HorizontalScrollHint from '../../components/HorizontalScrollHint';
import { useClassWorkspace } from '../../hooks/useClassWorkspace';
import { classTabPath } from '../../lib/classWorkspace';
import { formatScore10 } from '../../lib/scoreFormat';
import { teacherApi } from '../../lib/teacherApi';
import AddStudentsModal from './AddStudentsModal';
import ResetStudentPasswordModal from './ResetStudentPasswordModal';
import TransferStudentModal from './TransferStudentModal';

/** Lower-cases and strips Vietnamese diacritics so "nguyen" finds "Nguyễn" — teachers often
 * type search terms without accents. */
function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase();
}

function formatAverage(value: number | null): string {
  return formatScore10(value);
}

/**
 * "Học sinh" tab (T-104): the class roster — name, email, how many of the class's current-
 * semester tests the student has submitted, and their average score — with a search box.
 * Removing a student outright is still an Admin action (a hint says so); adding students
 * (T-111) is the "Thêm học sinh" button — a dialog with a one-student form and an Excel roster
 * import. Moving a student to one of the teacher's OWN other classes is self-service (T-118C,
 * Phase 17 — "Chuyển lớp", replacing the old "ask an admin" note for this one case).
 * Each row also has "Đặt lại mật khẩu" (a student who lost their password) and now "Chuyển lớp":
 * both sit under the name, not in a column of their own, so they stay in view on a phone where
 * the table scrolls sideways inside its card.
 *
 * The numbers come from `GET /api/teacher/classes/:classId/students`, which computes them
 * from the same best-attempt grid as the gradebook, so this tab and "Điểm số" always agree.
 * The roster is refetched when the class's semester changes (the header's semester switch
 * updates `cls.currentPeriodId` through the workspace context), since the numbers are per
 * semester.
 */
function ClassStudentsTab() {
  const { t } = useTranslation();
  const { cls, reload: reloadClasses } = useClassWorkspace();
  const periodKey = cls.currentPeriodId ?? '';

  // Tagged with the semester it was loaded for, so a stale roster (previous semester) is
  // never shown as the new one while the refetch is in flight — no synchronous setState
  // needed in the effect (`react-hooks/set-state-in-effect`).
  const [loaded, setLoaded] = useState<{ key: string; roster: ClassRosterStudentDTO[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [resetTarget, setResetTarget] = useState<ClassRosterStudentDTO | null>(null);
  const [transferTarget, setTransferTarget] = useState<ClassRosterStudentDTO | null>(null);
  // Brief "Đã chuyển ... sang lớp ..." confirmation shown after a transfer succeeds and the
  // modal has closed (same transient-banner pattern as `AdminUsersPage`'s password-reset message).
  const [transferMessage, setTransferMessage] = useState<string | null>(null);
  // Bumped after students are added so the roster below is fetched again.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!transferMessage) return;
    const timer = setTimeout(() => setTransferMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [transferMessage]);

  useEffect(() => {
    let cancelled = false;
    teacherApi
      .getClassRoster(cls.id)
      .then((roster) => {
        if (cancelled) return;
        setLoaded({ key: periodKey, roster });
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [cls.id, periodKey, reloadToken]);

  function handleStudentsAdded() {
    setReloadToken((n) => n + 1);
    // The header's "N học sinh" count comes from the class list — refresh it too.
    void reloadClasses().catch(() => undefined);
  }

  function handleStudentTransferred(name: string, destinationClassName: string) {
    setTransferTarget(null);
    setTransferMessage(t('classStudents.transfer.success', { name, className: destinationClassName }));
    // The transferred student leaves this class's roster — same reload path as adding students.
    handleStudentsAdded();
  }

  const roster = loaded && loaded.key === periodKey ? loaded.roster : null;

  const visible = useMemo(() => {
    if (!roster) return [];
    const needle = normalizeForSearch(query.trim());
    if (needle === '') return roster;
    return roster.filter((student) =>
      normalizeForSearch(`${student.name} ${student.email}`).includes(needle),
    );
  }, [roster, query]);

  if (failed && !roster) {
    return (
      <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {t('classStudents.loadFailed')}
      </p>
    );
  }

  if (!roster) return <p className="text-sm text-base-black/60">{t('common.loading')}</p>;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-primary-700">{t('classStudents.heading')}</h2>
          <p className="mt-1 text-sm text-base-black/60">
            {t('classStudents.count', { count: roster.length })}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {transferMessage && (
            <p role="status" className="rounded-md border border-primary-200 bg-primary-50 px-3 py-2 text-sm font-medium text-primary-800">
              {transferMessage}
            </p>
          )}
          {roster.length > 0 && (
            <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
              {t('classStudents.searchLabel')}
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('classStudents.searchPlaceholder')}
                className="w-64 max-w-full rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
            </label>
          )}
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="min-h-[2.5rem] rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
          >
            {t('classRoster.addButton')}
          </button>
        </div>
      </div>

      {roster.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-primary-300 bg-primary-50 p-6 text-center">
          <p className="text-base font-semibold text-primary-700">{t('classStudents.empty')}</p>
          <p className="mt-1 text-sm text-base-black/60">{t('classStudents.emptyHint')}</p>
        </div>
      ) : (
        <HorizontalScrollHint className="overflow-x-auto rounded-xl border border-primary-200">
          <table className="min-w-full divide-y divide-primary-100 text-sm">
            <thead className="bg-primary-50 text-left text-xs font-semibold uppercase tracking-wide text-primary-700">
              <tr>
                <th scope="col" className="px-4 py-3">
                  {t('classStudents.columns.name')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('classStudents.columns.email')}
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  {t('classStudents.columns.submitted')}
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  {t('classStudents.columns.average')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-100">
              {visible.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-4 text-center text-base-black/60">
                    {t('classStudents.noMatch', { query: query.trim() })}
                  </td>
                </tr>
              )}
              {visible.map((student) => (
                <tr key={student.id}>
                  <td className="whitespace-nowrap px-4 py-2 font-medium text-base-black sm:py-3">
                    {student.name}
                    <div className="-ml-3 flex flex-wrap items-center">
                      <button
                        type="button"
                        onClick={() => setResetTarget(student)}
                        aria-label={t('classResetPassword.buttonAria', { name: student.name })}
                        className="mt-0.5 flex min-h-[2.5rem] items-center rounded-md px-3 text-xs font-medium text-primary-600 hover:bg-primary-50 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 sm:min-h-0 sm:py-1"
                      >
                        {t('classResetPassword.button')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setTransferTarget(student)}
                        aria-label={t('classStudents.transfer.buttonAria', { name: student.name })}
                        className="mt-0.5 flex min-h-[2.5rem] items-center rounded-md px-3 text-xs font-medium text-primary-600 hover:bg-primary-50 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 sm:min-h-0 sm:py-1"
                      >
                        {t('classStudents.transfer.button')}
                      </button>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-base-black/70">{student.email}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-base-black/80">
                    {student.submittedCount}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-base-black">
                    {formatAverage(student.averageScorePercent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </HorizontalScrollHint>
      )}

      <div className="flex flex-col gap-1 text-sm text-base-black/60">
        {cls.currentPeriodId === null ? (
          <p>{t('classStudents.noSemesterNote')}</p>
        ) : (
          <p>{t('classStudents.scoreNote')}</p>
        )}
        <p>{t('classStudents.adminHint')}</p>
        {roster.length > 0 && cls.currentPeriodId !== null && (
          <p>
            <Link
              to={classTabPath(cls.id, 'grades')}
              className="font-medium text-primary-600 hover:underline"
            >
              {t('classStudents.viewGrades')} →
            </Link>
          </p>
        )}
      </div>

      {resetTarget && (
        <ResetStudentPasswordModal
          classId={cls.id}
          student={resetTarget}
          onClose={() => setResetTarget(null)}
        />
      )}

      {transferTarget && (
        <TransferStudentModal
          classId={cls.id}
          student={transferTarget}
          onClose={() => setTransferTarget(null)}
          onTransferred={(destinationClassName) =>
            handleStudentTransferred(transferTarget.name, destinationClassName)
          }
        />
      )}

      {showAdd && (
        <AddStudentsModal
          classId={cls.id}
          className={cls.name}
          onClose={() => setShowAdd(false)}
          onChanged={handleStudentsAdded}
        />
      )}
    </section>
  );
}

export default ClassStudentsTab;
