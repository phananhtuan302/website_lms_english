/**
 * Thin wrappers around `apiRequest` for the student-facing join (T-011), take-test
 * runtime (T-012), grading (T-013), and result (T-014) endpoints. Same convention as
 * `lib/teacherApi.ts` — nothing outside this file calls `fetch` against these routes
 * directly.
 */

import type {
  AttemptDetailDTO,
  AttemptResultResponseDTO,
  AttemptSummaryDTO,
  JoinAsGuestRequest,
  JoinAsGuestResponse,
  JoinByCodeRequest,
  JoinSessionResponse,
  JoinTokenCheckResponse,
  PracticeTestSummaryDTO,
  RecordTabSwitchResponse,
  SaveAnswerRequest,
  StudentAnnouncementsResponseDTO,
  StudentAssignmentsResponseDTO,
  StudentCalendarResponseDTO,
  StudentGradesResponseDTO,
  StudentNotificationsResponseDTO,
  StudentUnitTestsResponseDTO,
  StudentVocabularyCheckSummaryDTO,
  SubmitAttemptResponse,
  SubmitSpeakingAnswerRequest,
  SubmitSpeakingAnswerResponse,
  UnitLeaderboardResponseDTO,
} from '@platform/shared';
import { apiRequest } from './apiClient';

export const studentApi = {
  /** Public — works even when logged out, so the join page can show "you're about to
   * join <test title>" before prompting login. */
  checkJoinToken: (token: string) =>
    apiRequest<JoinTokenCheckResponse>(`/api/sessions/join/${token}`),

  /** Requires a logged-in `student`. May return `{ joined: false, startAt }` if the
   * session has a scheduled start that hasn't arrived yet (2026-10) — see
   * `JoinSessionResponse`'s doc comment. */
  joinSession: (token: string) =>
    apiRequest<JoinSessionResponse>(`/api/sessions/join/${token}`, { method: 'POST' }),

  /** Manual-fallback-code equivalents of the token-based check/join above (2026-10). */
  checkJoinCode: (code: string) =>
    apiRequest<JoinTokenCheckResponse>(`/api/sessions/join-by-code/${encodeURIComponent(code)}`),
  joinSessionByCode: (code: string) =>
    apiRequest<JoinSessionResponse>('/api/sessions/join-by-code', {
      method: 'POST',
      body: JSON.stringify({ code } satisfies JoinByCodeRequest),
    }),

  /** No-account join (2026-10, `TestSession.allowGuests`) — public, no auth header sent
   * (the caller isn't logged in yet, that's the whole point). Returns a JWT the caller
   * must store exactly like a normal login response. */
  joinSessionAsGuest: (token: string, name: string) =>
    apiRequest<JoinAsGuestResponse>(`/api/sessions/join/${token}/guest`, {
      method: 'POST',
      body: JSON.stringify({ name } satisfies JoinAsGuestRequest),
    }),
  joinSessionByCodeAsGuest: (code: string, name: string) =>
    apiRequest<JoinAsGuestResponse>('/api/sessions/join-by-code/guest', {
      method: 'POST',
      body: JSON.stringify({ code, name } satisfies JoinByCodeRequest & JoinAsGuestRequest),
    }),

  listMyAttempts: () => apiRequest<AttemptSummaryDTO[]>('/api/attempts'),
  getAttempt: (attemptId: string) => apiRequest<AttemptDetailDTO>(`/api/attempts/${attemptId}`),
  saveAnswer: (attemptId: string, questionId: string, body: SaveAnswerRequest) =>
    apiRequest<{ questionId: string }>(`/api/attempts/${attemptId}/answers/${questionId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  submitAttempt: (attemptId: string) =>
    apiRequest<SubmitAttemptResponse>(`/api/attempts/${attemptId}/submit`, { method: 'POST' }),
  // T-092: `AttemptResultResponseDTO` is a discriminated union on `scoresPublished` — the
  // full `AttemptResultDTO` when released, or the narrower `AttemptResultPendingDTO`
  // (score/breakdown withheld) when the teacher hasn't published scores for this
  // student's class yet.
  getResult: (attemptId: string) =>
    apiRequest<AttemptResultResponseDTO>(`/api/attempts/${attemptId}/result`),

  // --- Speaking answers (T-052–T-054) ------------------------------------------------
  // T-064: must be called the moment a timed Speaking question is first shown, before
  // recording/submitting — anchors the server-side response-window check.
  startSpeakingWindow: (attemptId: string, questionId: string) =>
    apiRequest<{ speakingWindowStartedAt: string }>(
      `/api/attempts/${attemptId}/questions/${questionId}/speaking-window/start`,
      { method: 'POST' },
    ),
  submitSpeakingAnswer: (attemptId: string, questionId: string, body: SubmitSpeakingAnswerRequest) =>
    apiRequest<SubmitSpeakingAnswerResponse>(
      `/api/attempts/${attemptId}/questions/${questionId}/speaking-answer`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  // --- Global tab-switch / exit detection (T-044) -----------------------------------
  recordTabSwitch: (attemptId: string) =>
    apiRequest<RecordTabSwitchResponse>(`/api/attempts/${attemptId}/tab-switch`, { method: 'POST' }),

  // --- Home self-practice (T-040) ---------------------------------------------------
  listPracticeTests: () => apiRequest<PracticeTestSummaryDTO[]>('/api/tests'),
  startPractice: (testId: string) =>
    apiRequest<JoinSessionResponse>(`/api/tests/${testId}/practice`, { method: 'POST' }),

  // --- Unit Tests (T-036) + Unit Test leaderboard (T-037) ---------------------------
  // "Taking" one reuses `startPractice` above (`POST /api/tests/:testId/practice`) —
  // same self-practice endpoint, no separate start-attempt call.
  listUnitTests: () => apiRequest<StudentUnitTestsResponseDTO>('/api/student/unit-tests'),
  getUnitLeaderboard: (unitId: string) =>
    apiRequest<UnitLeaderboardResponseDTO>(`/api/units/${unitId}/leaderboard`),

  // --- Vocabulary Check (T-038) ------------------------------------------------------
  // Also taken via `startPractice` above — access is enforced server-side by
  // `TestAssignment` (see `practice.routes.ts`).
  listVocabularyChecks: () =>
    apiRequest<StudentVocabularyCheckSummaryDTO[]>('/api/student/vocabulary-checks'),

  // --- Unified "Bài cần làm" home (T-105, Phase 13) ----------------------------------
  // One list of everything assigned to my class for its current semester, each row with a
  // server-derived status. "Làm bài" on an `open` row still goes through `startPractice`
  // above — the list never bypasses the start endpoint's own checks.
  listAssignments: () => apiRequest<StudentAssignmentsResponseDTO>('/api/student/assignments'),

  // --- "Điểm của tôi" (T-110, Phase 14) ----------------------------------------------
  // My own grades for one semester of my class (default = the current one). Scores only
  // come back for tests whose scores are published.
  getGrades: (periodId?: string) =>
    apiRequest<StudentGradesResponseDTO>(
      periodId ? `/api/student/grades?periodId=${encodeURIComponent(periodId)}` : '/api/student/grades',
    ),

  // --- Class announcements "Thông báo từ giáo viên" (T-108) --------------------------
  // My own class's announcements, pinned first then newest first (at most 30).
  listAnnouncements: () =>
    apiRequest<StudentAnnouncementsResponseDTO>('/api/student/announcements'),

  // --- Reminders (T-109): the notification bell + the "Lịch" agenda page --------------
  getNotifications: () =>
    apiRequest<StudentNotificationsResponseDTO>('/api/student/notifications'),
  getCalendar: () => apiRequest<StudentCalendarResponseDTO>('/api/student/calendar'),
};
