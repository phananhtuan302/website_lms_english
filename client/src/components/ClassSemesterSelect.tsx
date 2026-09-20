import { useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AcademicPeriodDTO, ClassDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';

interface ClassSemesterSelectProps {
  cls: ClassDTO;
  /** `null` while the semester list is still loading. */
  periods: AcademicPeriodDTO[] | null;
  /** Already-translated load failure, or null. */
  periodsError: string | null;
  onChanged: (updated: ClassDTO) => void;
}

/**
 * The class's current-semester dropdown (T-102) — used by the workspace header, the "no
 * semester yet" banner and the Cài đặt tab, so all three behave identically. Picking a
 * different semester asks `window.confirm` (naming the target semester — same convention as
 * every other consequential action in this codebase) and only then calls T-099's
 * `PATCH /api/teacher/classes/:classId/current-period`, because the switch immediately
 * changes what this class's students see. The `<select>` is controlled, so cancelling the
 * confirm leaves it on the current semester.
 *
 * The semester list is owned by the layout (loaded once) and passed in — this component
 * never fetches it, it only writes.
 */
function ClassSemesterSelect({ cls, periods, periodsError, onChanged }: ClassSemesterSelectProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const periodId = event.target.value;
    if (!periodId || periodId === cls.currentPeriodId) return;
    const target = periods?.find((period) => period.id === periodId);
    const confirmed = window.confirm(
      t(
        cls.currentPeriodId
          ? 'classWorkspace.confirmSwitchPeriod'
          : 'classWorkspace.confirmSetPeriod',
        { periodName: target?.name ?? periodId },
      ),
    );
    if (!confirmed) return;

    setSaving(true);
    setSaveError(null);
    try {
      onChanged(await teacherApi.updateClassCurrentPeriod(cls.id, { periodId }));
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t('classWorkspace.switchPeriodFailed'));
    } finally {
      setSaving(false);
    }
  }

  const noPeriods = periods !== null && periods.length === 0;

  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-base-black/60">
        {t('classWorkspace.semesterLabel')}
        <select
          value={cls.currentPeriodId ?? ''}
          onChange={handleChange}
          disabled={periods === null || noPeriods || saving}
          className="w-56 rounded-md border border-primary-200 bg-base-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {periods === null && <option value="">{t('classWorkspace.semesterLoading')}</option>}
          {periods !== null && !cls.currentPeriodId && (
            <option value="">{t('classWorkspace.semesterPlaceholder')}</option>
          )}
          {periods?.map((period) => (
            <option key={period.id} value={period.id}>
              {period.name}
            </option>
          ))}
        </select>
      </label>
      {saving && (
        <p role="status" className="text-xs text-base-black/60">
          {t('classWorkspace.switchingPeriod')}
        </p>
      )}
      {noPeriods && !periodsError && (
        <p className="text-xs text-base-black/60">
          {t('classWorkspace.noPeriods')}{' '}
          <Link to="/teacher/curriculum" className="font-medium text-primary-600 hover:underline">
            {t('classWorkspace.noPeriodsLink')}
          </Link>
        </p>
      )}
      {(periodsError || saveError) && (
        <p role="alert" className="text-xs text-red-700">
          {saveError ?? periodsError}
        </p>
      )}
    </div>
  );
}

export default ClassSemesterSelect;
