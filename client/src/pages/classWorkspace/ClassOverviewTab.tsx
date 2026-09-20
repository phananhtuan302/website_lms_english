import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useClassWorkspace } from '../../hooks/useClassWorkspace';
import { classTabPath } from '../../lib/classWorkspace';

/**
 * "Tổng quan" tab (T-102): index route of the class workspace. A quick snapshot of the
 * class plus the two next steps a teacher actually wants from here — hand out work
 * ("Giao bài mới" → Bài tập tab) and look at results ("Xem điểm" → Điểm số tab). Reads
 * everything from the layout's outlet context; makes no requests of its own.
 */
function ClassOverviewTab() {
  const { t } = useTranslation();
  const { cls } = useClassWorkspace();

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          to={classTabPath(cls.id, 'students')}
          className="flex flex-col gap-1 rounded-2xl border border-primary-200 p-5 transition-colors hover:border-primary-400 hover:bg-primary-50"
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-base-black/60">
            {t('classWorkspace.overview.studentsLabel')}
          </span>
          <span className="text-3xl font-bold text-primary-700">{cls.studentCount}</span>
          <span className="text-sm text-base-black/60">
            {cls.studentCount === 0
              ? t('classWorkspace.overview.noStudentsHint')
              : t('classWorkspace.overview.viewStudents')}
          </span>
        </Link>

        <div className="flex flex-col gap-1 rounded-2xl border border-primary-200 p-5">
          <span className="text-xs font-semibold uppercase tracking-wide text-base-black/60">
            {t('classWorkspace.overview.semesterLabel')}
          </span>
          {cls.currentPeriodName ? (
            <span className="text-3xl font-bold text-primary-700">{cls.currentPeriodName}</span>
          ) : (
            <span className="mt-1 inline-flex self-start rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
              {t('classWorkspace.overview.noSemester')}
            </span>
          )}
          <span className="text-sm text-base-black/60">
            {cls.currentPeriodName
              ? t('classWorkspace.overview.semesterHint')
              : t('classWorkspace.overview.noSemesterHint')}
          </span>
        </div>
      </div>

      <section>
        <h2 className="text-lg font-bold text-base-black">
          {t('classWorkspace.overview.nextStepsHeading')}
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            to={classTabPath(cls.id, 'assignments')}
            className="flex flex-col gap-1 rounded-2xl bg-primary-500 p-5 text-base-white transition-colors hover:bg-primary-600"
          >
            <span className="text-lg font-bold">{t('classWorkspace.overview.assignTitle')}</span>
            <span className="text-sm text-base-white/90">
              {t('classWorkspace.overview.assignDescription')}
            </span>
          </Link>
          <Link
            to={classTabPath(cls.id, 'grades')}
            className="flex flex-col gap-1 rounded-2xl border border-primary-300 p-5 transition-colors hover:border-primary-500 hover:bg-primary-50"
          >
            <span className="text-lg font-bold text-primary-700">
              {t('classWorkspace.overview.gradesTitle')}
            </span>
            <span className="text-sm text-base-black/60">
              {t('classWorkspace.overview.gradesDescription')}
            </span>
          </Link>
        </div>
      </section>
    </div>
  );
}

export default ClassOverviewTab;
