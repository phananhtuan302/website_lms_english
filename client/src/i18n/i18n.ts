/**
 * i18next setup (T-067, Phase 10 Vietnamese localization).
 *
 * Standard `react-i18next` + `i18next` wiring — deliberately NOT hand-rolled, per
 * PROJECT_PLAN Assumption A13. Resource files are plain JSON keyed by short string ids,
 * grouped by page/area (`header`, `home`, `auth`, `teacherDashboard`, ...).
 *
 * Crucially, `lng` is NOT auto-detected from the browser (no `i18next-browser-languagedetector`
 * is used) and there is no per-user override anywhere in this module — the current
 * language is a single, site-wide, admin-controlled setting (PROJECT_PLAN Guiding
 * Principle 3). `initI18n` must be called with whatever `GET /api/settings` returned,
 * BEFORE the app's routes render (see `main.tsx`), so there's never a flash of the
 * wrong language.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { SiteLanguage } from '@platform/shared';
import en from './en.json';
import vi from './vi.json';

const resources = {
  en: { translation: en },
  vi: { translation: vi },
} as const;

let initPromise: Promise<void> | null = null;

/**
 * Initializes i18next to the given site-wide language. Safe to call more than once
 * (e.g. React StrictMode's double-invoke in dev) — the underlying `i18next.init()` call
 * only ever runs once; subsequent calls reuse the same promise rather than
 * re-initializing. Resolves to `void` (not the `TFunction` `i18next.init()` itself
 * resolves to) — callers that need the instance import the default export below.
 */
export function initI18n(language: SiteLanguage): Promise<void> {
  if (!initPromise) {
    initPromise = i18n
      .use(initReactI18next)
      .init({
        resources,
        lng: language,
        // English is the documented fallback (Assumption A13: "English is the default
        // until an admin changes it") — used only if a key is somehow missing from the
        // active language's resource file, never as a live runtime switch target.
        fallbackLng: 'en',
        interpolation: { escapeValue: false }, // React already escapes output.
      })
      .then(() => undefined);
  }
  return initPromise;
}

export default i18n;
