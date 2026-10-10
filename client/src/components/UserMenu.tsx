import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/useAuth';
import { Avatar, Badge } from './ui';
import AvatarUpload from './ui/AvatarUpload';
import { ApiError } from '../lib/apiClient';

const ROLE_BADGE_TONE = { admin: 'primary', teacher: 'sky', student: 'green' } as const;

export default function UserMenu() {
  const { user, logout, updateProfile } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'password'>('info');
  const menuRef = useRef<HTMLDivElement>(null);

  // Form profile state
  const [name, setName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [sex, setSex] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const avatarTriggerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setFirstName(user.firstName || '');
      setLastName(user.lastName || '');
      setBirthday(user.birthday ? user.birthday.split('T')[0] : '');
      setSex(user.sex || '');
      setPhoneNumber(user.phoneNumber || '');
    }
  }, [user]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  if (!user) return null;

  function handleLogout() {
    setOpen(false);
    logout();
    navigate('/login', { replace: true });
  }

  function handleOpenProfileModal(e?: React.MouseEvent) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setName(user?.name || '');
    setFirstName(user?.firstName || '');
    setLastName(user?.lastName || '');
    setBirthday(user?.birthday ? user.birthday.split('T')[0] : '');
    setSex(user?.sex || '');
    setPhoneNumber(user?.phoneNumber || '');

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setProfileError(null);
    setProfileSuccess(null);
    setActiveTab('info');
    setOpen(false);
    setShowProfileModal(true);
  }

  async function handleSaveInfo(e: React.FormEvent) {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);

    const displayName = (lastName && firstName) ? `${lastName} ${firstName}`.trim() : name.trim();
    if (!displayName) {
      setProfileError('Vui lòng nhập họ và tên.');
      return;
    }

    setProfileLoading(true);
    try {
      await updateProfile({
        name: displayName,
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        birthday: birthday || null,
        sex: sex || null,
        phoneNumber: phoneNumber.trim() || null,
      });
      setName(displayName);
      setProfileSuccess('Cập nhật thông tin cá nhân thành công!');
      setTimeout(() => {
        setProfileSuccess(null);
      }, 2500);
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : 'Đã có lỗi xảy ra khi cập nhật.');
    } finally {
      setProfileLoading(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);

    if (!currentPassword) {
      setProfileError('Vui lòng nhập mật khẩu hiện tại.');
      return;
    }
    if (newPassword.length < 6) {
      setProfileError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setProfileError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setProfileLoading(true);
    try {
      await updateProfile({
        currentPassword,
        newPassword,
      });
      setProfileSuccess('Đổi mật khẩu thành công!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setProfileSuccess(null);
      }, 2500);
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : 'Đã có lỗi xảy ra khi đổi mật khẩu.');
    } finally {
      setProfileLoading(false);
    }
  }

  return (
    <>
      <div className="relative" ref={menuRef}>
        {/* Nút Avatar */}
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="group relative flex h-10 w-10 items-center justify-center rounded-full p-0.5 transition-all hover:scale-105 hover:ring-2 hover:ring-primary-500/50 focus:outline-none focus:ring-2 focus:ring-primary-500"
          aria-expanded={open}
          aria-haspopup="true"
          title={user.name}
        >
          <Avatar
            name={user.name}
            src={user.avatarUrl}
            size="md"
            className="h-9 w-9 ring-2 ring-white shadow-sm"
          />
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
        </button>

        {/* Popover thông tin chi tiết */}
        {open && (
          <div className="absolute right-0 top-full mt-3 w-64 origin-top-right rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
            {/* Hàng trên: Tiêu đề tĩnh "TÀI KHOẢN" và Quyền */}
            <div className="flex items-center justify-between px-3 pt-2.5 pb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Tài khoản
              </span>
              <Badge tone={ROLE_BADGE_TONE[user.role]}>{t(`roles.${user.role}`)}</Badge>
            </div>

            {/* KHU VỰC THÔNG TIN TÀI KHOẢN: Luôn hiển thị khung viền bo góc, tên xanh và icon bút chì */}
            <div
              role="button"
              tabIndex={0}
              onClick={handleOpenProfileModal}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleOpenProfileModal(e as unknown as React.MouseEvent);
                }
              }}
              className="group relative mx-1 my-1 cursor-pointer select-none rounded-2xl border border-blue-200/90 bg-blue-50/40 p-2.5 text-left transition-all hover:border-blue-400 hover:bg-blue-50/80 hover:shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              title="Nhấn để đổi thông tin cá nhân & mật khẩu"
            >
              <div className="flex items-center justify-between">
                <p className="truncate text-sm font-bold text-blue-600">
                  {user.name}
                </p>
                <svg
                  className="h-4 w-4 shrink-0 text-blue-600 transition-transform group-hover:scale-110 ml-1.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
              </div>
              <p className="truncate text-xs font-mono text-slate-500 mt-0.5">
                {user.email}
              </p>
            </div>

            <div className="mt-1 border-t border-slate-100 pt-1.5">
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50"
              >
                <svg className="h-4 w-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                <span>{t('header.logOut')}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Popup Cập nhật thông tin tài khoản (2 Tabs) */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl transition-all animate-in zoom-in-95 duration-150">
            {/* Header Modal */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 font-bold">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Thông tin tài khoản</h3>
                  <p className="text-xs text-slate-500">Cập nhật thông tin cá nhân và mật khẩu</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                ✕
              </button>
            </div>

            {/* 2 Tabs chuyển đổi */}
            <div className="mt-4 flex rounded-2xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('info');
                  setProfileError(null);
                  setProfileSuccess(null);
                }}
                className={`flex-1 rounded-xl py-2 text-xs font-bold transition-all ${
                  activeTab === 'info'
                    ? 'bg-white text-primary-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Thông tin cá nhân
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('password');
                  setProfileError(null);
                  setProfileSuccess(null);
                }}
                className={`flex-1 rounded-xl py-2 text-xs font-bold transition-all ${
                  activeTab === 'password'
                    ? 'bg-white text-primary-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Đổi mật khẩu
              </button>
            </div>

            {/* Thông báo Lỗi / Thành công */}
            {profileError && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                {profileError}
              </div>
            )}
            {profileSuccess && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">
                {profileSuccess}
              </div>
            )}

            {/* TAB 1: THÔNG TIN CÁ NHÂN */}
            {activeTab === 'info' && (
              <form onSubmit={handleSaveInfo} className="mt-4 space-y-4">
                {/* Phần đổi Avatar */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => avatarTriggerRef.current?.()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      avatarTriggerRef.current?.();
                    }
                  }}
                  className="group flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 transition-all hover:border-primary-300 hover:bg-primary-50/30 hover:shadow-2xs"
                  title="Nhấn để chọn ảnh mới"
                >
                  <div className="flex items-center gap-3.5">
                    <AvatarUpload size="md" triggerRef={avatarTriggerRef} />
                    <div>
                      <p className="text-xs font-bold text-slate-800 group-hover:text-primary-700 transition-colors">
                        Ảnh đại diện
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Nhấn vào thẻ để tải ảnh mới lên
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 shadow-2xs group-hover:border-primary-300 group-hover:text-primary-600 group-hover:bg-primary-50 transition-all">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>Đổi ảnh</span>
                  </div>
                </div>

                {/* Tài khoản / Email (Chỉ đọc) */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Tài khoản / Email
                  </label>
                  <input
                    type="text"
                    value={user.email}
                    disabled
                    className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2 text-sm font-semibold text-slate-500 cursor-not-allowed"
                  />
                </div>

                {/* Họ & Tên */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Họ đệm
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="VD: Nguyễn Văn"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 shadow-2xs focus:border-primary-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Tên <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="VD: An"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 shadow-2xs focus:border-primary-600 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Ngày sinh & Giới tính */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Ngày sinh
                    </label>
                    <input
                      type="date"
                      value={birthday}
                      onChange={(e) => setBirthday(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 shadow-2xs focus:border-primary-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Giới tính
                    </label>
                    <select
                      value={sex}
                      onChange={(e) => setSex(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 shadow-2xs focus:border-primary-600 focus:outline-none"
                    >
                      <option value="">-- Chọn giới tính --</option>
                      <option value="male">Nam</option>
                      <option value="female">Nữ</option>
                      <option value="other">Khác</option>
                    </select>
                  </div>
                </div>

                {/* Số điện thoại */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Số điện thoại
                  </label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="VD: 0912345678"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 shadow-2xs focus:border-primary-600 focus:outline-none"
                  />
                </div>

                {/* Nút hành động Tab Info */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowProfileModal(false)}
                    disabled={profileLoading}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={profileLoading}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-primary-700 disabled:opacity-50 transition"
                  >
                    {profileLoading && (
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    )}
                    Lưu thông tin
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: ĐỔI MẬT KHẨU */}
            {activeTab === 'password' && (
              <form onSubmit={handleChangePassword} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Mật khẩu hiện tại <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Nhập mật khẩu hiện tại"
                    required
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-2xs focus:border-primary-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Mật khẩu mới <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Tối thiểu 6 ký tự"
                    required
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-2xs focus:border-primary-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Xác nhận mật khẩu mới <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Nhập lại mật khẩu mới"
                    required
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-2xs focus:border-primary-600 focus:outline-none"
                  />
                </div>

                {/* Nút hành động Tab Password */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowProfileModal(false)}
                    disabled={profileLoading}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={profileLoading}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-primary-700 disabled:opacity-50 transition"
                  >
                    {profileLoading && (
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    )}
                    Đổi mật khẩu
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}


