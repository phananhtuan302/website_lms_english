/**
 * Reads the shared "AI Content Tools" connection (`Settings.aiTools*`, see that model's
 * doc comment in `schema.prisma`) fresh on every call — same "no server restart needed to
 * pick up an admin edit" reasoning as `DbConfiguredEssayGradingProvider`
 * (`server/src/grading/index.ts`). Returns `null` whenever `feature`'s own enable flag is
 * off OR the connection isn't fully configured yet, so every caller has one place to decide
 * "fall back to mock/deterministic behavior" instead of re-deriving this check.
 */

import { prisma } from '../lib/prisma';
import { decryptSecret } from '../lib/secretCrypto';
import type { AiToolsChatConnectionConfig } from './aiChatClient';

export type AiToolsFeature = 'vocabGen' | 'grammarGen' | 'examImport' | 'teacherChat';

const ENABLED_FIELD = {
  vocabGen: 'vocabGenEnabled',
  grammarGen: 'grammarGenEnabled',
  examImport: 'examImportEnabled',
  teacherChat: 'teacherChatEnabled',
} as const satisfies Record<AiToolsFeature, string>;

export async function getAiToolsConnection(feature: AiToolsFeature): Promise<AiToolsChatConnectionConfig | null> {
  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  if (!settings) return null;

  const enabled = settings[ENABLED_FIELD[feature]];
  if (!enabled) return null;
  if (!settings.aiToolsApiBaseUrl || !settings.aiToolsApiKeyEncrypted || !settings.aiToolsModel) return null;

  return {
    baseUrl: settings.aiToolsApiBaseUrl,
    apiKey: decryptSecret(settings.aiToolsApiKeyEncrypted),
    model: settings.aiToolsModel,
  };
}
