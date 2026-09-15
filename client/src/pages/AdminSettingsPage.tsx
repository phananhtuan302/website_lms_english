import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SiteLanguage } from '@platform/shared';
import { adminApi } from '../lib/adminApi';
import { ApiError } from '../lib/apiClient';

/**
 * Admin-only site-wide language Settings page (T-072b), reachable at `/admin/settings`.
 * This is THE ONLY place in the entire product that can change the site language — there
 * is no public/per-user switcher anywhere else (PROJECT_PLAN Guiding Principle 3 /
 * Assumption A13). Shows the CURRENT value (fetched via the existing public
 * `GET /api/settings` — the same call every page load already makes, T-067) and two
 * buttons to switch it, writing through the new admin-only `PATCH /api/admin/settings`
 * (T-072b).
 *
 * Documented behavior: flipping the value here does NOT retroactively change this
 * admin's own already-loaded UI language — `i18next` is initialized once at app boot
 * from the settings snapshot the server returned at that time (see `main.tsx`), and this
 * app deliberately has no live-reload/hot-switch mechanism (there is no per-user
 * preference to react to). Every visitor — including this admin, on their next page
 * load — picks up the new value from `GET /api/settings` exactly the way a fresh,
 * logged-out visitor does.
 */
function AdminSettingsPage() {
  const { t } = useTranslation();
  const [language, setLanguage] = useState<SiteLanguage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<SiteLanguage | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  function load() {
    adminApi
      .getSettings()
      .then((settings) => setLanguage(settings.language))
      .catch((err) => setError(err instanceof ApiError ? err.message : t('adminSettings.errors.loadFailed')));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  async function handleSwitch(next: SiteLanguage) {
    if (next === language || saving !== null) return;
    setSaving(next);
    setError(null);
    setSavedMessage(null);
    try {
      const settings = await adminApi.updateSettings({ language: next });
      setLanguage(settings.language);
      setSavedMessage(t('adminSettings.saved', { language: t(`adminSettings.languageNames.${settings.language}`) }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('adminSettings.errors.saveFailed'));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold text-primary-700">{t('adminSettings.heading')}</h1>
      <p className="mt-1 text-sm text-base-black/60">{t('adminSettings.subtitle')}</p>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {language === null && !error ? (
        <p className="mt-4 text-sm text-base-black/60">{t('common.loading')}</p>
      ) : (
        language !== null && (
          <div className="mt-6 rounded-xl border border-primary-200 bg-primary-50 p-6">
            <p className="text-sm font-medium text-base-black">
              {t('adminSettings.currentLanguage', { language: t(`adminSettings.languageNames.${language}`) })}
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => handleSwitch('en')}
                disabled={saving !== null || language === 'en'}
                className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  language === 'en'
                    ? 'bg-primary-500 text-base-white'
                    : 'border border-primary-300 bg-base-white text-primary-700 hover:bg-primary-100'
                }`}
              >
                {saving === 'en' ? t('adminSettings.switching') : t('adminSettings.languageNames.en')}
              </button>
              <button
                type="button"
                onClick={() => handleSwitch('vi')}
                disabled={saving !== null || language === 'vi'}
                className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  language === 'vi'
                    ? 'bg-primary-500 text-base-white'
                    : 'border border-primary-300 bg-base-white text-primary-700 hover:bg-primary-100'
                }`}
              >
                {saving === 'vi' ? t('adminSettings.switching') : t('adminSettings.languageNames.vi')}
              </button>
            </div>
            <p className="mt-4 text-xs text-base-black/50">{t('adminSettings.note')}</p>
            {savedMessage && <p className="mt-3 text-sm font-medium text-primary-700">{savedMessage}</p>}
          </div>
        )
      )}
    </div>
  );
}

export default AdminSettingsPage;
