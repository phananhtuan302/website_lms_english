import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ClassSemesterSelect from '../../components/ClassSemesterSelect';
import { useClassWorkspace } from '../../hooks/useClassWorkspace';
import { CLASSES_HOME_PATH } from '../../lib/classWorkspace';
import { teacherApi } from '../../lib/teacherApi';
import { ApiError } from '../../lib/apiClient';

/**
 * "Cài đặt" tab (T-102): the class's housekeeping, moved off the old class list — rename,
 * change semester (same control as the header), delete.
 *
 * Deleting a class that still has students is blocked server-side with a 409 (see
 * `teacherClasses.routes.ts`); that case is shown as a plain Vietnamese sentence rather than
 * the server's English one (the site language is admin-controlled, and the reason —
 * "still has students" — is the only 409 this endpoint returns). Any other failure shows the
 * server's own message. A successful delete returns to the class-card home.
 */
function ClassSettingsTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { cls, periods, periodsError, setClass } = useClassWorkspace();

  const [name, setName] = useState(cls.name);
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renamed, setRenamed] = useState(false);

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleRename(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    setRenamed(false);
    if (!trimmed) {
      setRenameError(t('classWorkspace.settings.nameRequired'));
      return;
    }
    setRenaming(true);
    setRenameError(null);
    try {
      const updated = await teacherApi.updateClass(cls.id, { name: trimmed });
      setClass(updated);
      setName(updated.name);
      setRenamed(true);
    } catch (err) {
      setRenameError(
        err instanceof ApiError ? err.message : t('classWorkspace.settings.renameFailed'),
      );
    } finally {
      setRenaming(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(t('classWorkspace.settings.confirmDelete', { name: cls.name }))) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await teacherApi.deleteClass(cls.id);
      navigate(CLASSES_HOME_PATH, { replace: true });
    } catch (err) {
      setDeleteError(
        err instanceof ApiError
          ? err.status === 409
            ? t('classWorkspace.settings.deleteBlocked')
            : err.message
          : t('classWorkspace.settings.deleteFailed'),
      );
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-primary-200 p-5">
        <h2 className="text-lg font-bold text-base-black">
          {t('classWorkspace.settings.renameHeading')}
        </h2>
        <form onSubmit={handleRename} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            {t('classWorkspace.settings.nameLabel')}
            <input
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setRenamed(false);
              }}
              className="w-72 max-w-full rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </label>
          <button
            type="submit"
            disabled={renaming || name.trim() === cls.name}
            className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {renaming
              ? t('classWorkspace.settings.saving')
              : t('classWorkspace.settings.saveButton')}
          </button>
          {renamed && (
            <span role="status" className="text-sm font-medium text-green-700">
              {t('classWorkspace.settings.saved')}
            </span>
          )}
        </form>
        {renameError && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {renameError}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-primary-200 p-5">
        <h2 className="text-lg font-bold text-base-black">
          {t('classWorkspace.settings.semesterHeading')}
        </h2>
        <p className="mt-1 mb-3 text-sm text-base-black/60">
          {t('classWorkspace.settings.semesterDescription')}
        </p>
        <ClassSemesterSelect
          cls={cls}
          periods={periods}
          periodsError={periodsError}
          onChanged={setClass}
        />
      </section>

      <section className="rounded-2xl border border-red-200 p-5">
        <h2 className="text-lg font-bold text-red-700">
          {t('classWorkspace.settings.deleteHeading')}
        </h2>
        <p className="mt-1 text-sm text-base-black/60">
          {t('classWorkspace.settings.deleteDescription')}
        </p>
        {cls.studentCount > 0 && (
          <p className="mt-2 text-sm font-medium text-base-black/70">
            {t('classWorkspace.settings.hasStudentsNote', { count: cls.studentCount })}
          </p>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="mt-3 rounded-md border border-red-300 bg-base-white px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {deleting
            ? t('classWorkspace.settings.deleting')
            : t('classWorkspace.settings.deleteButton')}
        </button>
        {deleteError && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {deleteError}
          </p>
        )}
      </section>
    </div>
  );
}

export default ClassSettingsTab;
