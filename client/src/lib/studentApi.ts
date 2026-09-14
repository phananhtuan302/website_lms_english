/**
 * Thin wrappers around `apiRequest` for the student-facing join (T-011), take-test
 * runtime (T-012), grading (T-013), and result (T-014) endpoints. Same convention as
 * `lib/teacherApi.ts` — nothing outside this file calls `fetch` against these routes
 * directly.
 */

import type {
  AttemptDetailDTO,
  AttemptResultDTO,
  AttemptSummaryDTO,
  JoinSessionResponse,
  JoinTokenCheckResponse,
  PracticeTestSummaryDTO,
  RecordTabSwitchResponse,
  SaveAnswerRequest,
  SubmitAttemptResponse,
} from '@platform/shared';
import { apiRequest } from './apiClient';

export const studentApi = {
  /** Public — works even when logged out, so the join page can show "you're about to
   * join <test title>" before prompting login. */
  checkJoinToken: (token: string) =>
    apiRequest<JoinTokenCheckResponse>(`/api/sessions/join/${token}`),

  /** Requires a logged-in `student`. */
  joinSession: (token: string) =>
    apiRequest<JoinSessionResponse>(`/api/sessions/join/${token}`, { method: 'POST' }),

  listMyAttempts: () => apiRequest<AttemptSummaryDTO[]>('/api/attempts'),
  getAttempt: (attemptId: string) => apiRequest<AttemptDetailDTO>(`/api/attempts/${attemptId}`),
  saveAnswer: (attemptId: string, questionId: string, body: SaveAnswerRequest) =>
    apiRequest<{ questionId: string }>(`/api/attempts/${attemptId}/answers/${questionId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  submitAttempt: (attemptId: string) =>
    apiRequest<SubmitAttemptResponse>(`/api/attempts/${attemptId}/submit`, { method: 'POST' }),
  getResult: (attemptId: string) => apiRequest<AttemptResultDTO>(`/api/attempts/${attemptId}/result`),

  // --- Global tab-switch / exit detection (T-044) -----------------------------------
  recordTabSwitch: (attemptId: string) =>
    apiRequest<RecordTabSwitchResponse>(`/api/attempts/${attemptId}/tab-switch`, { method: 'POST' }),

  // --- Home self-practice (T-040) ---------------------------------------------------
  listPracticeTests: () => apiRequest<PracticeTestSummaryDTO[]>('/api/tests'),
  startPractice: (testId: string) =>
    apiRequest<JoinSessionResponse>(`/api/tests/${testId}/practice`, { method: 'POST' }),
};
