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
 * Redesigned Layout for `/teacher/classes/:classId`
 * Clean SaaS standard, unified typography, visually balanced controls.
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
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 hover:text-slate-900"
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
      </svg>
      <span>Tất cả lớp</span>
    </Link>
  );

  if (classesFailed) {
    return (
      <div className="flex flex-col gap-3">
        {backLink}
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {t('classWorkspace.loadFailed')}
        </p>
      </div>
    );
  }

  if (classes === null) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
        <span>{t('common.loading')}</span>
      </div>
    );
  }

  if (!cls || !outletContext) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-xs">
        <h1 className="text-xl font-bold text-slate-800">
          {t('classWorkspace.notFoundHeading')}
        </h1>
        <p className="max-w-md text-sm text-slate-500">{t('classWorkspace.notFoundMessage')}</p>
        <div className="pt-2">
          <Link
            to={CLASSES_HOME_PATH}
            className="inline-flex items-center rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
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
      {/* 1. Header Toolbar - Tinh gọn, bỏ tiêu đề lớn trùng lặp */}
      <header className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs sm:p-4.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {backLink}
            <div className="h-4 w-px bg-slate-200" />
            <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
              <span>👥 {t('classWorkspace.studentCount', { count: cls.studentCount })}</span>
            </div>
          </div>

          {/* Quick Switcher dropdowns góc phải */}
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            {classes.length > 1 && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-slate-500">Lớp:</span>
                <select
                  value={cls.id}
                  onChange={(event) =>
                    navigate(classTabPath(event.target.value, activeTab.segment))
                  }
                  className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 shadow-xs focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                >
                  {classes.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500">Học kỳ:</span>
              <ClassSemesterSelect
                key={cls.id}
                cls={cls}
                periods={periods}
                periodsError={periodsError}
                onChanged={setClass}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Cảnh báo chưa chọn học kỳ */}
      {!cls.currentPeriodId && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-xs"
        >
          <span className="text-lg">⚠️</span>
          <div>
            <p className="text-sm font-semibold">{t('classWorkspace.noSemesterBanner')}</p>
            <p className="text-xs text-amber-700">Vui lòng chọn học kỳ ở menu góc trên bên phải để học sinh thấy đúng các bài kiểm tra.</p>
          </div>
        </div>
      )}

      {/* 2. Modern Segmented Underline Tabs Bar */}
      <nav aria-label={t('classWorkspace.tabsAriaLabel')} className="border-b border-slate-200 bg-transparent">
        <ul className="flex flex-wrap gap-1 sm:gap-2">
          {CLASS_TABS.map((tab) => {
            const isActive = tab === activeTab;
            return (
              <li key={tab.segment || 'overview'}>
                <Link
                  to={classTabPath(cls.id, tab.segment)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`inline-flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-all ${
                    isActive
                      ? 'border-primary-600 text-primary-700 bg-primary-50/60 rounded-t-lg'
                      : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
                  }`}
                >
                  {t(tab.labelKey)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Tab Content */}
      <Outlet key={cls.id} context={outletContext} />
    </div>
  );
}

export default ClassWorkspaceLayout;
