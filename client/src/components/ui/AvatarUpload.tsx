import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/useAuth';
import { cn } from '../../lib/cn';
import Avatar from './Avatar';
import { CameraIcon } from './icons';

interface AvatarUploadProps {
  size?: 'sm' | 'md';
  className?: string;
}

const TARGET_SIZE = 160;
const JPEG_QUALITY = 0.85;

/** Reads `file`, center-crops it to a square, and downsizes it to `TARGET_SIZE`px — keeps the
 * stored `data:image/...` URL to a few KB (well under the server's size cap) regardless of how
 * large the original photo was. */
function resizeToSquareJpeg(file: File): Promise<string> {
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
        canvas.width = TARGET_SIZE;
        canvas.height = TARGET_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('no 2d context'));
          return;
        }
        ctx.drawImage(img, sx, sy, side, side, 0, 0, TARGET_SIZE, TARGET_SIZE);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** The current user's own `Avatar`, clickable to upload/replace their photo (self-service only
 * — there's no way for one account to set another's). Resizes client-side (see
 * `resizeToSquareJpeg`) before calling `updateAvatar` (`AuthContext`), so every page already
 * showing this user's `Avatar` updates at once. */
function AvatarUpload({ size = 'md', className }: AvatarUploadProps) {
  const { user, updateAvatar } = useAuth();
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  async function handleFile(file: File) {
    setError(null);
    setIsSaving(true);
    try {
      const dataUrl = await resizeToSquareJpeg(file);
      await updateAvatar(dataUrl);
    } catch {
      setError(t('avatar.uploadFailed'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className={cn('relative inline-flex shrink-0', className)}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isSaving}
        aria-label={t('avatar.change')}
        title={t('avatar.change')}
        className="group relative rounded-full disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Avatar name={user.name} src={user.avatarUrl} size={size} />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/0 opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">
          <CameraIcon className="h-3.5 w-3.5 text-base-white" />
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void handleFile(file);
        }}
      />
      {error && (
        <p
          role="alert"
          className="absolute left-1/2 top-full z-20 mt-1 w-40 -translate-x-1/2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-center text-xs text-red-700 shadow-dropdown"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export default AvatarUpload;
