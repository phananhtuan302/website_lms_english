import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ClassDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';

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
 * instead of having to re-pick it there. `/teacher/content` is the one deliberate
 * exception, left as a plain link (no `?classId=`): T-075's page is an inherently global,
 * multi-class assignment view, not a single-class-scoped one — forcing it into
 * class-scoping would remove that core capability, not just reorganize navigation.
 * `/teacher/unit-tests` and `/teacher/vocabulary-checks` USED to be left plain too (no
 * single-class concept of their own, per T-095's original reasoning) but T-097 added
 * exactly that: the former now filters its list to this class's assigned tests, the
 * latter now defaults its student picker to this class's roster — so both are wired with
 * `?classId=` here like every other card. This page adds no business logic of its own —
 * purely a navigation layer, per the task's scope discipline.
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

  const links: WorkspaceLink[] = [
    {
      to: '/teacher/content',
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
            ? t('teacherClassWorkspace.heading', { className: cls.name })
            : notFound
              ? t('teacherClassWorkspace.notFoundHeading')
              : t('common.loading')}
        </h1>
        {cls && <p className="mt-1 text-sm text-base-black/60">{t('teacherClassWorkspace.description')}</p>}
        {notFound && <p className="mt-1 text-sm text-base-black/60">{t('teacherClassWorkspace.notFoundMessage')}</p>}
      </div>

      {cls && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="flex flex-col gap-1 rounded-xl border border-primary-200 p-4 transition-colors hover:border-primary-400 hover:bg-primary-50"
            >
              <span className="text-base font-semibold text-primary-700">{t(link.labelKey)}</span>
              <span className="text-sm text-base-black/60">{t(link.descriptionKey)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default TeacherClassWorkspacePage;
