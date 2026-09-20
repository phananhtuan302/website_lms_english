import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ClassDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';
import { classTabPath } from '../lib/classWorkspace';

/** Header-band colors cycled across the cards so a grid of classes is easy to tell apart
 * at a glance (Google Classroom style). All from the `primary` theme scale, dark enough
 * for the white class name on top; listed as literal strings so Tailwind's scanner sees
 * them. */
const CARD_BANDS = ['bg-primary-500', 'bg-primary-600', 'bg-primary-700', 'bg-primary-800'];

/**
 * Teacher home = the class-card grid (T-102, Phase 13; rewrites T-074/T-095's CRUD list).
 * One card per class — class name, semester badge (amber "Chưa chọn học kỳ" when the class
 * has none yet), student count — and the whole card is a link into that class's workspace
 * (`/teacher/classes/:classId`). Rename / change semester / delete now live in the class's
 * own Cài đặt tab, not here; the only management action on this page is creating a class
 * (name only), inline.
 */
function TeacherClassesPage() {
  const { t } = useTranslation();
  const [classes, setClasses] = useState<ClassDTO[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    teacherApi
      .listClasses()
      .then(setClasses)
      .catch(() => setLoadFailed(true));
  }, []);

  function openCreateForm() {
    setCreating(true);
    setCreateError(null);
  }

  function closeCreateForm() {
    setCreating(false);
    setNewClassName('');
    setCreateError(null);
  }

  async function handleCreateClass(event: FormEvent) {
    event.preventDefault();
    const name = newClassName.trim();
    if (!name) {
      setCreateError(t('teacherHome.validationError'));
      return;
    }
    setSaving(true);
    setCreateError(null);
    try {
      const created = await teacherApi.createClass({ name });
      setClasses((prev) => [...(prev ?? []), created]);
      closeCreateForm();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : t('teacherHome.createFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-700">{t('teacherHome.heading')}</h1>
          <p className="mt-1 text-sm text-base-black/60">{t('teacherHome.description')}</p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={openCreateForm}
            className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
          >
            {t('teacherHome.createButton')}
          </button>
        )}
      </div>

      {creating && (
        <form
          onSubmit={handleCreateClass}
          className="flex flex-col gap-3 rounded-2xl border border-primary-200 bg-primary-50 p-4"
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
              {t('teacherHome.nameLabel')}
              <input
                type="text"
                value={newClassName}
                onChange={(event) => setNewClassName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') closeCreateForm();
                }}
                placeholder={t('teacherHome.namePlaceholder')}
                autoFocus
                className="w-72 max-w-full rounded-md border border-primary-200 bg-base-white px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
            </label>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? t('teacherHome.creating') : t('teacherHome.createSubmit')}
            </button>
            <button
              type="button"
              onClick={closeCreateForm}
              className="rounded-md px-4 py-2 text-sm font-medium text-base-black/70 transition-colors hover:bg-primary-100"
            >
              {t('teacherHome.cancel')}
            </button>
          </div>
          {createError && (
            <p role="alert" className="text-sm text-red-700">
              {createError}
            </p>
          )}
        </form>
      )}

      {loadFailed && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {t('teacherHome.loadFailed')}
        </p>
      )}
      {classes === null && !loadFailed && (
        <p className="text-sm text-base-black/60">{t('common.loading')}</p>
      )}

      {classes?.length === 0 && !creating && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary-200 px-6 py-14 text-center">
          <p className="text-lg font-semibold text-primary-700">{t('teacherHome.empty')}</p>
          <p className="max-w-md text-sm text-base-black/60">{t('teacherHome.emptyHint')}</p>
          <button
            type="button"
            onClick={openCreateForm}
            className="mt-1 rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
          >
            {t('teacherHome.createButton')}
          </button>
        </div>
      )}

      {classes && classes.length > 0 && (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((cls, index) => (
            <li key={cls.id} className="flex">
              <Link
                to={classTabPath(cls.id)}
                className="group flex w-full flex-col overflow-hidden rounded-2xl border border-primary-200 bg-base-white shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-primary-400 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
              >
                <div className={`${CARD_BANDS[index % CARD_BANDS.length]} px-5 py-6`}>
                  <h2 className="line-clamp-2 break-words text-xl font-bold text-base-white">
                    {cls.name}
                  </h2>
                </div>
                <div className="flex flex-1 flex-col gap-3 p-4">
                  {cls.currentPeriodName ? (
                    <span className="inline-flex self-start rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-800">
                      {cls.currentPeriodName}
                    </span>
                  ) : (
                    <span className="inline-flex self-start rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                      {t('teacherHome.noSemester')}
                    </span>
                  )}
                  <p className="mt-auto text-sm text-base-black/60">
                    {t('teacherHome.studentCount', { count: cls.studentCount })}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default TeacherClassesPage;
