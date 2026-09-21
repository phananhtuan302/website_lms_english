import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { dateToDatetimeLocal } from '../lib/classAssignments';

const HOUR_MS = 60 * 60 * 1000;

/** The quick "Đóng sau …" picks, in milliseconds after now. */
const CHIPS: Array<{ id: string; labelKey: string; afterMs: number }> = [
  { id: 'day1', labelKey: 'assignDialog.quickClose.day1', afterMs: 24 * HOUR_MS },
  { id: 'day2', labelKey: 'assignDialog.quickClose.day2', afterMs: 48 * HOUR_MS },
  { id: 'day3', labelKey: 'assignDialog.quickClose.day3', afterMs: 72 * HOUR_MS },
  { id: 'week1', labelKey: 'assignDialog.quickClose.week1', afterMs: 7 * 24 * HOUR_MS },
];

interface DeadlineChipsProps {
  /** Current "Mở lúc" / "Đóng lúc" values, as `datetime-local` strings ('' = empty). */
  openAt: string;
  closeAt: string;
  onChange: (next: { openAt: string; closeAt: string }) => void;
}

/**
 * The shared "Chọn nhanh: Đóng sau 1 ngày / 2 ngày / 3 ngày / 1 tuần" chips of every assign
 * dialog. A chip fills "Đóng lúc" relative to now and sets "Mở lúc" to now when it is still
 * empty. The chip that was used stays highlighted only while "Đóng lúc" still holds the exact
 * value it wrote — as soon as the teacher edits the date by hand the highlight disappears.
 */
function DeadlineChips({ openAt, closeAt, onChange }: DeadlineChipsProps) {
  const { t } = useTranslation();
  const [applied, setApplied] = useState<{ id: string; closeAt: string } | null>(null);

  function apply(chip: (typeof CHIPS)[number]) {
    const now = new Date();
    const nextClose = dateToDatetimeLocal(new Date(now.getTime() + chip.afterMs));
    setApplied({ id: chip.id, closeAt: nextClose });
    onChange({ openAt: openAt === '' ? dateToDatetimeLocal(now) : openAt, closeAt: nextClose });
  }

  const activeId = applied && closeAt !== '' && closeAt === applied.closeAt ? applied.id : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-base-black/80">{t('assignDialog.quickClose.label')}</span>
      {CHIPS.map((chip) => {
        const active = activeId === chip.id;
        return (
          <button
            key={chip.id}
            type="button"
            onClick={() => apply(chip)}
            aria-pressed={active}
            className={
              'min-h-[2.5rem] rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 ' +
              (active
                ? 'border-primary-500 bg-primary-500 text-base-white'
                : 'border-primary-300 text-primary-700 hover:bg-primary-100')
            }
          >
            {t(chip.labelKey)}
          </button>
        );
      })}
    </div>
  );
}

export default DeadlineChips;
