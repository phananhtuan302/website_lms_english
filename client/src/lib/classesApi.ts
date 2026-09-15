/**
 * Public class list (T-074, Phase 12): `GET /api/classes` needs no auth token, so it
 * lives in its own tiny module rather than `teacherApi.ts`/`studentApi.ts` — it's called
 * from `RegisterPage.tsx`, before any session exists at all.
 */

import type { PublicClassSummaryDTO } from '@platform/shared';
import { apiRequest } from './apiClient';

export const classesApi = {
  listPublicClasses: () => apiRequest<PublicClassSummaryDTO[]>('/api/classes'),
};
