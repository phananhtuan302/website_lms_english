import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { SettingsDTO } from '@platform/shared';
import App from './App';
import './index.css';
import { initI18n } from './i18n/i18n';
import { apiRequest } from './lib/apiClient';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

const root = createRoot(rootElement);

/**
 * Site-wide i18n bootstrap (T-067, Phase 10 localization). The current UI language is a
 * single, admin-controlled setting read from the server (`GET /api/settings`, public —
 * no login required) — NOT a per-user or browser-detected preference (PROJECT_PLAN
 * Guiding Principle 3). i18next MUST be initialized to that language BEFORE the app's
 * routes render, so there is never a flash of the wrong language; the brief loading
 * state below covers the one round-trip this takes. If the settings fetch ever fails
 * (e.g. API unreachable), fall back to the documented default (`en`, Assumption A13)
 * rather than blocking the app from loading at all.
 */
root.render(<p className="p-8 text-center text-base-black/60">Loading...</p>);

async function bootstrap() {
  let language: SettingsDTO['language'] = 'en';
  try {
    const settings = await apiRequest<SettingsDTO>('/api/settings');
    language = settings.language;
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
