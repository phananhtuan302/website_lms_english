import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ClassDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';

/**
 * Teacher-only class management page (T-074, Phase 12): create/list/rename/delete a
 * teacher's own `Class` rows. Same simple CRUD-list UI pattern as
 * `TeacherCurriculumPage.tsx`'s Units section — one form to add a new row, a flat list
 * with inline edit-in-place fields and a delete button, no drag-to-reorder/pagination.
 *
 * Deleting a class with students still assigned is blocked server-side (409, see
 * `teacherClasses.routes.ts`'s doc comment) — the error message returned is shown as-is,
 * same "server messages are plain English, not translated" convention already used by
 * every other page in this codebase (e.g. `TeacherCurriculumPage`).
 *
 * T-095: this page doubles as the class-picker home of the new "pick a class first"
 * flow — each row's class name (below) is now also a `<Link>` into the new per-class
 * `TeacherClassWorkspacePage` hub, kept as a separate target from the rename input/
 * delete button (same "don't nest a click target inside another" split T-087 used for
 * `TeacherTestsPage`'s cards) so all three controls keep working independently.
 */
function TeacherClassesPage() {
  const { t } = useTranslation();
  const [classes, setClasses] = useState<ClassDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newClassName, setNewClassName] = useState('');

  function loadClasses() {
    teacherApi
      .listClasses()
      .then(setClasses)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : t('teacherClasses.loadFailed')),
      );
  }

  // `t` is stable in practice (site-wide, admin-controlled language, resolved once at
  // startup — PROJECT_PLAN Guiding Principle 3/Assumption A13), so it's safe to omit here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadClasses, []);

  async function handleCreateClass(event: FormEvent) {
    event.preventDefault();
    const name = newClassName.trim();
    if (!name) {
      setError(t('teacherClasses.validationError'));
      return;
    }
    try {
      await teacherApi.createClass({ name });
      setNewClassName('');
      setError(null);
      loadClasses();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('teacherClasses.createFailed'));
    }
  }

  async function handleRenameClass(cls: ClassDTO, name: string) {
    try {
      await teacherApi.updateClass(cls.id, { name });
      setError(null);
      loadClasses();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('teacherClasses.saveFailed'));
    }
  }

  async function handleDeleteClass(classId: string) {
    try {
      await teacherApi.deleteClass(classId);
      setError(null);
      loadClasses();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('teacherClasses.deleteFailed'));
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-primary-700">{t('teacherClasses.heading')}</h1>
        <p className="mt-1 text-sm text-base-black/60">{t('teacherClasses.description')}</p>
      </div>

      <section className="rounded-xl border border-primary-200 p-4">
        {error && (
          <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <form onSubmit={handleCreateClass} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            {t('teacherClasses.nameLabel')}
            <input
              type="text"
              value={newClassName}
              onChange={(event) => setNewClassName(event.target.value)}
              placeholder={t('teacherClasses.namePlaceholder')}
              className="w-64 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
          >
            {t('teacherClasses.addButton')}
          </button>
        </form>

        <ul className="mt-4 flex flex-col gap-2">
          {classes === null && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}
          {classes?.length === 0 && (
            <p className="text-sm text-base-black/60">{t('teacherClasses.empty')}</p>
          )}
          {classes?.map((cls) => (
            <ClassRow
              key={cls.id}
              cls={cls}
              onSave={handleRenameClass}
              onDelete={() => handleDeleteClass(cls.id)}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

function ClassRow({
  cls,
  onSave,
  onDelete,
}: {
  cls: ClassDTO;
  onSave: (cls: ClassDTO, name: string) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(cls.name);

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-md border border-primary-100 px-3 py-2">
      <Link
        to={`/teacher/classes/${cls.id}`}
        className="font-semibold text-primary-700 hover:underline"
      >
        {cls.name}
      </Link>
      <input
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => {
          if (name.trim() && name !== cls.name) {
            onSave(cls, name.trim());
          }
        }}
        className="flex-1 rounded-md border border-primary-200 px-2 py-1 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
      />
      <span className="text-xs text-base-black/50">
        {t('teacherClasses.studentCount', { count: cls.studentCount })}
      </span>
      <button
        type="button"
        onClick={onDelete}
        className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
      >
        {t('teacherClasses.deleteButton')}
      </button>
    </li>
  );
}

export default TeacherClassesPage;
