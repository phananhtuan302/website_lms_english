import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { SettingsDTO } from '@platform/shared';
import App from './App';
import './index.css';
import { initI18n } from './i18n/i18n';
import { apiRequest } from './lib/apiClient';
import { applyTheme } from './lib/themePalettes';
import { applyUiStyle } from './lib/uiStyles';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

const root = createRoot(rootElement);

/**
 * Site-wide i18n + theme bootstrap (T-067, Phase 10 localization; theme added 2026-09).
 * Both the UI language and the brand color theme are single, admin-controlled settings
 * read from the same server call (`GET /api/settings`, public — no login required) — NOT
 * a per-user or browser-detected preference (PROJECT_PLAN Guiding Principle 3, extended
 * the same way to theme). Both MUST be applied BEFORE the app's routes render, so there
 * is never a flash of the wrong language or theme; the brief loading state below covers
 * the one round-trip this takes. If the settings fetch ever fails (e.g. API unreachable),
 * language falls back to the documented default (`en`, Assumption A13) and theme simply
 * keeps `index.css`'s `sunset` default, rather than blocking the app from loading at all.
 */
root.render(<p className="p-8 text-center text-base-black/60">Loading...</p>);

async function bootstrap() {
  let language: SettingsDTO['language'] = 'en';
  try {
    const settings = await apiRequest<SettingsDTO>('/api/settings');
    language = settings.language;
    // Same "read once at boot, before the first render" approach as the language above —
    // see `themePalettes.ts`'s doc comment. `index.css`'s `:root` already holds the
    // `sunset` default, so a failed fetch here just leaves that in place, unlike language
    // which needs an explicit fallback value to pass to `initI18n`.
    applyTheme(settings.themeId);
    applyUiStyle(settings.uiStyle);
  } catch {
    // Keep the 'en' default — see doc comment above.
  }

  await initI18n(language);

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
