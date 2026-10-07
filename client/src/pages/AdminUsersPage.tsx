import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminUserDTO, UserRole } from '@platform/shared';
import { adminApi } from '../lib/adminApi';
import { ApiError } from '../lib/apiClient';
import { useAuth } from '../context/useAuth';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
  SectionHeading,
  Table,
  UsersIcon,
} from '../components/ui';

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

  // `t` is stable in practice (i18next only changes it on a real language change, which
  // never happens mid-session — this app's language is an admin-controlled site-wide
  // setting resolved once at startup, see PROJECT_PLAN Guiding Principle 3/Assumption A13).
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <PageHeader
        title={t('adminUsers.heading')}
        subtitle={t('adminUsers.subtitle')}
        icon={<UsersIcon className="h-5 w-5" />}
      />

      <Card variant="glass" padding="sm">
        <SectionHeading>{t('adminUsers.createHeading')}</SectionHeading>
        <form onSubmit={handleCreate} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            {t('adminUsers.form.name')}
            <Input type="text" value={newName} onChange={(event) => setNewName(event.target.value)} className="w-48" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            {t('adminUsers.form.email')}
            <Input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} className="w-56" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            {t('adminUsers.form.password')}
            <Input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder={t('adminUsers.form.passwordPlaceholder', { count: MIN_PASSWORD_LENGTH })}
              className="w-40"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            {t('adminUsers.form.role')}
            <Select value={newRole} onChange={(event) => setNewRole(event.target.value as UserRole)}>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(`roles.${role}`)}
                </option>
              ))}
            </Select>
          </label>
          <Button
            type="submit"
            disabled={isCreating || !newName.trim() || !newEmail.trim() || newPassword.length < MIN_PASSWORD_LENGTH}
          >
            {isCreating ? t('adminUsers.form.submitting') : t('adminUsers.form.submit')}
          </Button>
        </form>
      </Card>

      <section className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          {t('adminUsers.filter.roleLabel')}
          <Select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as UserRole | '')}>
            <option value="">{t('adminUsers.filter.allRoles')}</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {t(`roles.${role}`)}
              </option>
            ))}
          </Select>
        </label>
        <form onSubmit={handleSearchSubmit} className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            {t('adminUsers.filter.searchLabel')}
            <Input type="text" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="w-56" />
          </label>
          <Button type="submit" variant="outline">
            {t('adminUsers.filter.searchSubmit')}
          </Button>
        </form>
      </section>

      {error && <Alert className="mt-4">{error}</Alert>}

      <div className="mt-6">
        {users === null && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}
        {users?.length === 0 && <EmptyState title={t('adminUsers.noResults')} />}
        {users && users.length > 0 && (
          <Table>
            <Table.Head>
              <tr>
                <Table.HeaderCell>{t('adminUsers.form.name')}</Table.HeaderCell>
                <Table.HeaderCell>{t('adminUsers.form.email')}</Table.HeaderCell>
                <Table.HeaderCell>{t('adminUsers.form.role')}</Table.HeaderCell>
                <Table.HeaderCell>{t('adminUsers.columns.joined')}</Table.HeaderCell>
                <Table.HeaderCell>{t('adminUsers.columns.actions')}</Table.HeaderCell>
              </tr>
            </Table.Head>
            <tbody>
              {users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  isSelf={user.id === currentUser?.id}
                  onSave={handleUpdate}
                  onResetPassword={handleResetPassword}
                  onDelete={() => handleDelete(user.id)}
                />
              ))}
            </tbody>
          </Table>
        )}
      </div>
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
    <>
      <Table.Row>
        <Table.Cell>
          <div className="flex items-center gap-2">
            <Avatar name={user.name} src={user.avatarUrl} size="sm" className="hidden sm:inline-flex" />
            <Input
              type="text"
              size="sm"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => maybeSave()}
              className="w-36"
            />
            {isSelf && <Badge>{t('adminUsers.you')}</Badge>}
          </div>
        </Table.Cell>
        <Table.Cell>
          <Input
            type="email"
            size="sm"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={() => maybeSave()}
            className="w-52"
          />
        </Table.Cell>
        <Table.Cell>
          <Select
            size="sm"
            value={role}
            onChange={(event) => {
              const nextRole = event.target.value as UserRole;
              setRole(nextRole);
              maybeSave(nextRole);
            }}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </Select>
        </Table.Cell>
        <Table.Cell className="whitespace-nowrap text-base-black/60">
          {new Date(user.createdAt).toLocaleDateString()}
        </Table.Cell>
        <Table.Cell>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsResetting((prev) => !prev)}>
              {t('adminUsers.resetPasswordButton')}
            </Button>
            {!isSelf && (
              <Button variant="ghost" tone="danger" size="sm" onClick={onDelete}>
                {t('adminUsers.delete')}
              </Button>
            )}
          </div>
        </Table.Cell>
      </Table.Row>

      {isResetting && (
        <Table.Row>
          <Table.Cell colSpan={5} className="bg-primary-50/50">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="password"
                size="sm"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder={t('adminUsers.resetPasswordPlaceholder', { count: MIN_PASSWORD_LENGTH })}
                className="w-64"
              />
              <Button size="sm" onClick={handleConfirmReset} disabled={newPassword.length < MIN_PASSWORD_LENGTH}>
                {t('adminUsers.confirmResetButton')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsResetting(false);
                  setNewPassword('');
                }}
              >
                {t('adminUsers.cancel')}
              </Button>
            </div>
          </Table.Cell>
        </Table.Row>
      )}
      {resetMessage && (
        <Table.Row>
          <Table.Cell colSpan={5} className="py-1 text-xs font-medium text-primary-600">
            {resetMessage}
          </Table.Cell>
        </Table.Row>
      )}
    </>
  );
}

export default AdminUsersPage;
