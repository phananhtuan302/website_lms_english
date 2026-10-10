import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiGradingSettingsDTO, SiteLanguage, ThemeId, UiStyleId } from '@platform/shared';
import { adminApi } from '../lib/adminApi';
import { ApiError } from '../lib/apiClient';
import { applyTheme, THEME_DEFINITIONS } from '../lib/themePalettes';
import { applyUiStyle, UI_STYLE_DEFINITIONS } from '../lib/uiStyles';
import { Alert, Button, Card, Input, PageHeader, SectionHeading, SettingsIcon } from '../components/ui';

/** A small rendered preview of each UI style's signature surface treatment, for the picker
 * grid below — same "show, don't just name it" idea as the theme picker's color swatches. */
const UI_STYLE_PREVIEW: Record<UiStyleId, ReactNode> = {
  glass: (
    <div className="relative flex h-14 w-full items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-primary-300 via-primary-500 to-primary-700">
      <div className="h-8 w-20 rounded-md border border-white/60 bg-white/40 backdrop-blur-sm" />
    </div>
  ),
  brutalist: (
    <div className="flex h-14 w-full items-center justify-center rounded-lg bg-[#fdf8f0]">
      <div className="h-8 w-20 rounded border-2 border-black bg-primary-400 shadow-[3px_3px_0_0_#000]" />
    </div>
  ),
  vivid: (
    <div className="flex h-14 w-full items-center justify-center rounded-lg bg-slate-50">
      <div className="h-8 w-20 rounded-xl bg-gradient-to-br from-primary-400 to-primary-700 shadow-md" />
    </div>
  ),
  dark: (
    <div className="flex h-14 w-full items-center justify-center rounded-lg bg-[#0a0a12]">
      <div
        className="h-8 w-20 rounded-md border border-primary-500/40 bg-[#15151f]"
        style={{ boxShadow: '0 0 12px 1px rgb(var(--color-primary-500) / 0.45)' }}
      />
    </div>
  ),
};

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

  const [uiStyle, setUiStyle] = useState<UiStyleId | null>(null);
  const [uiStyleSaving, setUiStyleSaving] = useState<UiStyleId | null>(null);
  const [uiStyleError, setUiStyleError] = useState<string | null>(null);
  const [uiStyleSavedMessage, setUiStyleSavedMessage] = useState<string | null>(null);

  const [aiGrading, setAiGrading] = useState<AiGradingSettingsDTO | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [aiApiKeyInput, setAiApiKeyInput] = useState('');
  const [aiClearKey, setAiClearKey] = useState(false);
  const [aiSystemPrompt, setAiSystemPrompt] = useState('');
  const [aiSpeakingEnabled, setAiSpeakingEnabled] = useState(false);
  const [aiSpeakingSystemPrompt, setAiSpeakingSystemPrompt] = useState('');
  const [aiSaving, setAiSaving] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSavedMessage, setAiSavedMessage] = useState<string | null>(null);

  function loadAiGrading() {
    adminApi
      .getAiGradingSettings()
      .then((settings) => {
        setAiGrading(settings);
        setAiEnabled(settings.essayGradingEnabled);
        setAiBaseUrl(settings.apiBaseUrl ?? '');
        setAiModel(settings.model ?? '');
        setAiSystemPrompt(settings.systemPrompt);
        setAiSpeakingEnabled(settings.speakingGradingEnabled);
        setAiSpeakingSystemPrompt(settings.speakingSystemPrompt);
        setAiApiKeyInput('');
        setAiClearKey(false);
      })
      .catch((err) => setAiError(err instanceof ApiError ? err.message : t('adminSettings.aiGrading.errors.loadFailed')));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadAiGrading, []);

  async function handleSaveAiGrading() {
    if (aiSaving) return;
    setAiSaving(true);
    setAiError(null);
    setAiSavedMessage(null);
    try {
      const settings = await adminApi.updateAiGradingSettings({
        essayGradingEnabled: aiEnabled,
        apiBaseUrl: aiBaseUrl.trim(),
        model: aiModel.trim(),
        systemPrompt: aiSystemPrompt,
        speakingGradingEnabled: aiSpeakingEnabled,
        speakingSystemPrompt: aiSpeakingSystemPrompt,
        ...(aiClearKey ? { clearApiKey: true } : aiApiKeyInput.trim() ? { apiKey: aiApiKeyInput.trim() } : {}),
      });
      setAiGrading(settings);
      setAiEnabled(settings.essayGradingEnabled);
      setAiBaseUrl(settings.apiBaseUrl ?? '');
      setAiModel(settings.model ?? '');
      setAiSystemPrompt(settings.systemPrompt);
      setAiSpeakingEnabled(settings.speakingGradingEnabled);
      setAiSpeakingSystemPrompt(settings.speakingSystemPrompt);
      setAiApiKeyInput('');
      setAiClearKey(false);
      setAiSavedMessage(t('adminSettings.aiGrading.saved'));
    } catch (err) {
      setAiError(err instanceof ApiError ? err.message : t('adminSettings.aiGrading.errors.saveFailed'));
    } finally {
      setAiSaving(false);
    }
  }

  function load() {
    adminApi
      .getSettings()
      .then((settings) => {
        setLanguage(settings.language);
        setThemeId(settings.themeId);
        setUiStyle(settings.uiStyle);
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

  async function handleUiStyleSwitch(next: UiStyleId) {
    if (next === uiStyle || uiStyleSaving !== null) return;
    setUiStyleSaving(next);
    setUiStyleError(null);
    setUiStyleSavedMessage(null);
    try {
      const settings = await adminApi.updateSettings({ uiStyle: next });
      setUiStyle(settings.uiStyle);
      applyUiStyle(settings.uiStyle);
      setUiStyleSavedMessage(
        t('adminSettings.uiStyle.saved', { style: t(`adminSettings.uiStyle.names.${settings.uiStyle}`) }),
      );
    } catch (err) {
      setUiStyleError(err instanceof ApiError ? err.message : t('adminSettings.uiStyle.errors.saveFailed'));
    } finally {
      setUiStyleSaving(null);
    }
  }

  return (
    <div className="flex w-full flex-col gap-8">
      <PageHeader title={t('adminSettings.pageHeading')} icon={<SettingsIcon className="h-5 w-5" />} />

      {error && <Alert>{error}</Alert>}

      {/* --- Language --- */}
      <section>
        <SectionHeading>{t('adminSettings.heading')}</SectionHeading>
        <p className="mt-1 text-sm text-base-black/60">{t('adminSettings.subtitle')}</p>

        {language === null && !error ? (
          <p className="mt-4 text-sm text-base-black/60">{t('common.loading')}</p>
        ) : (
          language !== null && (
            <Card variant="glass" className="mt-4">
              <p className="text-sm font-medium text-base-black">
                {t('adminSettings.currentLanguage', { language: t(`adminSettings.languageNames.${language}`) })}
              </p>
              <div className="mt-4 flex gap-3">
                <Button
                  variant={language === 'en' ? 'solid' : 'outline'}
                  onClick={() => handleSwitch('en')}
                  disabled={saving !== null || language === 'en'}
                >
                  {saving === 'en' ? t('adminSettings.switching') : t('adminSettings.languageNames.en')}
                </Button>
                <Button
                  variant={language === 'vi' ? 'solid' : 'outline'}
                  onClick={() => handleSwitch('vi')}
                  disabled={saving !== null || language === 'vi'}
                >
                  {saving === 'vi' ? t('adminSettings.switching') : t('adminSettings.languageNames.vi')}
                </Button>
              </div>
              <p className="mt-4 text-xs text-base-black/50">{t('adminSettings.note')}</p>
              {savedMessage && <p className="mt-3 text-sm font-medium text-primary-700">{savedMessage}</p>}
            </Card>
          )
        )}
      </section>

      {/* --- Color theme --- */}
      <section>
        <SectionHeading>{t('adminSettings.theme.heading')}</SectionHeading>
        <p className="mt-1 text-sm text-base-black/60">{t('adminSettings.theme.subtitle')}</p>

        {themeId === null && !error ? (
          <p className="mt-4 text-sm text-base-black/60">{t('common.loading')}</p>
        ) : (
          themeId !== null && (
            <Card variant="glass" className="mt-4">
              <p className="text-sm font-medium text-base-black">
                {t('adminSettings.theme.currentTheme', { theme: t(`adminSettings.themeNames.${themeId}`) })}
              </p>

              {themeError && <Alert className="mt-3">{themeError}</Alert>}

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
            </Card>
          )
        )}
      </section>

      {/* --- UI style --- */}
      <section>
        <SectionHeading>{t('adminSettings.uiStyle.heading')}</SectionHeading>
        <p className="mt-1 text-sm text-base-black/60">{t('adminSettings.uiStyle.subtitle')}</p>

        {uiStyle === null && !error ? (
          <p className="mt-4 text-sm text-base-black/60">{t('common.loading')}</p>
        ) : (
          uiStyle !== null && (
            <Card variant="glass" className="mt-4">
              <p className="text-sm font-medium text-base-black">
                {t('adminSettings.uiStyle.currentStyle', { style: t(`adminSettings.uiStyle.names.${uiStyle}`) })}
              </p>

              {uiStyleError && <Alert className="mt-3">{uiStyleError}</Alert>}

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {UI_STYLE_DEFINITIONS.map((style) => {
                  const isActive = style.id === uiStyle;
                  const isSaving = uiStyleSaving === style.id;
                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => handleUiStyleSwitch(style.id)}
                      disabled={uiStyleSaving !== null || isActive}
                      aria-pressed={isActive}
                      className={`flex flex-col items-start gap-2 rounded-xl border-2 bg-base-white p-3 text-left transition-colors disabled:cursor-not-allowed ${
                        isActive
                          ? 'border-primary-500 shadow-card'
                          : 'border-transparent shadow-card hover:border-primary-200'
                      }`}
                    >
                      {UI_STYLE_PREVIEW[style.id]}
                      <span className="text-sm font-semibold text-base-black">
                        {t(`adminSettings.uiStyle.names.${style.id}`)}
                      </span>
                      {isActive && (
                        <span className="text-xs font-medium uppercase tracking-wide text-primary-600">
                          {t('adminSettings.uiStyle.currentBadge')}
                        </span>
                      )}
                      {isSaving && (
                        <span className="text-xs font-medium text-base-black/60">
                          {t('adminSettings.uiStyle.switching')}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {uiStyleSavedMessage && <p className="mt-4 text-sm font-medium text-primary-700">{uiStyleSavedMessage}</p>}
            </Card>
          )
        )}
      </section>

      {/* --- AI essay/writing grading --- */}
      <section>
        <SectionHeading>{t('adminSettings.aiGrading.heading')}</SectionHeading>
        <p className="mt-1 text-sm text-base-black/60">{t('adminSettings.aiGrading.subtitle')}</p>

        {aiGrading === null && !aiError ? (
          <p className="mt-4 text-sm text-base-black/60">{t('common.loading')}</p>
        ) : (
          aiGrading !== null && (
            <Card variant="glass" className="mt-4">
              {aiError && <Alert className="mb-4">{aiError}</Alert>}

              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-base-black">
                  {t('adminSettings.aiGrading.essayStatusLabel', {
                    status: aiEnabled
                      ? t('adminSettings.aiGrading.enabledBadge')
                      : t('adminSettings.aiGrading.disabledBadge'),
                  })}
                </p>
                <Button
                  type="button"
                  variant={aiEnabled ? 'outline' : 'solid'}
                  onClick={() => setAiEnabled((prev) => !prev)}
                >
                  {aiEnabled ? t('adminSettings.aiGrading.disableButton') : t('adminSettings.aiGrading.enableButton')}
                </Button>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-sm font-medium text-base-black">
                  {t('adminSettings.aiGrading.speakingStatusLabel', {
                    status: aiSpeakingEnabled
                      ? t('adminSettings.aiGrading.enabledBadge')
                      : t('adminSettings.aiGrading.disabledBadge'),
                  })}
                </p>
                <Button
                  type="button"
                  variant={aiSpeakingEnabled ? 'outline' : 'solid'}
                  onClick={() => setAiSpeakingEnabled((prev) => !prev)}
                >
                  {aiSpeakingEnabled ? t('adminSettings.aiGrading.disableButton') : t('adminSettings.aiGrading.enableButton')}
                </Button>
              </div>

              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-base-black/50">
                {t('adminSettings.aiGrading.connectionHeading')}
              </p>
              <div className="mt-2 grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-base-black">{t('adminSettings.aiGrading.apiBaseUrlLabel')}</span>
                  <Input
                    value={aiBaseUrl}
                    onChange={(e) => setAiBaseUrl(e.target.value)}
                    placeholder={t('adminSettings.aiGrading.apiBaseUrlPlaceholder')}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-base-black">{t('adminSettings.aiGrading.modelLabel')}</span>
                  <Input
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    placeholder={t('adminSettings.aiGrading.modelPlaceholder')}
                  />
                </label>
              </div>

              <label className="mt-4 flex flex-col gap-1">
                <span className="text-sm font-medium text-base-black">{t('adminSettings.aiGrading.apiKeyLabel')}</span>
                <Input
                  type="password"
                  autoComplete="off"
                  value={aiApiKeyInput}
                  disabled={aiClearKey}
                  onChange={(e) => setAiApiKeyInput(e.target.value)}
                  placeholder={
                    aiGrading.hasApiKey
                      ? t('adminSettings.aiGrading.apiKeyPlaceholderConfigured')
                      : t('adminSettings.aiGrading.apiKeyPlaceholderEmpty')
                  }
                />
              </label>
              {aiGrading.hasApiKey && (
                <label className="mt-2 flex items-center gap-2 text-sm text-base-black/70">
                  <input
                    type="checkbox"
                    checked={aiClearKey}
                    onChange={(e) => {
                      setAiClearKey(e.target.checked);
                      if (e.target.checked) setAiApiKeyInput('');
                    }}
                  />
                  {t('adminSettings.aiGrading.clearKeyCheckbox')}
                </label>
              )}

              <div className="mt-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-base-black">{t('adminSettings.aiGrading.essayPromptLabel')}</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => setAiSystemPrompt(aiGrading.defaultSystemPrompt)}>
                    {t('adminSettings.aiGrading.resetPromptButton')}
                  </Button>
                </div>
                <p className="mt-1 text-xs text-base-black/50">{t('adminSettings.aiGrading.systemPromptHint')}</p>
                <textarea
                  value={aiSystemPrompt}
                  onChange={(e) => setAiSystemPrompt(e.target.value)}
                  rows={14}
                  className="mt-2 w-full rounded-md border border-primary-200 bg-base-white px-3 py-2 text-sm text-base-black transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                />
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-base-black">{t('adminSettings.aiGrading.speakingPromptLabel')}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAiSpeakingSystemPrompt(aiGrading.defaultSpeakingSystemPrompt)}
                  >
                    {t('adminSettings.aiGrading.resetPromptButton')}
                  </Button>
                </div>
                <p className="mt-1 text-xs text-base-black/50">{t('adminSettings.aiGrading.speakingPromptHint')}</p>
                <textarea
                  value={aiSpeakingSystemPrompt}
                  onChange={(e) => setAiSpeakingSystemPrompt(e.target.value)}
                  rows={14}
                  className="mt-2 w-full rounded-md border border-primary-200 bg-base-white px-3 py-2 text-sm text-base-black transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                />
              </div>

              <div className="mt-4 flex items-center gap-3">
                <Button type="button" onClick={handleSaveAiGrading} disabled={aiSaving}>
                  {aiSaving ? t('adminSettings.aiGrading.saving') : t('adminSettings.aiGrading.saveButton')}
                </Button>
                {aiSavedMessage && <p className="text-sm font-medium text-primary-700">{aiSavedMessage}</p>}
              </div>
            </Card>
          )
        )}
      </section>
    </div>
  );
}

export default AdminSettingsPage;
