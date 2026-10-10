/**
 * Thin wrappers around `apiRequest` for the admin-only endpoints (T-070 user management,
 * T-071 content-oversight browse-all lists). Same convention as `teacherApi.ts`: nothing
 * outside this file calls `fetch` directly against these routes.
 *
 * Note: actually viewing/editing/deleting one specific Test/Flashcard set/Grammar topic
 * does NOT go through this file — it reuses `teacherApi`'s existing endpoints as-is
 * (`getTest`/`updateTest`/`deleteTest`, etc.), since the server now accepts an admin
 * caller on those same routes (see each teacher router's doc comment). This file only
 * covers the admin-specific surfaces: the user roster and the "browse everything" lists.
 */

import type {
  AdminAttemptListResponseDTO,
  AdminFlashcardSetSummaryDTO,
  AdminGrammarTopicSummaryDTO,
  AdminTestSummaryDTO,
  AdminUserDTO,
  AiGradingSettingsDTO,
  AiToolsSettingsDTO,
  CreateUserRequest,
  ResetPasswordRequest,
  SettingsDTO,
  UpdateAiGradingSettingsRequest,
  UpdateAiToolsSettingsRequest,
  UpdateSettingsRequest,
  UpdateUserRequest,
  UserRole,
} from '@platform/shared';
import { apiRequest } from './apiClient';

const base = '/api/admin';

export const adminApi = {
  // --- User management (T-070) -------------------------------------------------------
  listUsers: (params: { role?: UserRole; search?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.role) query.set('role', params.role);
    if (params.search) query.set('search', params.search);
    const qs = query.toString();
    return apiRequest<AdminUserDTO[]>(`${base}/users${qs ? `?${qs}` : ''}`);
  },
  createUser: (body: CreateUserRequest) =>
    apiRequest<AdminUserDTO>(`${base}/users`, { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (userId: string, body: UpdateUserRequest) =>
    apiRequest<AdminUserDTO>(`${base}/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  resetPassword: (userId: string, body: ResetPasswordRequest) =>
    apiRequest<{ ok: true }>(`${base}/users/${userId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteUser: (userId: string) => apiRequest<void>(`${base}/users/${userId}`, { method: 'DELETE' }),

  // --- Content oversight "browse everything" (T-071) ---------------------------------
  listAllTests: () => apiRequest<AdminTestSummaryDTO[]>(`${base}/tests`),
  listAllFlashcardSets: () => apiRequest<AdminFlashcardSetSummaryDTO[]>(`${base}/flashcard-sets`),
  listAllGrammarTopics: () => apiRequest<AdminGrammarTopicSummaryDTO[]>(`${base}/grammar-topics`),

  // --- Scores/attempts management (T-072a) --------------------------------------------
  // Viewing one attempt's full detail and editing its essay/Speaking manual grade reuse
  // `teacherApi.getAttemptDetail`/`gradeEssayAnswer` as-is (those routes already accept
  // an admin caller) — only the system-wide browse list + delete are admin-specific.
  listAttempts: (params: { search?: string; page?: number; pageSize?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));
    const qs = query.toString();
    return apiRequest<AdminAttemptListResponseDTO>(`${base}/attempts${qs ? `?${qs}` : ''}`);
  },
  deleteAttempt: (attemptId: string) => apiRequest<void>(`${base}/attempts/${attemptId}`, { method: 'DELETE' }),

  // --- Site-wide language setting (T-072b) --------------------------------------------
  // `getSettings` hits the same PUBLIC `GET /api/settings` every page load already uses
  // (T-067) — reading the current value needs no admin privilege, only writing it does.
  getSettings: () => apiRequest<SettingsDTO>('/api/settings'),
  updateSettings: (body: UpdateSettingsRequest) =>
    apiRequest<SettingsDTO>(`${base}/settings`, { method: 'PATCH', body: JSON.stringify(body) }),

  // --- AI essay/writing grading config (2026-10) --------------------------------------
  // Admin-only on both verbs (unlike the public-GET language/theme/style above) — this
  // config includes whether a 3rd-party API key is set, so it never goes through the
  // public `/api/settings` endpoint.
  getAiGradingSettings: () => apiRequest<AiGradingSettingsDTO>(`${base}/settings/ai-grading`),
  updateAiGradingSettings: (body: UpdateAiGradingSettingsRequest) =>
    apiRequest<AiGradingSettingsDTO>(`${base}/settings/ai-grading`, { method: 'PATCH', body: JSON.stringify(body) }),

  // --- AI Content Tools config (2026-10) ----------------------------------------------
  // Separate connection + toggles from AI Grading above — backs 4 newer teacher-authoring
  // features (vocab/grammar generation, exam-image import, teacher chat assistant).
  getAiToolsSettings: () => apiRequest<AiToolsSettingsDTO>(`${base}/settings/ai-tools`),
  updateAiToolsSettings: (body: UpdateAiToolsSettingsRequest) =>
    apiRequest<AiToolsSettingsDTO>(`${base}/settings/ai-tools`, { method: 'PATCH', body: JSON.stringify(body) }),
};
