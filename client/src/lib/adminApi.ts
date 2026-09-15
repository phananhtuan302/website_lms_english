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
  AdminFlashcardSetSummaryDTO,
  AdminGrammarTopicSummaryDTO,
  AdminTestSummaryDTO,
  AdminUserDTO,
  CreateUserRequest,
  ResetPasswordRequest,
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
};
