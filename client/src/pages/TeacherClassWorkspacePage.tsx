import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AcademicPeriodDTO, ClassDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';

interface WorkspaceLink {
  to: string;
  labelKey: string;
  descriptionKey: string;
}

/**
 * T-095 — per-class workspace hub, the destination of `TeacherClassesPage`'s new
 * clickable class names: "pick a class, then go into a management page FOR that class"
 * (the Google Classroom pattern T-094's own dashboard split was explicitly building
 * toward). Reuses `teacherApi.listClasses()` (same call `TeacherClassesPage` already
 * makes) and finds the class matching the `:classId` route param client-side — no new
 * endpoint needed for just a name lookup.
 *
 * Every quick-link card below hands off to an ALREADY-EXISTING page via the `?classId=`
 * hand-off pattern (T-088), so the teacher lands already LOCKED to this class (T-097)
 * instead of having to re-pick it there. `/teacher/unit-tests` and
 * `/teacher/vocabulary-checks` are wired the same way (T-097).
 *
 * T-100: `/teacher/content` USED TO be left as a plain, unscoped link (T-095's original
 * reasoning: My Content was an inherently global, multi-class assignment view). Now that
 * a class can only be on ONE current semester at a time (T-099), My Content itself was
 * redesigned around exactly one (class, period) pair — so this card now carries BOTH
 * `classId` and this class's own CURRENT `periodId`, same `?classId=` hand-off pattern as
 * every other card here. When this class has no current period selected yet (should only
 * happen for a brand-new class before its first "switch semester" action, see `Class`
 * schema doc comment), the link carries `classId` alone — `TeacherContentPage` detects the
 * missing `periodId` and shows a clear prompt instead of guessing or crashing.
 *
 * A `:classId` that doesn't match any of the teacher's own classes (typo'd URL, another
 * teacher's class id, a stale bookmark, etc.) shows a plain "not found" message instead of
 * crashing — the same "don't crash on a bad param" convention used throughout this
 * codebase (e.g. student-facing detail pages keyed off a route param).
 */
function TeacherClassWorkspacePage() {
  const { classId } = useParams<{ classId: string }>();
  const { t } = useTranslation();
  const [classes, setClasses] = useState<ClassDTO[] | null>(null);

  useEffect(() => {
    teacherApi
      .listClasses()
      .then(setClasses)
      .catch(() => setClasses([]));
  }, []);

  const cls = classes?.find((c) => c.id === classId) ?? null;
  const notFound = classes !== null && cls === null;
  const encodedClassId = encodeURIComponent(classId ?? '');

  const myContentQuery = cls?.currentPeriodId
    ? `?classId=${encodedClassId}&periodId=${encodeURIComponent(cls.currentPeriodId)}`
    : `?classId=${encodedClassId}`;

  const links: WorkspaceLink[] = [
    {
      to: `/teacher/content${myContentQuery}`,
      labelKey: 'teacherClassWorkspace.myContent',
      descriptionKey: 'teacherClassWorkspace.myContentDescription',
    },
    {
      to: `/teacher/reports?classId=${encodedClassId}`,
      labelKey: 'teacherClassWorkspace.reports',
      descriptionKey: 'teacherClassWorkspace.reportsDescription',
    },
    {
      to: `/vocab-leaderboard?classId=${encodedClassId}`,
      labelKey: 'teacherClassWorkspace.vocabLeaderboard',
      descriptionKey: 'teacherClassWorkspace.vocabLeaderboardDescription',
    },
    {
      to: `/teacher/unit-tests?classId=${encodedClassId}`,
      labelKey: 'teacherClassWorkspace.unitTests',
      descriptionKey: 'teacherClassWorkspace.unitTestsDescription',
    },
    {
      to: `/teacher/vocabulary-checks?classId=${encodedClassId}`,
      labelKey: 'teacherClassWorkspace.vocabularyChecks',
      descriptionKey: 'teacherClassWorkspace.vocabularyChecksDescription',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/teacher/classes" className="text-sm text-primary-600 hover:underline">
          {t('teacherClassWorkspace.backToClasses')}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-primary-700">
          {cls
            ? cls.currentPeriodName
              ? t('teacherClassWorkspace.headingWithPeriod', {
                  className: cls.name,
                  periodName: cls.currentPeriodName,
                })
              : t('teacherClassWorkspace.heading', { className: cls.name })
            : notFound
              ? t('teacherClassWorkspace.notFoundHeading')
              : t('common.loading')}
        </h1>
        {cls && <p className="mt-1 text-sm text-base-black/60">{t('teacherClassWorkspace.description')}</p>}
        {notFound && <p className="mt-1 text-sm text-base-black/60">{t('teacherClassWorkspace.notFoundMessage')}</p>}
      </div>

      {cls && (
        <>
          <SwitchPeriodControl cls={cls} onSwitched={(updated) => setClasses((prev) => prev?.map((c) => (c.id === updated.id ? updated : c)) ?? prev)} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {links.map((link) => (
              <Link
                key={link.labelKey}
                to={link.to}
                className="flex flex-col gap-1 rounded-xl border border-primary-200 p-4 transition-colors hover:border-primary-400 hover:bg-primary-50"
              >
                <span className="text-base font-semibold text-primary-700">{t(link.labelKey)}</span>
                <span className="text-sm text-base-black/60">{t(link.descriptionKey)}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * T-100: "Chuyển học kỳ" (switch semester) control — lets the teacher pick a different
 * `AcademicPeriod` as this class's new `currentPeriodId`, via T-099's
 * `PATCH /api/teacher/classes/:classId/current-period`. Switching immediately changes
 * what this class's students see everywhere content/reports are scoped by period, so this
 * gates the actual write behind a `window.confirm` — same convention as every other
 * consequential action in this codebase (`AdminUsersPage.handleDelete`,
 * `TeacherTestsPage.handleDelete`), rather than a bespoke modal.
 *
 * Fetches the full (global, not per-teacher) `AcademicPeriod` list fresh on mount — same
 * "no caching layer of its own" convention as `TestClassSchedulePanel` — so it always
 * offers every period that exists right now, including one created moments ago from
 * Curriculum management in another tab.
 */
function SwitchPeriodControl({ cls, onSwitched }: { cls: ClassDTO; onSwitched: (updated: ClassDTO) => void }) {
  const { t } = useTranslation();
  const [periods, setPeriods] = useState<AcademicPeriodDTO[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    teacherApi
      .listAcademicPeriods()
      .then((list) => {
        setPeriods(list);
        setLoadError(null);
      })
      .catch((err) => {
        setPeriods([]);
        setLoadError(err instanceof ApiError ? err.message : t('teacherClassWorkspace.loadPeriodsFailed'));
      });
  }, [t]);

  async function handleSwitch() {
    if (!selectedPeriodId || selectedPeriodId === cls.currentPeriodId) return;
    const targetPeriod = periods?.find((p) => p.id === selectedPeriodId);
    const confirmed = window.confirm(
      t('teacherClassWorkspace.confirmSwitchPeriod', { periodName: targetPeriod?.name ?? selectedPeriodId }),
    );
    if (!confirmed) return;

    setSaving(true);
    setSaveError(null);
    try {
      const updated = await teacherApi.updateClassCurrentPeriod(cls.id, { periodId: selectedPeriodId });
      onSwitched(updated);
      setSelectedPeriodId('');
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t('teacherClassWorkspace.switchPeriodFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-primary-200 p-4">
      <h2 className="text-lg font-semibold text-primary-700">{t('teacherClassWorkspace.switchPeriodHeading')}</h2>
      <p className="mt-1 text-sm text-base-black/60">{t('teacherClassWorkspace.switchPeriodDescription')}</p>

      {loadError && <p className="mt-3 text-sm text-red-700">{loadError}</p>}
      {!loadError && periods === null && <p className="mt-3 text-sm text-base-black/60">{t('common.loading')}</p>}
      {!loadError && periods?.length === 0 && (
        <p className="mt-3 text-sm text-base-black/60">{t('teacherClassWorkspace.noPeriods')}</p>
      )}

      {periods && periods.length > 0 && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            {t('teacherClassWorkspace.switchPeriodSelectLabel')}
            <select
              value={selectedPeriodId}
              onChange={(event) => setSelectedPeriodId(event.target.value)}
              className="w-64 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            >
              <option value="">{t('classFilter.selectPlaceholder')}</option>
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                  {period.id === cls.currentPeriodId ? t('teacherClassWorkspace.switchPeriodCurrentSuffix') : ''}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={handleSwitch}
            disabled={!selectedPeriodId || selectedPeriodId === cls.currentPeriodId || saving}
            className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? t('teacherClassWorkspace.switchingPeriod') : t('teacherClassWorkspace.switchPeriodButton')}
          </button>
        </div>
      )}
      {saveError && <p className="mt-2 text-sm text-red-700">{saveError}</p>}
    </section>
  );
}

export default TeacherClassWorkspacePage;
