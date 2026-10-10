import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminUserDTO, CreateUserRequest, UpdateUserRequest, UserRole } from '@platform/shared';
import { adminApi } from '../lib/adminApi';
import { ApiError } from '../lib/apiClient';
import { useAuth } from '../context/useAuth';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  CustomDatePicker,
  EmptyState,
  Input,
  PageHeader,
  Pagination,
  Select,
  Table,
  UsersIcon,
} from '../components/ui';

const MIN_PASSWORD_LENGTH = 8;
type TabRole = 'admin' | 'teacher' | 'student';

const ROLE_TABS: { id: TabRole; label: string; desc: string }[] = [
  { id: 'admin', label: 'Quản trị viên', desc: 'Tài khoản có toàn quyền quản trị và cấu hình' },
  { id: 'teacher', label: 'Giáo viên', desc: 'Quản lý học sinh, đề thi, lớp học và chấm điểm' },
  { id: 'student', label: 'Học sinh', desc: 'Tài khoản người học tham gia làm bài và luyện tập' },
];

/** Format raw numbers into (xxx) xxx - xxxx */
function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length <= 3) {
    return `(${digits}`;
  }
  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)} - ${digits.slice(6, 10)}`;
}

/** Resize file to 160x160 JPEG base64 string */
function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode failed'));
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 160;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('no context'));
        ctx.drawImage(img, sx, sy, side, side, 0, 0, 160, 160);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const { t } = useTranslation();
  const [users, setUsers] = useState<AdminUserDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Tab riêng biệt cho 3 nhóm người dùng
  const [activeTab, setActiveTab] = useState<TabRole>('admin');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // Đếm số lượng account cho từng role độc lập
  const [roleCounts, setRoleCounts] = useState<Record<TabRole, number | null>>({
    admin: null,
    teacher: null,
    student: null,
  });

  // Phân trang
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modal tạo người dùng
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createAvatarUrl, setCreateAvatarUrl] = useState<string | null>(null);
  const createFileInputRef = useRef<HTMLInputElement>(null);
  const [createForm, setCreateForm] = useState({
    firstName: '',
    lastName: '',
    birthday: '',
    sex: 'Nam',
    email: '',
    password: '',
    phoneNumber: '',
    note: '',
  });
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Modal sửa thông tin người dùng
  const [editingUser, setEditingUser] = useState<AdminUserDTO | null>(null);
  const [editAvatarUrl, setEditAvatarUrl] = useState<string | null>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    birthday: '',
    sex: 'Nam',
    email: '',
    phoneNumber: '',
    note: '',
    role: 'student' as UserRole,
  });
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Modal đặt lại mật khẩu
  const [resettingUser, setResettingUser] = useState<AdminUserDTO | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isSubmittingReset, setIsSubmittingReset] = useState(false);

  // Modal xác nhận custom
  const [confirmModal, setConfirmModal] = useState<{
    user: AdminUserDTO;
    action: 'activate' | 'deactivate';
  } | null>(null);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  // Thông báo popup toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }

  function loadUsers() {
    adminApi
      .listUsers({ role: activeTab, search: search || undefined })
      .then((data) => {
        setUsers(data);
        if (!search) {
          setRoleCounts((prev) => ({ ...prev, [activeTab]: data.length }));
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t('adminUsers.errors.loadFailed')));
  }

  function loadCounts() {
    Promise.all([
      adminApi.listUsers({ role: 'admin' }),
      adminApi.listUsers({ role: 'teacher' }),
      adminApi.listUsers({ role: 'student' }),
    ])
      .then(([admins, teachers, students]) => {
        setRoleCounts({
          admin: admins.length,
          teacher: teachers.length,
          student: students.length,
        });
      })
      .catch(() => {});
  }

  useEffect(() => {
    loadCounts();
  }, []);

  useEffect(() => {
    loadUsers();
    setCurrentPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, search]);

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    setSearch(searchInput.trim());
  }

  function handleSearchBlur() {
    if (searchInput.trim() !== search) {
      setSearch(searchInput.trim());
    }
  }

  // --- Mở Modal Sửa ---
  function openEditModal(u: AdminUserDTO) {
    setEditingUser(u);
    setEditAvatarUrl(u.avatarUrl || null);
    setEditForm({
      firstName: u.firstName || '',
      lastName: u.lastName || '',
      birthday: u.birthday || '',
      sex: u.sex || 'Nam',
      email: u.email || '',
      phoneNumber: formatPhoneNumber(u.phoneNumber || ''),
      note: u.note || '',
      role: u.role,
    });
  }

  // Xử lý upload avatar trong modal tạo
  async function handleCreateAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const dataUrl = await resizeImage(file);
        setCreateAvatarUrl(dataUrl);
      } catch (err) {
        showToast('Không thể tải ảnh này.');
      }
    }
  }

  // Xử lý upload avatar trong modal sửa
  async function handleEditAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const dataUrl = await resizeImage(file);
        setEditAvatarUrl(dataUrl);
      } catch (err) {
        showToast('Không thể tải ảnh này.');
      }
    }
  }

  // --- Xử lý Submit Tạo mới ---
  async function handleCreateSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmittingCreate(true);
    try {
      const fullName = `${createForm.lastName.trim()} ${createForm.firstName.trim()}`.trim() || createForm.email;
      const payload: CreateUserRequest = {
        name: fullName,
        email: createForm.email.trim(),
        password: createForm.password,
        role: activeTab,
        avatarUrl: createAvatarUrl,
        firstName: createForm.firstName.trim() || undefined,
        lastName: createForm.lastName.trim() || undefined,
        birthday: createForm.birthday || undefined,
        sex: createForm.sex || undefined,
        phoneNumber: createForm.phoneNumber.trim() || undefined,
        note: createForm.note.trim() || undefined,
        isActive: true,
      };

      await adminApi.createUser(payload);
      setShowCreateModal(false);
      setCreateAvatarUrl(null);
      setCreateForm({
        firstName: '',
        lastName: '',
        birthday: '',
        sex: 'Nam',
        email: '',
        password: '',
        phoneNumber: '',
        note: '',
      });
      loadUsers();
      loadCounts();
      showToast(`Đã tạo thành công tài khoản cho ${fullName}!`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('adminUsers.errors.createFailed'));
    } finally {
      setIsSubmittingCreate(false);
    }
  }

  // --- Xử lý Submit Sửa ---
  async function handleEditSubmit(event: FormEvent) {
    event.preventDefault();
    if (!editingUser) return;
    setError(null);
    setIsSubmittingEdit(true);
    try {
      const fullName = `${editForm.lastName.trim()} ${editForm.firstName.trim()}`.trim() || editForm.email;
      const payload: UpdateUserRequest = {
        name: fullName,
        email: editForm.email.trim(),
        role: editForm.role,
        avatarUrl: editAvatarUrl,
        firstName: editForm.firstName.trim() || null,
        lastName: editForm.lastName.trim() || null,
        birthday: editForm.birthday || null,
        sex: editForm.sex || null,
        phoneNumber: editForm.phoneNumber.trim() || null,
        note: editForm.note.trim() || null,
      };

      await adminApi.updateUser(editingUser.id, payload);
      setEditingUser(null);
      loadUsers();
      loadCounts();
      showToast(`Cập nhật thông tin ${fullName} thành công!`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('adminUsers.errors.saveFailed'));
    } finally {
      setIsSubmittingEdit(false);
    }
  }

  // --- Mở Modal Xác nhận Toggle Active / Deactive ---
  function openConfirmToggle(u: AdminUserDTO) {
    setConfirmModal({
      user: u,
      action: u.isActive ? 'deactivate' : 'activate',
    });
  }

  // --- Xử lý Xác nhận trong Custom Modal ---
  async function handleConfirmToggleStatus() {
    if (!confirmModal) return;
    const { user: u, action } = confirmModal;
    const nextStatus = action === 'activate';
    const actionLabel = nextStatus ? 'kích hoạt' : 'vô hiệu hóa';

    setIsTogglingStatus(true);
    try {
      await adminApi.updateUser(u.id, { isActive: nextStatus });
      setConfirmModal(null);
      loadUsers();
      showToast(`Đã ${actionLabel} tài khoản "${u.name || u.email}" thành công!`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể thay đổi trạng thái tài khoản.');
    } finally {
      setIsTogglingStatus(false);
    }
  }

  // --- Xử lý Đặt lại mật khẩu qua Modal ---
  async function handleResetPasswordSubmit(event: FormEvent) {
    event.preventDefault();
    if (!resettingUser) return;
    if (newPassword.length < MIN_PASSWORD_LENGTH) return;
    setIsSubmittingReset(true);
    try {
      await adminApi.resetPassword(resettingUser.id, { password: newPassword });
      setResettingUser(null);
      setNewPassword('');
      showToast(`Đã đặt lại mật khẩu cho tài khoản "${resettingUser.email}" thành công!`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('adminUsers.errors.resetPasswordFailed'));
    } finally {
      setIsSubmittingReset(false);
    }
  }

  const currentTabConfig = ROLE_TABS.find((tab) => tab.id === activeTab)!;

  // Tính toán phân trang
  const totalItems = users?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedUsers = useMemo(() => {
    if (!users) return [];
    const startIndex = (currentPage - 1) * pageSize;
    return users.slice(startIndex, startIndex + pageSize);
  }, [users, currentPage, pageSize]);

  return (
    <>
      <div className="flex flex-1 flex-col space-y-5">
        {/* Toast Alert */}
        {toastMessage && (
          <div className="fixed top-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-semibold text-white shadow-2xl animate-fade-in">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>{toastMessage}</span>
          </div>
        )}

      {/* Top Bar: Tabs navigation ở bên trái, Search mở rộng + Nút Thêm mới ở bên phải */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl w-fit">
          {ROLE_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const count = roleCounts[tab.id];
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setSearchInput('');
                  setSearch('');
                }}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
                }`}
              >
                <span>{tab.label}</span>
                {count !== null && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums transition-colors ${
                      isActive ? 'bg-primary-50 text-primary-700' : 'bg-slate-200/80 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Cụm công cụ bên phải: Ô tìm kiếm co giãn thông minh + Nút thêm mới */}
        <div className="flex items-center gap-3">
          {/* Search Bar co giãn khi hover/focus */}
          <form
            onSubmit={handleSearchSubmit}
            className="group relative flex items-center"
          >
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onBlur={handleSearchBlur}
              placeholder="Tìm theo họ, tên, email, SĐT..."
              className={`h-9 rounded-xl border border-slate-200 bg-white py-1.5 pl-9 text-xs text-slate-800 shadow-2xs transition-all duration-300 ease-out focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 ${
                searchInput || search
                  ? 'w-72 pr-8'
                  : 'w-9 cursor-pointer pr-3 group-hover:w-72 focus:w-72'
              }`}
            />
            {/* Kính lúp icon */}
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-primary-600 transition-colors">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            {/* Nút Xóa lọc nếu có text */}
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setSearch('');
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </form>

          {/* Nút thêm mới */}
          <button
            type="button"
            onClick={() => {
              setCreateAvatarUrl(null);
              setShowCreateModal(true);
            }}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-700 focus:outline-none"
          >
            <span>+ Thêm {currentTabConfig.label.toLowerCase()} mới</span>
          </button>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      {/* Danh sách người dùng trong Tab */}
      <div className="flex-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Danh sách {currentTabConfig.label}</h2>
              <p className="text-xs text-slate-400">{currentTabConfig.desc}</p>
            </div>
            {users && (
              <span className="text-xs font-semibold text-slate-500">
                Tổng cộng: <strong className="text-slate-800">{users.length}</strong> tài khoản
              </span>
            )}
          </div>

          <div className="mt-2">
            {users === null && (
              <div className="py-12 text-center text-xs text-slate-400">
                Đang tải dữ liệu {currentTabConfig.label.toLowerCase()}...
              </div>
            )}
            {users?.length === 0 && (
              <div className="py-12">
                <EmptyState title={`Chưa có ${currentTabConfig.label.toLowerCase()} nào`} />
              </div>
            )}
            {users && users.length > 0 && (
              <Table>
                <Table.Head>
                  <tr>
                    <Table.HeaderCell className="w-12 text-center">Avatar</Table.HeaderCell>
                    <Table.HeaderCell>Họ</Table.HeaderCell>
                    <Table.HeaderCell>Tên</Table.HeaderCell>
                    <Table.HeaderCell>Ngày sinh</Table.HeaderCell>
                    <Table.HeaderCell>Giới tính</Table.HeaderCell>
                    <Table.HeaderCell>Email</Table.HeaderCell>
                    <Table.HeaderCell>SĐT</Table.HeaderCell>
                    <Table.HeaderCell>Ngày tạo</Table.HeaderCell>
                    <Table.HeaderCell>Trạng thái</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">Hành động</Table.HeaderCell>
                  </tr>
                </Table.Head>
                <tbody>
                  {paginatedUsers.map((u) => {
                    const isSelf = u.id === currentUser?.id;
                    return (
                      <Table.Row key={u.id} className={!u.isActive ? 'bg-slate-50/70 opacity-75' : ''}>
                        {/* Avatar cột riêng */}
                        <Table.Cell className="text-center">
                          <Avatar name={u.name} src={u.avatarUrl} size="sm" />
                        </Table.Cell>

                        {/* Họ */}
                        <Table.Cell className="font-medium text-slate-900">
                          {u.lastName || <span className="text-slate-300 italic">—</span>}
                        </Table.Cell>

                        {/* Tên */}
                        <Table.Cell>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-900">
                              {u.firstName || u.name}
                            </span>
                            {isSelf && (
                              <Badge tone="primary" className="text-[10px]">
                                bạn
                              </Badge>
                            )}
                          </div>
                        </Table.Cell>

                        {/* Ngày sinh */}
                        <Table.Cell className="whitespace-nowrap text-xs text-slate-600 tabular-nums">
                          {u.birthday ? (
                            new Date(u.birthday).toLocaleDateString('vi-VN', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })
                          ) : (
                            <span className="text-slate-300 italic">—</span>
                          )}
                        </Table.Cell>

                        {/* Giới tính */}
                        <Table.Cell className="text-xs text-slate-600">
                          {u.sex || <span className="text-slate-300 italic">—</span>}
                        </Table.Cell>

                        {/* Email */}
                        <Table.Cell className="text-xs text-slate-600 font-mono">
                          {u.email}
                        </Table.Cell>

                        {/* SĐT hiển thị định dạng (xxx) xxx - xxxx */}
                        <Table.Cell className="text-xs text-slate-600 tabular-nums font-mono whitespace-nowrap">
                          {u.phoneNumber ? (
                            formatPhoneNumber(u.phoneNumber)
                          ) : (
                            <span className="text-slate-300 italic">—</span>
                          )}
                        </Table.Cell>

                        {/* Ngày tạo */}
                        <Table.Cell className="whitespace-nowrap text-xs text-slate-500 tabular-nums">
                          {new Date(u.createdAt).toLocaleDateString('vi-VN', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </Table.Cell>

                        {/* Trạng thái */}
                        <Table.Cell>
                          {u.isActive ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Hoạt động
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                              Đã khóa
                            </span>
                          )}
                        </Table.Cell>

                        {/* Hành động dạng icon */}
                        <Table.Cell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Nút Sửa (Edit Icon) */}
                            <button
                              type="button"
                              onClick={() => openEditModal(u)}
                              title="Chỉnh sửa thông tin"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 shadow-2xs"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>

                            {/* Nút Khóa / Mở khóa (Lock / Unlock Icon) */}
                            <button
                              type="button"
                              onClick={() => openConfirmToggle(u)}
                              title={u.isActive ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition shadow-2xs ${
                                u.isActive
                                  ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800'
                              }`}
                            >
                              {u.isActive ? (
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                              ) : (
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                                </svg>
                              )}
                            </button>

                            {/* Nút Đặt lại mật khẩu (Key Icon) */}
                            <button
                              type="button"
                              onClick={() => {
                                setResettingUser(u);
                                setNewPassword('');
                              }}
                              title="Đặt lại mật khẩu"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 shadow-2xs"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                              </svg>
                            </button>
                          </div>
                        </Table.Cell>
                      </Table.Row>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </div>

          {/* Phân trang danh sách người dùng */}
          {users && users.length > 0 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={totalItems}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setCurrentPage(1);
              }}
              pageSizeOptions={[5, 10, 20, 50, 100]}
              className="mt-4"
            />
          )}
        </div>
      </div>
    </div>

      {/* --- POPUP / MODAL: THÊM NGƯỜI DÙNG MỚI --- */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Thêm mới {currentTabConfig.label}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{currentTabConfig.desc}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-4">
              {/* Chọn Avatar */}
              <div className="flex items-center gap-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
                <Avatar
                  name={createForm.firstName || createForm.email || 'User'}
                  src={createAvatarUrl}
                  size="md"
                  className="h-14 w-14 ring-2 ring-white shadow-sm"
                />
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-slate-700">Ảnh đại diện</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => createFileInputRef.current?.click()}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 shadow-2xs"
                    >
                      Chọn ảnh
                    </button>
                    {createAvatarUrl && (
                      <button
                        type="button"
                        onClick={() => setCreateAvatarUrl(null)}
                        className="text-xs text-rose-600 hover:underline"
                      >
                        Xóa ảnh
                      </button>
                    )}
                  </div>
                  <input
                    ref={createFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleCreateAvatarChange}
                    className="hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  Họ
                  <Input
                    type="text"
                    value={createForm.lastName}
                    onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })}
                    placeholder="Nguyễn"
                    className="text-xs font-normal"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  Tên *
                  <Input
                    type="text"
                    value={createForm.firstName}
                    onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })}
                    placeholder="Văn An"
                    className="text-xs font-normal"
                    required
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  Ngày sinh
                  <CustomDatePicker
                    value={createForm.birthday}
                    onChange={(val) => setCreateForm({ ...createForm, birthday: val })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  Giới tính
                  <Select
                    value={createForm.sex}
                    onChange={(e) => setCreateForm({ ...createForm, sex: e.target.value })}
                    className="text-xs font-normal"
                  >
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                    <option value="Khác">Khác</option>
                  </Select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  Email / Tên đăng nhập *
                  <Input
                    type="text"
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    placeholder="user@example.com"
                    className="text-xs font-normal"
                    required
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  Số điện thoại
                  <Input
                    type="text"
                    value={createForm.phoneNumber}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, phoneNumber: formatPhoneNumber(e.target.value) })
                    }
                    placeholder="(091) 234 - 5678"
                    className="text-xs font-mono font-normal"
                  />
                </label>
              </div>

              <div>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  Mật khẩu ban đầu (ít nhất {MIN_PASSWORD_LENGTH} ký tự) *
                  <Input
                    type="password"
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    placeholder="Nhập mật khẩu..."
                    className="text-xs font-normal"
                    required
                  />
                </label>
              </div>

              <div>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  Ghi chú
                  <textarea
                    rows={2}
                    value={createForm.note}
                    onChange={(e) => setCreateForm({ ...createForm, note: e.target.value })}
                    placeholder="Ghi chú thêm về tài khoản..."
                    className="w-full rounded-md border border-primary-200 bg-white p-2.5 text-xs font-normal text-slate-800 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                  />
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateModal(false)}
                >
                  Hủy bỏ
                </Button>
                <Button
                  type="submit"
                  disabled={
                    isSubmittingCreate ||
                    !createForm.firstName.trim() ||
                    !createForm.email.trim() ||
                    createForm.password.length < MIN_PASSWORD_LENGTH
                  }
                >
                  {isSubmittingCreate ? 'Đang tạo...' : `Tạo ${currentTabConfig.label}`}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- POPUP / MODAL: CHỈNH SỬA THÔNG TIN NGƯỜI DÙNG --- */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Chỉnh sửa thông tin tài khoản
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{editingUser.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="mt-4 space-y-4">
              {/* Chọn Avatar */}
              <div className="flex items-center gap-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
                <Avatar
                  name={editForm.firstName || editForm.email || 'User'}
                  src={editAvatarUrl}
                  size="md"
                  className="h-14 w-14 ring-2 ring-white shadow-sm"
                />
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-slate-700">Ảnh đại diện</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => editFileInputRef.current?.click()}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 shadow-2xs"
                    >
                      Thay đổi ảnh
                    </button>
                    {editAvatarUrl && (
                      <button
                        type="button"
                        onClick={() => setEditAvatarUrl(null)}
                        className="text-xs text-rose-600 hover:underline"
                      >
                        Xóa ảnh
                      </button>
                    )}
                  </div>
                  <input
                    ref={editFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleEditAvatarChange}
                    className="hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  Họ
                  <Input
                    type="text"
                    value={editForm.lastName}
                    onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                    className="text-xs font-normal"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  Tên *
                  <Input
                    type="text"
                    value={editForm.firstName}
                    onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                    className="text-xs font-normal"
                    required
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  Ngày sinh
                  <CustomDatePicker
                    value={editForm.birthday}
                    onChange={(val) => setEditForm({ ...editForm, birthday: val })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  Giới tính
                  <Select
                    value={editForm.sex}
                    onChange={(e) => setEditForm({ ...editForm, sex: e.target.value })}
                    className="text-xs font-normal"
                  >
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                    <option value="Khác">Khác</option>
                  </Select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  Email / Tên đăng nhập *
                  <Input
                    type="text"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="text-xs font-normal"
                    required
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  Số điện thoại
                  <Input
                    type="text"
                    value={editForm.phoneNumber}
                    onChange={(e) =>
                      setEditForm({ ...editForm, phoneNumber: formatPhoneNumber(e.target.value) })
                    }
                    placeholder="(091) 234 - 5678"
                    className="text-xs font-mono font-normal"
                  />
                </label>
              </div>

              <div>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  Ghi chú
                  <textarea
                    rows={2}
                    value={editForm.note}
                    onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                    placeholder="Ghi chú thêm về tài khoản..."
                    className="w-full rounded-md border border-primary-200 bg-white p-2.5 text-xs font-normal text-slate-800 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                  />
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingUser(null)}
                >
                  Hủy bỏ
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmittingEdit || !editForm.email.trim() || !editForm.firstName.trim()}
                >
                  {isSubmittingEdit ? 'Đang lưu...' : 'Lưu thay đổi'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- POPUP / MODAL: ĐẶT LẠI MẬT KHẨU --- */}
      {resettingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Đặt lại mật khẩu</h3>
                <p className="text-xs text-slate-500 mt-0.5">{resettingUser.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setResettingUser(null)}
                className="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleResetPasswordSubmit} className="mt-4 space-y-4">
              <div>
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                  Mật khẩu mới (ít nhất {MIN_PASSWORD_LENGTH} ký tự) *
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Nhập mật khẩu mới..."
                    className="text-xs"
                    required
                    autoFocus
                  />
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setResettingUser(null)}
                >
                  Hủy bỏ
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmittingReset || newPassword.length < MIN_PASSWORD_LENGTH}
                >
                  {isSubmittingReset ? 'Đang đổi...' : 'Xác nhận đổi'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- POPUP / MODAL: CUSTOM ALERT XÁC NHẬN KHÓA / MỞ KHÓA TÀI KHOẢN --- */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 animate-scale-in">
            <div className="flex items-start gap-4">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                  confirmModal.action === 'deactivate'
                    ? 'bg-amber-100 text-amber-600'
                    : 'bg-emerald-100 text-emerald-600'
                }`}
              >
                {confirmModal.action === 'deactivate' ? (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                ) : (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                  </svg>
                )}
              </div>

              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-900">
                  {confirmModal.action === 'deactivate' ? 'Vô hiệu hóa tài khoản' : 'Kích hoạt lại tài khoản'}
                </h3>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  Bạn có chắc chắn muốn{' '}
                  <strong className={confirmModal.action === 'deactivate' ? 'text-amber-700' : 'text-emerald-700'}>
                    {confirmModal.action === 'deactivate' ? 'vô hiệu hóa (khóa)' : 'mở khóa kích hoạt'}
                  </strong>{' '}
                  tài khoản{' '}
                  <span className="font-semibold text-slate-900">
                    "{confirmModal.user.name || confirmModal.user.email}"
                  </span>
                  ?
                </p>
                {confirmModal.action === 'deactivate' && (
                  <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800 border border-amber-200/60">
                    ⚠️ Tài khoản bị khóa sẽ không thể đăng nhập vào hệ thống cho tới khi được quản trị viên mở khóa trở lại.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmToggleStatus}
                disabled={isTogglingStatus}
                className={`rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors ${
                  confirmModal.action === 'deactivate'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isTogglingStatus
                  ? 'Đang xử lý...'
                  : confirmModal.action === 'deactivate'
                    ? 'Khóa tài khoản'
                    : 'Mở khóa tài khoản'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
