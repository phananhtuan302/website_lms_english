import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SiteLanguage, ThemeId } from '@platform/shared';
import { adminApi } from '../lib/adminApi';
import { ApiError } from '../lib/apiClient';
import { applyTheme, THEME_DEFINITIONS } from '../lib/themePalettes';

/**
 * Admin-only site-wide Settings page (T-072b: language; extended 2026-09 with color
 * theme), reachable at `/admin/settings`. This is THE ONLY place in the entire product
 * that can change either setting — there is no public/per-user switcher anywhere else
 * (PROJECT_PLAN Guiding Principle 3 / Assumption A13, extended the same way to theme).
 * Both sections show the CURRENT value (fetched via the existing public
 * `GET /api/settings` — the same call every page load already makes, T-067) and controls
 * to switch it, writing through the shared admin-only `PATCH /api/admin/settings`
 * (T-072b) — each field can be sent independently.
 *
 * Documented behavior: flipping the language here does NOT retroactively change this
 * admin's own already-loaded UI language — `i18next` is initialized once at app boot
 * from the settings snapshot the server returned at that time (see `main.tsx`), and this
 * app deliberately has no live-reload/hot-switch mechanism for it (there is no per-user
 * preference to react to). The color THEME is the one exception: saving a new theme also
 * calls `applyTheme()` immediately, right here, so this admin sees an instant preview of
 * their own change without a reload — every OTHER visitor still only picks it up on
 * their next page load, exactly like language.
 */
function AdminSettingsPage() {
  const { t } = useTranslation();

  const [language, setLanguage] = useState<SiteLanguage | null>(null);
  const [themeId, setThemeId] = useState<ThemeId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState<SiteLanguage | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const [themeSaving, setThemeSaving] = useState<ThemeId | null>(null);
  const [themeError, setThemeError] = useState<string | null>(null);
  const [themeSavedMessage, setThemeSavedMessage] = useState<string | null>(null);

  function load() {
    adminApi
      .getSettings()
      .then((settings) => {
        setLanguage(settings.language);
        setThemeId(settings.themeId);
      })
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

  async function handleThemeSwitch(next: ThemeId) {
    if (next === themeId || themeSaving !== null) return;
    setThemeSaving(next);
    setThemeError(null);
    setThemeSavedMessage(null);
    try {
      const settings = await adminApi.updateSettings({ themeId: next });
      setThemeId(settings.themeId);
      applyTheme(settings.themeId);
      setThemeSavedMessage(t('adminSettings.theme.saved', { theme: t(`adminSettings.themeNames.${settings.themeId}`) }));
    } catch (err) {
      setThemeError(err instanceof ApiError ? err.message : t('adminSettings.theme.errors.saveFailed'));
    } finally {
      setThemeSaving(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <h1 className="text-2xl font-bold text-primary-700">{t('adminSettings.pageHeading')}</h1>

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* --- Language --- */}
      <section>
        <h2 className="text-lg font-bold text-base-black">{t('adminSettings.heading')}</h2>
        <p className="mt-1 text-sm text-base-black/60">{t('adminSettings.subtitle')}</p>

        {language === null && !error ? (
          <p className="mt-4 text-sm text-base-black/60">{t('common.loading')}</p>
        ) : (
          language !== null && (
            <div className="mt-4 rounded-xl border border-primary-200 bg-primary-50 p-6">
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
      </section>

      {/* --- Color theme --- */}
      <section>
        <h2 className="text-lg font-bold text-base-black">{t('adminSettings.theme.heading')}</h2>
        <p className="mt-1 text-sm text-base-black/60">{t('adminSettings.theme.subtitle')}</p>

        {themeId === null && !error ? (
          <p className="mt-4 text-sm text-base-black/60">{t('common.loading')}</p>
        ) : (
          themeId !== null && (
            <div className="mt-4 rounded-xl border border-primary-200 bg-primary-50 p-6">
              <p className="text-sm font-medium text-base-black">
                {t('adminSettings.theme.currentTheme', { theme: t(`adminSettings.themeNames.${themeId}`) })}
              </p>

              {themeError && (
                <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {themeError}
                </p>
              )}

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {THEME_DEFINITIONS.map((theme) => {
                  const isActive = theme.id === themeId;
                  const isSaving = themeSaving === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => handleThemeSwitch(theme.id)}
                      disabled={themeSaving !== null || isActive}
                      aria-pressed={isActive}
                      className={`flex flex-col items-start gap-2 rounded-xl border-2 bg-base-white p-3 text-left transition-colors disabled:cursor-not-allowed ${
                        isActive
                          ? 'border-primary-500 shadow-card'
                          : 'border-transparent shadow-card hover:border-primary-200'
                      }`}
                    >
                      <span className="flex h-9 w-full overflow-hidden rounded-md" aria-hidden="true">
                        {(['300', '500', '700', '900'] as const).map((shade) => (
                          <span
                            key={shade}
                            className="flex-1"
                            style={{ backgroundColor: `rgb(${theme.scale[shade]})` }}
                          />
                        ))}
                      </span>
                      <span className="text-sm font-semibold text-base-black">
                        {t(`adminSettings.themeNames.${theme.id}`)}
                      </span>
                      {isActive && (
                        <span className="text-xs font-medium uppercase tracking-wide text-primary-600">
                          {t('adminSettings.theme.currentBadge')}
                        </span>
                      )}
                      {isSaving && (
                        <span className="text-xs font-medium text-base-black/60">{t('adminSettings.theme.switching')}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {themeSavedMessage && <p className="mt-4 text-sm font-medium text-primary-700">{themeSavedMessage}</p>}
            </div>
          )
        )}
      </section>
    </div>
  );
}

export default AdminSettingsPage;
