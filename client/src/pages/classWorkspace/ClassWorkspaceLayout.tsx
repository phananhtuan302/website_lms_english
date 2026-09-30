import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AcademicPeriodDTO, ClassDTO } from '@platform/shared';
import ClassSemesterSelect from '../../components/ClassSemesterSelect';
import type { ClassWorkspaceContext } from '../../hooks/useClassWorkspace';
import {
  CLASSES_HOME_PATH,
  CLASS_TABS,
  activeClassTab,
  classTabPath,
} from '../../lib/classWorkspace';
import { teacherApi } from '../../lib/teacherApi';

/**
 * Layout route for `/teacher/classes/:classId` (T-102, Phase 13) — the persistent "class
 * workspace" every class-scoped screen renders INSIDE, Google Classroom / Canvas style:
 * a header (class name, semester dropdown, back link, quick class-switcher), a "no
 * semester yet" banner when the class has none (it points at the header's dropdown — there is
 * only ever one), a tab bar, and the active tab via
 * `<Outlet/>`.
 *
 * The class list and semester list are each fetched ONCE here and shared with the tabs
 * through outlet context (see `useClassWorkspace`), so tabs never refetch the class and a
 * semester switch in the header shows up everywhere immediately. The class is looked up in
 * the teacher's OWN class list (`GET /api/teacher/classes` is already owner-scoped), so an
 * unknown or foreign `:classId` simply isn't found and gets a clean "not found" state —
 * never a crash and never a peek at someone else's class.
 *
 * Adding a tab: add it to `CLASS_TABS` (lib/classWorkspace.ts), add a child `<Route>` in
 * `App.tsx`, add its label under `classWorkspace.tabs` in both i18n files.
 */
function ClassWorkspaceLayout() {
  const { classId = '' } = useParams<{ classId: string }>();
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const [classes, setClasses] = useState<ClassDTO[] | null>(null);
  const [classesFailed, setClassesFailed] = useState(false);
  const [periods, setPeriods] = useState<AcademicPeriodDTO[] | null>(null);
  const [periodsFailed, setPeriodsFailed] = useState(false);

  const reload = useCallback(async () => {
    setClasses(await teacherApi.listClasses());
    setClassesFailed(false);
  }, []);

  useEffect(() => {
    teacherApi
      .listClasses()
      .then(setClasses)
      .catch(() => setClassesFailed(true));
    teacherApi
      .listSelectablePeriods()
      .then(setPeriods)
      .catch(() => {
        setPeriods([]);
        setPeriodsFailed(true);
      });
  }, []);

  const cls = classes?.find((candidate) => candidate.id === classId) ?? null;
  const periodsError = periodsFailed ? t('classWorkspace.loadPeriodsFailed') : null;

  const setClass = useCallback((updated: ClassDTO) => {
    setClasses((prev) => prev?.map((c) => (c.id === updated.id ? updated : c)) ?? prev);
  }, []);

  const outletContext = useMemo<ClassWorkspaceContext | null>(
    () => (cls && classes ? { cls, classes, periods, periodsError, setClass, reload } : null),
    [cls, classes, periods, periodsError, setClass, reload],
  );

  const backLink = (
    <Link
      to={CLASSES_HOME_PATH}
      className="inline-block py-2.5 text-sm font-medium text-primary-600 hover:underline sm:py-0"
    >
      {t('classWorkspace.backToClasses')}
    </Link>
  );

  if (classesFailed) {
    return (
      <div className="flex flex-col gap-3">
        {backLink}
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {t('classWorkspace.loadFailed')}
        </p>
      </div>
    );
  }

  if (classes === null) {
    return <p className="text-sm text-base-black/60">{t('common.loading')}</p>;
  }

  if (!cls || !outletContext) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-primary-200 bg-primary-50 p-6">
        <h1 className="text-2xl font-bold text-primary-700">
          {t('classWorkspace.notFoundHeading')}
        </h1>
        <p className="text-sm text-base-black/70">{t('classWorkspace.notFoundMessage')}</p>
        <div>
          <Link
            to={CLASSES_HOME_PATH}
            className="inline-block rounded-md bg-primary-500 px-4 py-2.5 sm:py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
          >
            {t('classWorkspace.notFoundBack')}
          </Link>
        </div>
      </div>
    );
  }

  const activeTab = activeClassTab(location.pathname);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3 rounded-2xl border border-primary-100 bg-primary-50 p-4 sm:gap-4 sm:p-5">
        <div>{backLink}</div>
        <div className="flex flex-wrap items-end justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <h1 className="break-words text-xl font-bold text-primary-700 sm:text-3xl">
              {cls.name}
            </h1>
            <p className="mt-0.5 text-sm text-base-black/60 sm:mt-1">
              {t('classWorkspace.studentCount', { count: cls.studentCount })}
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-3 sm:gap-4">
            {classes.length > 1 && (
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-base-black/60">
                {t('classWorkspace.classSwitcherLabel')}
                <select
                  value={cls.id}
                  onChange={(event) =>
                    navigate(classTabPath(event.target.value, activeTab.segment))
                  }
                  className="w-40 rounded-md border border-primary-200 bg-base-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 sm:w-56"
                >
                  {classes.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="flex max-w-full flex-col gap-1">
              <ClassSemesterSelect
                key={cls.id}
                cls={cls}
                periods={periods}
                periodsError={periodsError}
                onChanged={setClass}
              />
              {/* Phase 15: says what the semester choice means for students. Hidden on a phone
                width — the class workspace header was eating close to half the screen height
                there before any real content showed (2026-09 mobile review); the dropdown's own
                label already says what it does. */}
              <p className="hidden max-w-xs text-xs text-base-black/60 sm:block">{t('classWorkspace.semesterHelper')}</p>
            </div>
          </div>
        </div>
      </header>

      {!cls.currentPeriodId && (
        <div
          role="status"
          className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900"
        >
          <p className="font-semibold">{t('classWorkspace.noSemesterBanner')}</p>
        </div>
      )}

      <nav aria-label={t('classWorkspace.tabsAriaLabel')}>
        <ul className="flex flex-wrap gap-x-1 border-b border-primary-100">
          {CLASS_TABS.map((tab) => {
            const isActive = tab === activeTab;
            return (
              <li key={tab.segment || 'overview'}>
                <Link
                  to={classTabPath(cls.id, tab.segment)}
                  aria-current={isActive ? 'page' : undefined}
                  className="-mb-px inline-block border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-base-black/60 transition-colors hover:border-primary-200 hover:text-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 aria-[current=page]:border-primary-500 aria-[current=page]:font-semibold aria-[current=page]:text-primary-700"
                >
                  {t(tab.labelKey)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Keyed by class so switching class (quick-switcher) remounts the tab: per-tab local
        state — e.g. the Cài đặt rename input — can never leak from one class to another. */}
      <Outlet key={cls.id} context={outletContext} />
    </div>
  );
}

export default ClassWorkspaceLayout;
