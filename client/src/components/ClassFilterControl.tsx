import { useTranslation } from 'react-i18next';
import type { ClassDTO } from '@platform/shared';

interface ClassFilterControlProps {
  classes: ClassDTO[] | null;
  classId: string;
  onChange: (classId: string) => void;
}

/**
 * Class selector for teacher-facing leaderboard/report pages (T-077, Phase 12) — paired
 * with the `useTeacherClasses` hook, which supplies `classes`/`classId`. Renders:
 *
 * - nothing while classes are still loading (`classes === null`)
 * - a "no classes yet" message when the teacher owns zero classes (nothing to view)
 * - nothing when the teacher owns exactly one class — `useTeacherClasses` already
 *   auto-selected it into `classId`, so a picker with a single, unchangeable option would
 *   just be clutter (T-077's documented ambiguity resolution)
 * - a `<select>` dropdown when the teacher owns 2+ classes, starting on an empty
 *   placeholder option so the caller's data-fetch effect (gated on `classId !== ''`) never
 *   silently shows one arbitrarily-picked class's numbers before the teacher has chosen
 */
function ClassFilterControl({ classes, classId, onChange }: ClassFilterControlProps) {
  const { t } = useTranslation();

  if (classes === null || classes.length <= 1) return null;

  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
      {t('classFilter.label')}
      <select
        value={classId}
        onChange={(event) => onChange(event.target.value)}
        className="w-56 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
      >
        <option value="">{t('classFilter.selectPlaceholder')}</option>
        {classes.map((cls) => (
          <option key={cls.id} value={cls.id}>
            {cls.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Shown by a caller alongside/instead of `ClassFilterControl` when `classes` has loaded
 * as an empty array — factored out here (rather than inlined per page) so every
 * class-scoped page shows the identical "create a class first" message. */
export function ClassFilterEmptyState({ classes }: { classes: ClassDTO[] | null }) {
  const { t } = useTranslation();
  if (classes === null || classes.length > 0) return null;
  return <p className="text-sm text-red-700">{t('classFilter.noClasses')}</p>;
}

export default ClassFilterControl;
