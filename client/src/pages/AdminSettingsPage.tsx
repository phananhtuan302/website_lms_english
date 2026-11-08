import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiGradingSettingsDTO, AiToolsSettingsDTO, DesignSystemId, FontFamilyId, SiteLanguage, ThemeId, UiStyleId } from '@platform/shared';
import { adminApi } from '../lib/adminApi';
import { ApiError } from '../lib/apiClient';
import { applyTheme, THEME_DEFINITIONS } from '../lib/themePalettes';
import { applyUiStyle } from '../lib/uiStyles';
import { DESIGN_SYSTEM_DEFINITIONS } from '../lib/designSystems';
import { applyFontFamily, FONT_DEFINITIONS } from '../lib/fonts';
import { Alert, Button, Card, Input, PageHeader, SectionHeading, SettingsIcon } from '../components/ui';

/** The design system this page falls back to for "Khôi phục giao diện mặc định" — the
 * closest of the 5 to the site's original (pre-"5 Design Systems") look, so "restore
 * default" reads as a safe, familiar baseline rather than an arbitrary 6th choice. */
const DEFAULT_DESIGN_SYSTEM_ID: DesignSystemId = 'modernSaas';

/** A small rendered preview of each design system's signature surface treatment, for the
 * gallery grid below — same "show, don't just name it" idea as the color-theme picker's
 * swatches, now reflecting genuinely different layouts (not just a recolored box). */
const DESIGN_SYSTEM_PREVIEW: Record<DesignSystemId, ReactNode> = {
  minimalAcademic: (
    <div className="flex h-14 w-full flex-col justify-end gap-1.5 bg-white px-1 pb-1.5">
      <div className="h-2.5 w-16 bg-slate-800" style={{ fontFamily: 'Source Serif 4, serif' }} />
      <div className="h-px w-full bg-slate-300" />
      <div className="h-1.5 w-10 bg-slate-300" />
    </div>
  ),
  modernSaas: (
    <div className="flex h-14 w-full items-center justify-center rounded-lg bg-slate-50">
      <div className="h-8 w-20 rounded-lg border border-slate-200 bg-white shadow-sm" />
    </div>
  ),
  editorialLearning: (
    <div className="flex h-14 w-full flex-col justify-end gap-1 bg-[#faf6ee] px-1.5 pb-1.5">
      <div className="h-3 w-20 bg-[#3f3a2e]" style={{ fontFamily: 'Playfair Display, serif' }} />
      <div className="h-[2px] w-full bg-[#3f3a2e]" />
    </div>
  ),
  focusExam: (
    <div className="flex h-14 w-full items-center justify-center gap-1.5 rounded-lg bg-[#fbfbfa]">
      <div className="h-8 w-14 rounded-md border-2 border-slate-300 bg-white" />
      <div className="h-8 w-6 rounded-md border-2 border-primary-300 bg-primary-50" />
    </div>
  ),
  contemporaryCreative: (
    <div className="flex h-14 w-full items-center justify-center rounded-2xl bg-primary-50">
      <div className="h-9 w-24 rounded-2xl bg-primary-600" />
    </div>
  ),
  minimalism: (
    <div className="flex h-14 w-full flex-col justify-center gap-1.5 bg-white px-2">
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
        <div className="h-1.5 w-20 rounded-full bg-slate-200" />
      </div>
      <div className="h-px w-full bg-slate-100" />
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
        <div className="h-1.5 w-14 rounded-full bg-slate-200" />
      </div>
    </div>
  ),
  flatDesign: (
    <div className="flex h-14 w-full items-center gap-1.5 bg-[#eef0f2] p-1.5">
      <div className="h-full w-1.5 rounded-sm bg-primary-500" />
      <div className="h-full flex-1 rounded-sm bg-white" />
    </div>
  ),
  glassmorphism: (
    <div className="relative flex h-14 w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary-300 via-primary-500 to-primary-700">
      <div className="h-9 w-24 rounded-xl border border-white/60 bg-white/40 backdrop-blur-md" />
    </div>
  ),
  neumorphism: (
    <div className="flex h-14 w-full items-center justify-center rounded-2xl bg-[#e6e9ef]">
      <div className="h-8 w-20 rounded-xl bg-[#e6e9ef] shadow-[4px_4px_8px_-1px_rgb(163,177,198,0.6),-4px_-4px_8px_-1px_rgb(255,255,255,0.9)]" />
    </div>
  ),
  swissDesign: (
    <div className="flex h-14 w-full flex-col justify-end gap-1 bg-white px-1.5 pb-1.5">
      <div className="h-2.5 w-14 bg-black" />
      <div className="h-[2px] w-full bg-black" />
      <div className="h-1.5 w-8 bg-primary-600" />
    </div>
  ),
  neoBrutalism: (
    <div className="flex h-14 w-full items-center justify-center bg-[#fffdf5]">
      <div className="h-8 w-20 border-[3px] border-black bg-white shadow-[4px_4px_0_0_#000]" />
    </div>
  ),
  materialDesign: (
    <div className="flex h-14 w-full items-center justify-center rounded-2xl bg-[#fef7ff]">
      <div className="h-8 w-20 rounded-[1.25rem] bg-[#f3edf7] shadow-[0_1px_2px_0_rgb(0,0,0,0.3),0_1px_3px_1px_rgb(0,0,0,0.15)]" />
    </div>
  ),
  cyberpunkNeon: (
    <div className="flex h-14 w-full items-center justify-center rounded-md bg-[#05060a]">
      <div className="h-8 w-20 rounded-md border border-cyan-400/40 bg-[#0b0e17] shadow-[0_0_14px_-2px_rgb(34,211,238,0.6)]" />
    </div>
  ),
  playfulRetro: (
    <div className="flex h-14 w-full items-center justify-center bg-[#fff6ea]">
      <div className="h-8 w-20 rounded-2xl border-2 border-[#28243d] bg-white shadow-[4px_4px_0_0_rgb(var(--color-primary-500))]" />
    </div>
  ),
  claymorphism: (
    <div className="flex h-14 w-full items-center justify-center rounded-2xl bg-[#eef2ff]">
      <div className="h-8 w-20 rounded-[1.25rem] bg-[linear-gradient(145deg,#ffffff,#f1eefc)] shadow-[5px_5px_10px_rgb(199,192,231,0.5),-5px_-5px_10px_rgb(255,255,255,0.95)]" />
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

  // `uiStyle` is the REAL, persisted site-wide value (may still be one of the 4 legacy
  // styles if nobody has applied one of the 5 current design systems yet). `previewingId`
  // is a CLIENT-ONLY override — set by the "Xem thử" button, applied instantly via
  // `applyUiStyle` with no API call — so an admin can compare designs live before
  // committing one. The DOM always reflects `previewingId ?? uiStyle`.
  const [uiStyle, setUiStyle] = useState<UiStyleId | null>(null);
  const [previewingId, setPreviewingId] = useState<DesignSystemId | null>(null);
  const [applyingId, setApplyingId] = useState<DesignSystemId | null>(null);
  const [designSystemError, setDesignSystemError] = useState<string | null>(null);
  const [designSystemSavedMessage, setDesignSystemSavedMessage] = useState<string | null>(null);

  // `fontFamily` mirrors the `uiStyle` preview/apply pattern above: `fontFamily` itself is
  // the real persisted value (`null` = no override), `fontPreviewId` is a client-only
  // override applied instantly via `applyFontFamily`, with `undefined` meaning "not
  // previewing" (distinct from `null`, which would mean "previewing: no override").
  const [fontFamily, setFontFamily] = useState<FontFamilyId | null>(null);
  const [fontFamilyLoaded, setFontFamilyLoaded] = useState(false);
  const [fontPreviewId, setFontPreviewId] = useState<FontFamilyId | null | undefined>(undefined);
  const [fontApplyingId, setFontApplyingId] = useState<FontFamilyId | null | undefined>(undefined);
  const [fontError, setFontError] = useState<string | null>(null);
  const [fontSavedMessage, setFontSavedMessage] = useState<string | null>(null);

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

  const [aiTools, setAiTools] = useState<AiToolsSettingsDTO | null>(null);
  const [aiToolsBaseUrl, setAiToolsBaseUrl] = useState('');
  const [aiToolsModel, setAiToolsModel] = useState('');
  const [aiToolsApiKeyInput, setAiToolsApiKeyInput] = useState('');
  const [aiToolsClearKey, setAiToolsClearKey] = useState(false);
  const [vocabGenEnabled, setVocabGenEnabled] = useState(false);
  const [vocabGenPrompt, setVocabGenPrompt] = useState('');
  const [grammarGenEnabled, setGrammarGenEnabled] = useState(false);
  const [grammarGenPrompt, setGrammarGenPrompt] = useState('');
  const [examImportEnabled, setExamImportEnabled] = useState(false);
  const [examImportPrompt, setExamImportPrompt] = useState('');
  const [teacherChatEnabled, setTeacherChatEnabled] = useState(false);
  const [teacherChatPrompt, setTeacherChatPrompt] = useState('');
  const [aiToolsSaving, setAiToolsSaving] = useState(false);
  const [aiToolsError, setAiToolsError] = useState<string | null>(null);
  const [aiToolsSavedMessage, setAiToolsSavedMessage] = useState<string | null>(null);

  function loadAiTools() {
    adminApi
      .getAiToolsSettings()
      .then((settings) => {
        setAiTools(settings);
        setAiToolsBaseUrl(settings.apiBaseUrl ?? '');
        setAiToolsModel(settings.model ?? '');
        setVocabGenEnabled(settings.vocabGenEnabled);
        setVocabGenPrompt(settings.vocabGenSystemPrompt);
        setGrammarGenEnabled(settings.grammarGenEnabled);
        setGrammarGenPrompt(settings.grammarGenSystemPrompt);
        setExamImportEnabled(settings.examImportEnabled);
        setExamImportPrompt(settings.examImportSystemPrompt);
        setTeacherChatEnabled(settings.teacherChatEnabled);
        setTeacherChatPrompt(settings.teacherChatSystemPrompt);
        setAiToolsApiKeyInput('');
        setAiToolsClearKey(false);
      })
      .catch((err) => setAiToolsError(err instanceof ApiError ? err.message : t('adminSettings.aiTools.errors.loadFailed')));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadAiTools, []);

  async function handleSaveAiTools() {
    if (aiToolsSaving) return;
    setAiToolsSaving(true);
    setAiToolsError(null);
    setAiToolsSavedMessage(null);
    try {
      const settings = await adminApi.updateAiToolsSettings({
        apiBaseUrl: aiToolsBaseUrl.trim(),
        model: aiToolsModel.trim(),
        vocabGenEnabled,
        vocabGenSystemPrompt: vocabGenPrompt,
        grammarGenEnabled,
        grammarGenSystemPrompt: grammarGenPrompt,
        examImportEnabled,
        examImportSystemPrompt: examImportPrompt,
        teacherChatEnabled,
        teacherChatSystemPrompt: teacherChatPrompt,
        ...(aiToolsClearKey ? { clearApiKey: true } : aiToolsApiKeyInput.trim() ? { apiKey: aiToolsApiKeyInput.trim() } : {}),
      });
      setAiTools(settings);
      setAiToolsBaseUrl(settings.apiBaseUrl ?? '');
      setAiToolsModel(settings.model ?? '');
      setVocabGenEnabled(settings.vocabGenEnabled);
      setVocabGenPrompt(settings.vocabGenSystemPrompt);
      setGrammarGenEnabled(settings.grammarGenEnabled);
      setGrammarGenPrompt(settings.grammarGenSystemPrompt);
      setExamImportEnabled(settings.examImportEnabled);
      setExamImportPrompt(settings.examImportSystemPrompt);
      setTeacherChatEnabled(settings.teacherChatEnabled);
      setTeacherChatPrompt(settings.teacherChatSystemPrompt);
      setAiToolsApiKeyInput('');
      setAiToolsClearKey(false);
      setAiToolsSavedMessage(t('adminSettings.aiTools.saved'));
    } catch (err) {
      setAiToolsError(err instanceof ApiError ? err.message : t('adminSettings.aiTools.errors.saveFailed'));
    } finally {
      setAiToolsSaving(false);
    }
  }

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
        setFontFamily(settings.fontFamily);
        setFontFamilyLoaded(true);
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

  /** "Xem thử" — client-only, no API call, no `designSystemSavedMessage`/error touched.
   * Instantly repaints THIS browser via `applyUiStyle`; every other visitor is unaffected
   * until an Apply actually persists something. */
  function handlePreview(id: DesignSystemId) {
    setPreviewingId(id);
    applyUiStyle(id);
  }

  /** "Dừng xem thử" — reverts this browser back to whatever is actually persisted. */
  function handleStopPreview() {
    setPreviewingId(null);
    if (uiStyle) applyUiStyle(uiStyle);
  }

  async function handleApply(id: DesignSystemId) {
    if (applyingId !== null) return;
    setApplyingId(id);
    setDesignSystemError(null);
    setDesignSystemSavedMessage(null);
    try {
      const settings = await adminApi.updateSettings({ uiStyle: id });
      setUiStyle(settings.uiStyle);
      setPreviewingId(null);
      applyUiStyle(settings.uiStyle);
      setDesignSystemSavedMessage(
        t('adminSettings.designSystems.saved', { name: t(`adminSettings.designSystems.names.${settings.uiStyle}`) }),
      );
    } catch (err) {
      setDesignSystemError(err instanceof ApiError ? err.message : t('adminSettings.designSystems.errors.saveFailed'));
    } finally {
      setApplyingId(null);
    }
  }

  function handleRestoreDefault() {
    void handleApply(DEFAULT_DESIGN_SYSTEM_ID);
  }

  /** "Xem thử" for a font — client-only, same pattern as `handlePreview` above.
   * `id: null` previews "no override" (the active design system's own default font). */
  function handleFontPreview(id: FontFamilyId | null) {
    setFontPreviewId(id);
    applyFontFamily(id);
  }

  function handleFontStopPreview() {
    setFontPreviewId(undefined);
    applyFontFamily(fontFamily);
  }

  async function handleFontApply(id: FontFamilyId | null) {
    if (fontApplyingId !== undefined) return;
    setFontApplyingId(id);
    setFontError(null);
    setFontSavedMessage(null);
    try {
      const settings = await adminApi.updateSettings({ fontFamily: id });
      setFontFamily(settings.fontFamily);
      setFontPreviewId(undefined);
      applyFontFamily(settings.fontFamily);
      setFontSavedMessage(
        t('adminSettings.fonts.saved', {
          name: settings.fontFamily
            ? t(`adminSettings.fonts.names.${settings.fontFamily}`)
            : t('adminSettings.fonts.useDesignSystemDefault'),
        }),
      );
    } catch (err) {
      setFontError(err instanceof ApiError ? err.message : t('adminSettings.fonts.errors.saveFailed'));
    } finally {
      setFontApplyingId(undefined);
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

      {/* --- Design system gallery (2026-10 "5 Design Systems" rebuild) --- */}
      <section>
        <SectionHeading>{t('adminSettings.designSystems.galleryHeading')}</SectionHeading>
        <p className="mt-1 text-sm text-base-black/60">{t('adminSettings.designSystems.gallerySubtitle')}</p>

        {uiStyle === null && !error ? (
          <p className="mt-4 text-sm text-base-black/60">{t('common.loading')}</p>
        ) : (
          uiStyle !== null && (
            <Card variant="glass" className="mt-4">
              {previewingId && previewingId !== uiStyle && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5">
                  <p className="text-sm font-medium text-amber-900">
                    {t('adminSettings.designSystems.previewBanner', {
                      name: t(`adminSettings.designSystems.names.${previewingId}`),
                    })}
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={handleStopPreview}>
                    {t('adminSettings.designSystems.stopPreviewButton')}
                  </Button>
                </div>
              )}

              {designSystemError && <Alert className="mb-3">{designSystemError}</Alert>}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {DESIGN_SYSTEM_DEFINITIONS.map((design) => {
                  const isCurrent = design.id === uiStyle && previewingId === null;
                  const isPreviewing = previewingId === design.id;
                  const isApplying = applyingId === design.id;
                  return (
                    <div
                      key={design.id}
                      className={`flex flex-col gap-2.5 rounded-xl border-2 bg-base-white p-3.5 text-left transition-colors ${
                        isCurrent || isPreviewing ? 'border-primary-500 shadow-card' : 'border-transparent shadow-card'
                      }`}
                    >
                      <span className="overflow-hidden rounded-lg" aria-hidden="true">
                        {DESIGN_SYSTEM_PREVIEW[design.id]}
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-base-black">
                            {t(`adminSettings.designSystems.names.${design.id}`)}
                          </span>
                          {isCurrent && (
                            <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary-700">
                              {t('adminSettings.designSystems.currentBadge')}
                            </span>
                          )}
                          {isPreviewing && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                              {t('adminSettings.designSystems.previewingBadge')}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-base-black/60">
                          {t(`adminSettings.designSystems.descriptions.${design.id}`)}
                        </p>
                        <ul className="mt-2 flex flex-col gap-0.5">
                          {design.highlightKeys.map((key) => (
                            <li key={key} className="flex items-center gap-1.5 text-xs text-base-black/70">
                              <span aria-hidden="true" className="h-1 w-1 rounded-full bg-primary-400" />
                              {t(`adminSettings.designSystems.highlights.${design.id}.${key}`)}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {isPreviewing ? (
                          <Button type="button" variant="outline" size="sm" onClick={handleStopPreview}>
                            {t('adminSettings.designSystems.stopPreviewButton')}
                          </Button>
                        ) : (
                          <Button type="button" variant="outline" size="sm" onClick={() => handlePreview(design.id)}>
                            {t('adminSettings.designSystems.previewButton')}
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleApply(design.id)}
                          disabled={applyingId !== null || isCurrent}
                        >
                          {isApplying
                            ? t('adminSettings.designSystems.applyingButton')
                            : t('adminSettings.designSystems.applyButton')}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-primary-100 pt-4">
                <Button type="button" variant="ghost" size="sm" onClick={handleRestoreDefault} disabled={applyingId !== null}>
                  {t('adminSettings.designSystems.restoreDefaultButton')}
                </Button>
                {designSystemSavedMessage && (
                  <p className="text-sm font-medium text-primary-700">{designSystemSavedMessage}</p>
                )}
              </div>
            </Card>
          )
        )}
      </section>

      {/* --- Font picker (2026-10 request) --- */}
      <section>
        <SectionHeading>{t('adminSettings.fonts.heading')}</SectionHeading>
        <p className="mt-1 text-sm text-base-black/60">{t('adminSettings.fonts.subtitle')}</p>

        {!fontFamilyLoaded && !error ? (
          <p className="mt-4 text-sm text-base-black/60">{t('common.loading')}</p>
        ) : (
          fontFamilyLoaded && (
            <Card variant="glass" className="mt-4">
              {fontPreviewId !== undefined && fontPreviewId !== fontFamily && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5">
                  <p className="text-sm font-medium text-amber-900">
                    {t('adminSettings.designSystems.previewBanner', {
                      name: fontPreviewId
                        ? t(`adminSettings.fonts.names.${fontPreviewId}`)
                        : t('adminSettings.fonts.useDesignSystemDefault'),
                    })}
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={handleFontStopPreview}>
                    {t('adminSettings.fonts.stopPreviewButton')}
                  </Button>
                </div>
              )}

              {fontError && <Alert className="mb-3">{fontError}</Alert>}

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {/* "Use design system default" — always first, represented as `null`. */}
                <FontOptionCard
                  label={t('adminSettings.fonts.useDesignSystemDefault')}
                  previewStack="var(--font-body)"
                  isCurrent={fontFamily === null && fontPreviewId === undefined}
                  isPreviewing={fontPreviewId === null}
                  isApplying={fontApplyingId === null}
                  applyingAnything={fontApplyingId !== undefined}
                  onPreview={() => handleFontPreview(null)}
                  onStopPreview={handleFontStopPreview}
                  onApply={() => void handleFontApply(null)}
                />
                {FONT_DEFINITIONS.map((font) => (
                  <FontOptionCard
                    key={font.id}
                    label={t(`adminSettings.fonts.names.${font.id}`)}
                    categoryLabel={t(`adminSettings.fonts.categories.${font.category}`)}
                    previewStack={font.stack}
                    isCurrent={fontFamily === font.id && fontPreviewId === undefined}
                    isPreviewing={fontPreviewId === font.id}
                    isApplying={fontApplyingId === font.id}
                    applyingAnything={fontApplyingId !== undefined}
                    onPreview={() => handleFontPreview(font.id)}
                    onStopPreview={handleFontStopPreview}
                    onApply={() => void handleFontApply(font.id)}
                  />
                ))}
              </div>

              {fontSavedMessage && <p className="mt-4 text-sm font-medium text-primary-700">{fontSavedMessage}</p>}
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

      {/* --- AI Content Tools (vocab/grammar generation, exam-image import, teacher chat) --- */}
      <section>
        <SectionHeading>{t('adminSettings.aiTools.heading')}</SectionHeading>
        <p className="mt-1 text-sm text-base-black/60">{t('adminSettings.aiTools.subtitle')}</p>

        {aiTools === null && !aiToolsError ? (
          <p className="mt-4 text-sm text-base-black/60">{t('common.loading')}</p>
        ) : (
          aiTools !== null && (
            <Card variant="glass" className="mt-4">
              {aiToolsError && <Alert className="mb-4">{aiToolsError}</Alert>}

              <p className="text-xs font-semibold uppercase tracking-wide text-base-black/50">
                {t('adminSettings.aiTools.connectionHeading')}
              </p>
              <div className="mt-2 grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-base-black">{t('adminSettings.aiTools.apiBaseUrlLabel')}</span>
                  <Input
                    value={aiToolsBaseUrl}
                    onChange={(e) => setAiToolsBaseUrl(e.target.value)}
                    placeholder={t('adminSettings.aiTools.apiBaseUrlPlaceholder')}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-base-black">{t('adminSettings.aiTools.modelLabel')}</span>
                  <Input
                    value={aiToolsModel}
                    onChange={(e) => setAiToolsModel(e.target.value)}
                    placeholder={t('adminSettings.aiTools.modelPlaceholder')}
                  />
                </label>
              </div>

              <label className="mt-4 flex flex-col gap-1">
                <span className="text-sm font-medium text-base-black">{t('adminSettings.aiTools.apiKeyLabel')}</span>
                <Input
                  type="password"
                  autoComplete="off"
                  value={aiToolsApiKeyInput}
                  disabled={aiToolsClearKey}
                  onChange={(e) => setAiToolsApiKeyInput(e.target.value)}
                  placeholder={
                    aiTools.hasApiKey
                      ? t('adminSettings.aiTools.apiKeyPlaceholderConfigured')
                      : t('adminSettings.aiTools.apiKeyPlaceholderEmpty')
                  }
                />
              </label>
              {aiTools.hasApiKey && (
                <label className="mt-2 flex items-center gap-2 text-sm text-base-black/70">
                  <input
                    type="checkbox"
                    checked={aiToolsClearKey}
                    onChange={(e) => {
                      setAiToolsClearKey(e.target.checked);
                      if (e.target.checked) setAiToolsApiKeyInput('');
                    }}
                  />
                  {t('adminSettings.aiTools.clearKeyCheckbox')}
                </label>
              )}

              <AiToolFeatureBlock
                statusLabel={t('adminSettings.aiTools.vocabGen.statusLabel', {
                  status: vocabGenEnabled ? t('adminSettings.aiTools.enabledBadge') : t('adminSettings.aiTools.disabledBadge'),
                })}
                enabled={vocabGenEnabled}
                onToggle={() => setVocabGenEnabled((prev) => !prev)}
                promptLabel={t('adminSettings.aiTools.vocabGen.promptLabel')}
                promptHint={t('adminSettings.aiTools.vocabGen.promptHint')}
                prompt={vocabGenPrompt}
                onChangePrompt={setVocabGenPrompt}
                onResetPrompt={() => setVocabGenPrompt(aiTools.defaultVocabGenSystemPrompt)}
              />
              <AiToolFeatureBlock
                statusLabel={t('adminSettings.aiTools.grammarGen.statusLabel', {
                  status: grammarGenEnabled ? t('adminSettings.aiTools.enabledBadge') : t('adminSettings.aiTools.disabledBadge'),
                })}
                enabled={grammarGenEnabled}
                onToggle={() => setGrammarGenEnabled((prev) => !prev)}
                promptLabel={t('adminSettings.aiTools.grammarGen.promptLabel')}
                promptHint={t('adminSettings.aiTools.grammarGen.promptHint')}
                prompt={grammarGenPrompt}
                onChangePrompt={setGrammarGenPrompt}
                onResetPrompt={() => setGrammarGenPrompt(aiTools.defaultGrammarGenSystemPrompt)}
              />
              <AiToolFeatureBlock
                statusLabel={t('adminSettings.aiTools.examImport.statusLabel', {
                  status: examImportEnabled ? t('adminSettings.aiTools.enabledBadge') : t('adminSettings.aiTools.disabledBadge'),
                })}
                enabled={examImportEnabled}
                onToggle={() => setExamImportEnabled((prev) => !prev)}
                promptLabel={t('adminSettings.aiTools.examImport.promptLabel')}
                promptHint={t('adminSettings.aiTools.examImport.promptHint')}
                prompt={examImportPrompt}
                onChangePrompt={setExamImportPrompt}
                onResetPrompt={() => setExamImportPrompt(aiTools.defaultExamImportSystemPrompt)}
              />
              <AiToolFeatureBlock
                statusLabel={t('adminSettings.aiTools.teacherChat.statusLabel', {
                  status: teacherChatEnabled ? t('adminSettings.aiTools.enabledBadge') : t('adminSettings.aiTools.disabledBadge'),
                })}
                enabled={teacherChatEnabled}
                onToggle={() => setTeacherChatEnabled((prev) => !prev)}
                promptLabel={t('adminSettings.aiTools.teacherChat.promptLabel')}
                promptHint={t('adminSettings.aiTools.teacherChat.promptHint')}
                prompt={teacherChatPrompt}
                onChangePrompt={setTeacherChatPrompt}
                onResetPrompt={() => setTeacherChatPrompt(aiTools.defaultTeacherChatSystemPrompt)}
              />

              <div className="mt-4 flex items-center gap-3">
                <Button type="button" onClick={handleSaveAiTools} disabled={aiToolsSaving}>
                  {aiToolsSaving ? t('adminSettings.aiTools.saving') : t('adminSettings.aiTools.saveButton')}
                </Button>
                {aiToolsSavedMessage && <p className="text-sm font-medium text-primary-700">{aiToolsSavedMessage}</p>}
              </div>
            </Card>
          )
        )}
      </section>
    </div>
  );
}

/** One feature's enable toggle + editable system prompt, reused 4x above (vocab/grammar
 * generation, exam-image import, teacher chat) instead of duplicating the same JSX block —
 * the AI Grading section above doesn't need this since it only has 2 toggles sharing one
 * layout written out directly. */
function AiToolFeatureBlock(props: {
  statusLabel: string;
  enabled: boolean;
  onToggle: () => void;
  promptLabel: string;
  promptHint: string;
  prompt: string;
  onChangePrompt: (value: string) => void;
  onResetPrompt: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-5 border-t border-primary-100 pt-4 first:mt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-base-black">{props.statusLabel}</p>
        <Button type="button" variant={props.enabled ? 'outline' : 'solid'} size="sm" onClick={props.onToggle}>
          {props.enabled ? t('adminSettings.aiTools.disableButton') : t('adminSettings.aiTools.enableButton')}
        </Button>
      </div>
      <div className="mt-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-base-black">{props.promptLabel}</span>
          <Button type="button" variant="outline" size="sm" onClick={props.onResetPrompt}>
            {t('adminSettings.aiTools.resetPromptButton')}
          </Button>
        </div>
        <p className="mt-1 text-xs text-base-black/50">{props.promptHint}</p>
        <textarea
          value={props.prompt}
          onChange={(e) => props.onChangePrompt(e.target.value)}
          rows={10}
          className="mt-2 w-full rounded-md border border-primary-200 bg-base-white px-3 py-2 text-sm text-base-black transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
      </div>
    </div>
  );
}

/** One font option in the "Font chữ" picker grid — shows a real live preview rendered in
 * that actual font (via an inline `fontFamily` style, the one place in this codebase an
 * inline style is the right tool: it's literally demonstrating the font itself, not
 * something a Tailwind/theme class could express), plus the same preview/apply controls
 * every design-system card already has. */
function FontOptionCard(props: {
  label: string;
  categoryLabel?: string;
  previewStack: string;
  isCurrent: boolean;
  isPreviewing: boolean;
  isApplying: boolean;
  applyingAnything: boolean;
  onPreview: () => void;
  onStopPreview: () => void;
  onApply: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border-2 bg-base-white p-3 text-left transition-colors ${
        props.isCurrent || props.isPreviewing ? 'border-primary-500 shadow-card' : 'border-transparent shadow-card'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-base-black">{props.label}</span>
        {props.categoryLabel && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {props.categoryLabel}
          </span>
        )}
        {props.isCurrent && (
          <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary-700">
            {t('adminSettings.fonts.currentBadge')}
          </span>
        )}
      </div>
      <p className="truncate text-xl text-base-black" style={{ fontFamily: props.previewStack }}>
        Aa Bb — Xin chào 123
      </p>
      <div className="flex flex-wrap gap-2">
        {props.isPreviewing ? (
          <Button type="button" variant="outline" size="sm" onClick={props.onStopPreview}>
            {t('adminSettings.fonts.stopPreviewButton')}
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={props.onPreview}>
            {t('adminSettings.fonts.previewButton')}
          </Button>
        )}
        <Button type="button" size="sm" onClick={props.onApply} disabled={props.applyingAnything || props.isCurrent}>
          {props.isApplying ? t('adminSettings.fonts.applyingButton') : t('adminSettings.fonts.applyButton')}
        </Button>
      </div>
    </div>
  );
}

export default AdminSettingsPage;
