import { useState, type ChangeEvent } from 'react';
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
 * Modern Compact ClassSemesterSelect
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
    <div className="relative inline-flex flex-col">
      <select
        value={cls.currentPeriodId ?? ''}
        onChange={handleChange}
        disabled={periods === null || noPeriods || saving}
        aria-label={t('classWorkspace.semesterLabel')}
        className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 shadow-xs focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="" disabled>
          {t('classWorkspace.noSemesterSelected')}
        </option>
        {periods?.map((period) => (
          <option key={period.id} value={period.id}>
            {period.name}
          </option>
        ))}
      </select>
      {saveError && (
        <span role="alert" className="absolute top-10 right-0 z-20 whitespace-nowrap rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 shadow">
          {saveError}
        </span>
      )}
      {periodsError && (
        <span role="alert" className="absolute top-10 right-0 z-20 whitespace-nowrap rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 shadow">
          {periodsError}
        </span>
      )}
    </div>
  );
}

export default ClassSemesterSelect;
