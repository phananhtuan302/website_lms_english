import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminUserDTO, UserRole } from '@platform/shared';
import { adminApi } from '../lib/adminApi';
import { ApiError } from '../lib/apiClient';
import { useAuth } from '../context/useAuth';

const ROLES: UserRole[] = ['teacher', 'student', 'admin'];
const MIN_PASSWORD_LENGTH = 8;

/**
 * Admin-only user management (T-070): list every user with search/filter by role,
 * create a user of ANY role (the one place besides the seed script that can create a
 * `teacher` or `admin` account), edit name/email/role inline, reset a password directly,
 * and delete a user (cascading exactly per the existing schema relations — no custom
 * cleanup UI here, the server just calls `prisma.user.delete`).
 */
function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const { t } = useTranslation();
  const [users, setUsers] = useState<AdminUserDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('student');
  const [isCreating, setIsCreating] = useState(false);

  function loadUsers() {
    adminApi
      .listUsers({ role: roleFilter || undefined, search: search || undefined })
      .then(setUsers)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('adminUsers.errors.loadFailed')));
  }

  useEffect(loadUsers, [roleFilter, search]);

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    setSearch(searchInput.trim());
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsCreating(true);
    try {
      await adminApi.createUser({ name: newName.trim(), email: newEmail.trim(), password: newPassword, role: newRole });
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('student');
      loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('adminUsers.errors.createFailed'));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleUpdate(userId: string, body: { name: string; email: string; role: UserRole }) {
    try {
      await adminApi.updateUser(userId, body);
      setError(null);
      loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('adminUsers.errors.saveFailed'));
    }
  }

  async function handleResetPassword(userId: string, password: string) {
    try {
      await adminApi.resetPassword(userId, { password });
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('adminUsers.errors.resetPasswordFailed'));
      throw err;
    }
  }

  async function handleDelete(userId: string) {
    if (!window.confirm(t('adminUsers.confirmDelete'))) {
      return;
    }
    try {
      await adminApi.deleteUser(userId);
      loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('adminUsers.errors.deleteFailed'));
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary-700">{t('adminUsers.heading')}</h1>
      <p className="mt-1 text-sm text-base-black/60">{t('adminUsers.subtitle')}</p>

      <section className="mt-6 rounded-xl border border-primary-200 p-4">
        <h2 className="text-lg font-bold text-base-black">{t('adminUsers.createHeading')}</h2>
        <form onSubmit={handleCreate} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            {t('adminUsers.form.name')}
            <input
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              className="w-48 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            {t('adminUsers.form.email')}
            <input
              type="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              className="w-56 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            {t('adminUsers.form.password')}
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder={t('adminUsers.form.passwordPlaceholder', { count: MIN_PASSWORD_LENGTH })}
              className="w-40 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            {t('adminUsers.form.role')}
            <select
              value={newRole}
              onChange={(event) => setNewRole(event.target.value as UserRole)}
              className="rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(`roles.${role}`)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={isCreating || !newName.trim() || !newEmail.trim() || newPassword.length < MIN_PASSWORD_LENGTH}
            className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCreating ? t('adminUsers.form.submitting') : t('adminUsers.form.submit')}
          </button>
        </form>
      </section>

      <section className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          {t('adminUsers.filter.roleLabel')}
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as UserRole | '')}
            className="rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          >
            <option value="">{t('adminUsers.filter.allRoles')}</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {t(`roles.${role}`)}
              </option>
            ))}
          </select>
        </label>
        <form onSubmit={handleSearchSubmit} className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            {t('adminUsers.filter.searchLabel')}
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="w-56 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </label>
          <button
            type="submit"
            className="rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
          >
            {t('adminUsers.filter.searchSubmit')}
          </button>
        </form>
      </section>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <ul className="mt-6 flex flex-col gap-2">
        {users === null && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}
        {users?.length === 0 && <p className="text-sm text-base-black/60">{t('adminUsers.noResults')}</p>}
        {users?.map((user) => (
          <UserRow
            key={user.id}
            user={user}
            isSelf={user.id === currentUser?.id}
            onSave={handleUpdate}
            onResetPassword={handleResetPassword}
            onDelete={() => handleDelete(user.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function UserRow({
  user,
  isSelf,
  onSave,
  onResetPassword,
  onDelete,
}: {
  user: AdminUserDTO;
  isSelf: boolean;
  onSave: (userId: string, body: { name: string; email: string; role: UserRole }) => void;
  onResetPassword: (userId: string, password: string) => Promise<void>;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<UserRole>(user.role);
  const [isResetting, setIsResetting] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  function maybeSave(nextRole?: UserRole) {
    const effectiveRole = nextRole ?? role;
    if (
      name.trim() &&
      email.trim() &&
      (name !== user.name || email !== user.email || effectiveRole !== user.role)
    ) {
      onSave(user.id, { name: name.trim(), email: email.trim(), role: effectiveRole });
    }
  }

  async function handleConfirmReset() {
    if (newPassword.length < MIN_PASSWORD_LENGTH) return;
    await onResetPassword(user.id, newPassword);
    setNewPassword('');
    setIsResetting(false);
    setResetMessage(t('adminUsers.passwordResetSuccess'));
    setTimeout(() => setResetMessage(null), 3000);
  }

  return (
    <li className="flex flex-col gap-2 rounded-md border border-primary-100 px-3 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => maybeSave()}
          className="w-40 rounded-md border border-primary-200 px-2 py-1 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onBlur={() => maybeSave()}
          className="w-56 rounded-md border border-primary-200 px-2 py-1 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
        <select
          value={role}
          onChange={(event) => {
            const nextRole = event.target.value as UserRole;
            setRole(nextRole);
            maybeSave(nextRole);
          }}
          className="rounded-md border border-primary-200 px-2 py-1 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`roles.${r}`)}
            </option>
          ))}
        </select>
        <span className="text-xs text-base-black/50">
          {t('adminUsers.joinedOn', { date: new Date(user.createdAt).toLocaleDateString() })}
        </span>
        {isSelf && <span className="text-xs font-medium text-primary-600">{t('adminUsers.you')}</span>}

        <button
          type="button"
          onClick={() => setIsResetting((prev) => !prev)}
          className="ml-auto rounded px-2 py-1 text-xs font-medium text-primary-700 hover:bg-primary-50"
        >
          {t('adminUsers.resetPasswordButton')}
        </button>
        {!isSelf && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            {t('adminUsers.delete')}
          </button>
        )}
      </div>

      {isResetting && (
        <div className="flex flex-wrap items-center gap-2 border-t border-primary-100 pt-2">
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder={t('adminUsers.resetPasswordPlaceholder', { count: MIN_PASSWORD_LENGTH })}
            className="w-64 rounded-md border border-primary-200 px-2 py-1 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
          <button
            type="button"
            onClick={handleConfirmReset}
            disabled={newPassword.length < MIN_PASSWORD_LENGTH}
            className="rounded-md bg-primary-500 px-3 py-1 text-xs font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('adminUsers.confirmResetButton')}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsResetting(false);
              setNewPassword('');
            }}
            className="rounded px-2 py-1 text-xs font-medium text-base-black/60 hover:bg-primary-50"
          >
            {t('adminUsers.cancel')}
          </button>
        </div>
      )}
      {resetMessage && <p className="text-xs font-medium text-primary-600">{resetMessage}</p>}
    </li>
  );
}

export default AdminUsersPage;
